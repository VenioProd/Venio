// ─────────────────────────────────────────────────────────────
// Phase 1: report.weekly_manager_summary
// Rapport hebdomadaire manager — KPI resume
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import { sendWeeklyReportEmail } from '../../lib/email.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'report.weekly_manager_summary',
  title: 'Rapport hebdomadaire manager',
  domain: 'analytics',
  triggerType: 'cron',
  schedule: 'monday:07:00',
  channels: ['email', 'in_app'],
  recipientStrategy: ['admins', 'super_admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `report.weekly_manager_summary:${ctx.weekKey}`,

  evaluate: async (ctx) => {
    return ctx.now.getDay() === 1 // Monday only
  },

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const User = mongoose.model('User')
    const Task = mongoose.model('Task')
    const Project = mongoose.model('Project')
    const Lead = mongoose.model('Lead')
    const BillingDocument = mongoose.model('BillingDocument')

    const weekAgo = new Date(ctx.now.getTime() - 7 * 24 * 3600_000)

    // Gather KPIs
    const [
      activeProjects,
      completedThisWeek,
      totalTasks,
      completedTasks,
      overdueTasks,
      newLeads,
      wonLeads,
      lostLeads,
      unpaidInvoices,
    ] = await Promise.all([
      Project.countDocuments({ status: 'EN_COURS', isArchived: { $ne: true } }),
      Project.countDocuments({ status: 'TERMINE', updatedAt: { $gte: weekAgo } }),
      Task.countDocuments({ status: { $nin: ['TERMINE', 'VALIDE'] } }),
      Task.countDocuments({ status: { $in: ['TERMINE', 'VALIDE'] }, updatedAt: { $gte: weekAgo } }),
      Task.countDocuments({ dueDate: { $lt: ctx.now }, status: { $nin: ['TERMINE', 'VALIDE'] } }),
      Lead.countDocuments({ createdAt: { $gte: weekAgo } }),
      Lead.countDocuments({ status: 'WON', updatedAt: { $gte: weekAgo } }),
      Lead.countDocuments({ status: 'LOST', updatedAt: { $gte: weekAgo } }),
      BillingDocument.countDocuments({
        type: 'FACTURE',
        status: { $in: ['ENVOYEE', 'EN_ATTENTE'] },
        dueDate: { $lt: ctx.now },
      }),
    ])

    const stats = {
      activeProjects,
      completedThisWeek,
      totalOpenTasks: totalTasks,
      completedTasksThisWeek: completedTasks,
      overdueTasks,
      newLeads,
      wonLeads,
      lostLeads,
      unpaidInvoices,
    }

    // Send to admins
    const admins = await User.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN'] },
      isActive: { $ne: false },
    }).select('_id email name')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    for (const admin of admins) {
      // In-app digest
      const summaryLines = [
        `Projets actifs: ${activeProjects} | Termines cette semaine: ${completedThisWeek}`,
        `Taches ouvertes: ${totalTasks} | Terminees: ${completedTasks} | En retard: ${overdueTasks}`,
        `Leads: +${newLeads} | Won: ${wonLeads} | Lost: ${lostLeads}`,
        `Factures impayees: ${unpaidInvoices}`,
      ]

      await createNotification({
        recipient: admin._id.toString(),
        type: 'WEEKLY_REPORT' as never,
        title: `Rapport hebdomadaire — Semaine ${ctx.weekKey}`,
        message: summaryLines.join('\n'),
        link: '/admin/analytics',
      })

      // Email
      if (admin.email) {
        await sendWeeklyReportEmail({
          to: admin.email,
          stats: {
            newLeads,
            qualified: 0,
            won: wonLeads,
            lost: lostLeads,
            totalActive: activeProjects,
            pipelineValue: 0,
            conversionRate: newLeads > 0 ? Math.round((wonLeads / newLeads) * 100) : 0,
          },
        })
      }

      recipientsNotified.push(admin._id.toString())
    }

    actionsExecuted.push(`weekly_report:${ctx.weekKey}`)

    return {
      actionsExecuted,
      recipientsNotified,
      details: stats,
    }
  },
}

export function register() {
  registerAutomation(definition)
}
