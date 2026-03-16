// ─────────────────────────────────────────────────────────────
// Phase 2: analytics.project_client_health_score
// Calcul hebdomadaire du score de santé client
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

type HealthStatus = 'EXCELLENT' | 'BON' | 'ATTENTION' | 'CRITIQUE'

function computeHealthScore(metrics: {
  activeProjects: number
  overdueTaskRate: number
  unpaidInvoices: number
  daysSinceLastContact: number
  completionRate: number
}): { score: number; status: HealthStatus } {
  let score = 100

  // Penalize overdue tasks (max -30)
  score -= Math.min(metrics.overdueTaskRate * 50, 30)

  // Penalize unpaid invoices (max -25)
  score -= Math.min(metrics.unpaidInvoices * 10, 25)

  // Penalize no contact (max -20)
  if (metrics.daysSinceLastContact > 30) score -= 10
  if (metrics.daysSinceLastContact > 60) score -= 10

  // Bonus for high completion rate
  if (metrics.completionRate > 80) score += 5

  // Penalize if no active projects
  if (metrics.activeProjects === 0) score -= 15

  score = Math.max(0, Math.min(100, Math.round(score)))

  let status: HealthStatus = 'EXCELLENT'
  if (score < 40) status = 'CRITIQUE'
  else if (score < 60) status = 'ATTENTION'
  else if (score < 80) status = 'BON'

  return { score, status }
}

const definition: AutomationDefinition = {
  key: 'analytics.project_client_health_score',
  title: 'Score de santé client',
  domain: 'analytics',
  triggerType: 'cron',
  schedule: 'monday:06:00',
  channels: ['in_app', 'system_log'],
  recipientStrategy: ['admins', 'super_admins'],
  retryable: true,
  maxRetries: 1,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `client_health:${ctx.weekKey}`,

  evaluate: async (ctx) => ctx.now.getDay() === 1,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const User = mongoose.model('User')
    const Project = mongoose.model('Project')
    const Task = mongoose.model('Task')
    const BillingDocument = mongoose.model('BillingDocument')

    const clients = await User.find({
      role: 'CLIENT',
      isActive: { $ne: false },
    }).select('_id name companyName lastContactAt healthStatus')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []
    const criticalClients: string[] = []

    for (const client of clients) {
      const clientId = client._id.toString()

      // Gather metrics
      const [activeProjects, totalTasks, completedTasks, overdueTasks, unpaidInvoices] = await Promise.all([
        Project.countDocuments({ client: clientId, status: 'EN_COURS', isArchived: { $ne: true } }),
        Task.countDocuments({ project: { $in: await Project.find({ client: clientId }).distinct('_id') } }),
        Task.countDocuments({
          project: { $in: await Project.find({ client: clientId }).distinct('_id') },
          status: { $in: ['TERMINE', 'VALIDE'] },
        }),
        Task.countDocuments({
          project: { $in: await Project.find({ client: clientId }).distinct('_id') },
          dueDate: { $lt: ctx.now },
          status: { $nin: ['TERMINE', 'VALIDE'] },
        }),
        BillingDocument.countDocuments({
          client: clientId,
          type: 'FACTURE',
          status: { $in: ['ENVOYEE', 'EN_ATTENTE'] },
          dueDate: { $lt: ctx.now },
        }),
      ])

      const overdueTaskRate = totalTasks > 0 ? overdueTasks / totalTasks : 0
      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 100
      const daysSinceLastContact = client.lastContactAt
        ? Math.floor((ctx.now.getTime() - new Date(client.lastContactAt).getTime()) / 86400_000)
        : 999

      const { score, status } = computeHealthScore({
        activeProjects,
        overdueTaskRate,
        unpaidInvoices,
        daysSinceLastContact,
        completionRate,
      })

      // Update client health status
      const previousStatus = client.healthStatus
      if (previousStatus !== status) {
        client.healthStatus = status
        await client.save()
      }

      if (status === 'CRITIQUE') {
        criticalClients.push(`${client.companyName || client.name} (${score}/100)`)
      }

      actionsExecuted.push(`health:client:${clientId}:${score}:${status}`)
    }

    // Alert admins about critical clients
    if (criticalClients.length > 0) {
      const admins = await User.find({
        role: { $in: ['SUPER_ADMIN', 'ADMIN'] },
        isActive: { $ne: false },
      }).select('_id')

      const summary = criticalClients.slice(0, 5).map((c) => `• ${c}`).join('\n')

      for (const admin of admins) {
        await createNotification({
          recipient: admin._id.toString(),
          type: 'CLIENT_HEALTH' as never,
          title: `${criticalClients.length} client(s) en état critique`,
          message: summary + (criticalClients.length > 5 ? `\n... et ${criticalClients.length - 5} autre(s)` : ''),
          link: '/admin/clients',
        })
        recipientsNotified.push(admin._id.toString())
      }
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: {
        clientsProcessed: clients.length,
        criticalCount: criticalClients.length,
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
