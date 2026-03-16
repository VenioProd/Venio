// ─────────────────────────────────────────────────────────────
// Phase 2: project.new_deliverable_client_notification
// Notifie le client quand un livrable est ajouté à son projet
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import { sendDeliverableNotificationEmail } from '../../lib/email.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'project.new_deliverable_client_notification',
  title: 'Notification client — nouveau livrable',
  domain: 'projects',
  triggerType: 'event',
  channels: ['in_app', 'email'],
  recipientStrategy: ['client_contact'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `deliverable_notify:${ctx.meta?.itemId}`,

  evaluate: async (ctx) => {
    return !!ctx.meta?.itemId && !!ctx.meta?.projectId
  },

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const ProjectItem = mongoose.model('ProjectItem')
    const Project = mongoose.model('Project')
    const User = mongoose.model('User')

    const itemId = ctx.meta!.itemId as string
    const projectId = ctx.meta!.projectId as string

    const item = await ProjectItem.findById(itemId)
    if (!item || item.type !== 'LIVRABLE') {
      return {
        actionsExecuted: ['skipped:not_a_deliverable'],
        recipientsNotified: [],
      }
    }

    const project = await Project.findById(projectId).populate('client', '_id email name')
    if (!project) {
      return {
        actionsExecuted: ['skipped:project_not_found'],
        recipientsNotified: [],
      }
    }

    const client = project.client as { _id?: unknown; email?: string; name?: string } | null
    if (!client?.email) {
      return {
        actionsExecuted: ['skipped:no_client_email'],
        recipientsNotified: [],
      }
    }

    const clientId = (client._id as object).toString()

    // In-app notification
    await createNotification({
      recipient: clientId,
      type: 'DELIVERABLE_ADDED' as never,
      title: `Nouveau livrable : ${item.title}`,
      message: `Un nouveau livrable "${item.title}" a été ajouté à votre projet "${project.name}"`,
      link: `/projets/${projectId}`,
    })

    // Email
    await sendDeliverableNotificationEmail({
      to: client.email,
      name: client.name || 'Client',
      projectName: project.name,
      deliverableName: item.title,
    })

    return {
      actionsExecuted: [`deliverable_notified:item:${itemId}:client:${clientId}`],
      recipientsNotified: [clientId],
      details: {
        itemTitle: item.title,
        projectName: project.name,
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
