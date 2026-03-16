// ─────────────────────────────────────────────────────────────
// Phase 1: project.risk_of_delay_alert
// Alerte projet en risque de retard
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'project.risk_of_delay_alert',
  title: 'Alerte projet en risque de retard',
  domain: 'projects',
  triggerType: 'cron',
  schedule: '08:00',
  channels: ['in_app', 'email'],
  recipientStrategy: ['project_manager', 'admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `project.risk_of_delay_alert:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Project = mongoose.model('Project')
    const Task = mongoose.model('Task')

    // Active projects with a deadline in the next 14 days
    const threshold14d = new Date(ctx.now.getTime() + 14 * 24 * 3600_000)

    const projects = await Project.find({
      status: 'EN_COURS',
      isArchived: { $ne: true },
      endDate: { $lte: threshold14d, $gte: ctx.now },
    }).populate('assignedTo', 'email name')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    for (const project of projects) {
      // Calculate risk: count open tasks vs total
      const [totalTasks, openTasks] = await Promise.all([
        Task.countDocuments({ project: project._id }),
        Task.countDocuments({
          project: project._id,
          status: { $nin: ['TERMINE', 'VALIDE'] },
        }),
      ])

      if (totalTasks === 0) continue

      const completionRate = ((totalTasks - openTasks) / totalTasks) * 100
      const daysUntilDeadline = Math.floor(
        (new Date(project.endDate).getTime() - ctx.now.getTime()) / 86400_000
      )

      // Risk: many open tasks + close deadline
      const isAtRisk = completionRate < 70 && daysUntilDeadline <= 7
      const isCritical = completionRate < 50 && daysUntilDeadline <= 3

      if (!isAtRisk) continue

      const riskLevel = isCritical ? 'CRITIQUE' : 'ATTENTION'
      const manager = project.assignedTo as { _id: unknown; email?: string; name?: string } | null

      // Notify manager
      if (manager) {
        await createNotification({
          recipient: (manager._id as object).toString(),
          type: 'PROJECT_RISK' as never,
          title: `Projet a risque [${riskLevel}] : ${project.name}`,
          message: `${openTasks} taches ouvertes sur ${totalTasks} (${Math.round(completionRate)}% fait) — deadline dans ${daysUntilDeadline}j`,
          link: `/admin/projets/${project._id}`,
        })
        recipientsNotified.push((manager._id as object).toString())
      }

      // If critical, also notify all admins
      if (isCritical) {
        const User = mongoose.model('User')
        const admins = await User.find({ role: 'SUPER_ADMIN' }).select('_id')
        for (const admin of admins) {
          if (admin._id.toString() !== manager?._id?.toString()) {
            await createNotification({
              recipient: admin._id.toString(),
              type: 'PROJECT_RISK' as never,
              title: `CRITIQUE : "${project.name}" a ${daysUntilDeadline}j de la deadline`,
              message: `Seulement ${Math.round(completionRate)}% complete, ${openTasks} taches restantes`,
              link: `/admin/projets/${project._id}`,
            })
            recipientsNotified.push(admin._id.toString())
          }
        }
      }

      actionsExecuted.push(`risk_alert:${riskLevel}:project:${project._id}`)
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { projectsAnalyzed: projects.length },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
