// ─────────────────────────────────────────────────────────────
// project.waiting_on_client
// Alerte livrables non consultés par le client et messages non lus
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'project.waiting_on_client',
  title: 'Projets en attente du client',
  domain: 'projects',
  triggerType: 'cron',
  schedule: '09:15',
  channels: ['in_app'],
  recipientStrategy: ['project_manager'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `project.waiting_client:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Project = mongoose.model('Project')
    const ProjectItem = mongoose.model('ProjectItem')
    const Message = mongoose.model('Message')

    const threeDaysAgo = new Date(ctx.now.getTime() - 3 * 24 * 3600_000)

    const projects = await Project.find({
      status: 'EN_COURS',
      isArchived: { $ne: true },
    }).populate('assignedTo', '_id name').populate('client', '_id')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    for (const project of projects) {
      const issues: string[] = []

      // Check deliverables never viewed by client, created > 3 days ago
      const unseenDeliverables = await ProjectItem.countDocuments({
        project: project._id,
        type: 'LIVRABLE',
        isVisible: true,
        viewedAt: null,
        createdAt: { $lt: threeDaysAgo },
      })

      if (unseenDeliverables > 0) {
        issues.push(`${unseenDeliverables} livrable(s) non consulté(s) par le client`)
      }

      // Check unread messages by client
      const clientRef = project.client as { _id: unknown } | null
      if (clientRef) {
        const clientId = (clientRef._id as object).toString()
        const unreadMessages = await Message.countDocuments({
          project: project._id,
          readBy: { $nin: [clientId] },
        })

        if (unreadMessages > 0) {
          issues.push(`${unreadMessages} message(s) non lu(s) par le client`)
        }
      }

      if (issues.length === 0) continue

      const manager = project.assignedTo as { _id: unknown; name?: string } | null
      if (!manager) continue

      const managerId = (manager._id as object).toString()
      const message = `Projet "${project.name}" — en attente du client :\n${issues.map(i => `• ${i}`).join('\n')}`

      await createNotification({
        recipient: managerId,
        type: 'PROJECT_ALERT' as never,
        title: `En attente client : ${project.name}`,
        message,
        link: `/admin/projets/${(project._id as object).toString()}`,
      })

      if (!recipientsNotified.includes(managerId)) {
        recipientsNotified.push(managerId)
      }
      actionsExecuted.push(`waiting_client:project:${(project._id as object).toString()}`)
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { projectsChecked: projects.length },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
