// ─────────────────────────────────────────────────────────────
// project.silent_project_alert
// Alerte pour les projets sans activité depuis 14 jours
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'project.silent_project_alert',
  title: 'Alerte projets silencieux',
  domain: 'projects',
  triggerType: 'cron',
  schedule: '09:00',
  channels: ['in_app'],
  recipientStrategy: ['project_manager', 'admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `project.silent:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Project = mongoose.model('Project')
    const Task = mongoose.model('Task')
    const User = mongoose.model('User')

    const threshold = new Date(ctx.now.getTime() - 14 * 24 * 3600_000)

    // Projects EN_COURS, not archived, updatedAt older than 14 days
    const projects = await Project.find({
      status: 'EN_COURS',
      isArchived: { $ne: true },
      updatedAt: { $lt: threshold },
    }).populate('assignedTo', '_id name')

    const silentProjects: Array<{ name: string; id: string; daysSilent: number }> = []

    for (const project of projects) {
      // Check if any task was updated in the last 14 days
      const recentTaskActivity = await Task.find({
        project: project._id,
        updatedAt: { $gte: threshold },
      }).countDocuments()

      if (recentTaskActivity === 0) {
        const daysSilent = Math.floor((ctx.now.getTime() - new Date(project.updatedAt).getTime()) / 86400_000)
        silentProjects.push({
          name: project.name,
          id: (project._id as object).toString(),
          daysSilent,
        })
      }
    }

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    if (silentProjects.length > 0) {
      const summary = silentProjects
        .map(p => `• "${p.name}" — ${p.daysSilent}j sans activité`)
        .join('\n')

      const admins = await User.find({ role: { $in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: { $ne: false } }).select('_id')

      for (const admin of admins) {
        const adminId = (admin._id as object).toString()
        await createNotification({
          recipient: adminId,
          type: 'PROJECT_ALERT' as never,
          title: `${silentProjects.length} projet(s) silencieux depuis 14j+`,
          message: summary,
          link: '/admin/projets',
        })
        recipientsNotified.push(adminId)
      }

      actionsExecuted.push(`silent_alert:${silentProjects.length}_projects`)
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { projectsChecked: projects.length, silentProjects: silentProjects.length, silentList: silentProjects },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
