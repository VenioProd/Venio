// ─────────────────────────────────────────────────────────────
// messaging.unread_client_messages
// Alerte messages clients non lus depuis plus de 24h
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'messaging.unread_client_messages',
  title: 'Alerte messages clients non lus',
  domain: 'messaging',
  triggerType: 'cron',
  schedule: '09:00',
  channels: ['in_app'],
  recipientStrategy: ['admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `messaging.unread:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Message = mongoose.model('Message')
    const User = mongoose.model('User')

    const twentyFourHoursAgo = new Date(ctx.now.getTime() - 24 * 3600_000)

    // Get all admin user IDs
    const adminUsers = await User.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN'] },
      isActive: { $ne: false },
    }).select('_id')

    const adminIds = adminUsers.map((a) => a._id)

    // Get all client user IDs
    const clientUsers = await User.find({
      role: 'CLIENT',
    }).select('_id')

    const clientIds = clientUsers.map((c) => c._id)

    if (clientIds.length === 0) {
      return { actionsExecuted: ['skipped:no_clients'], recipientsNotified: [] }
    }

    // Find messages from clients, older than 24h, not read by any admin
    const unreadMessages = await Message.find({
      sender: { $in: clientIds },
      createdAt: { $lt: twentyFourHoursAgo },
      readBy: { $not: { $elemMatch: { $in: adminIds } } },
    }).populate('project', 'name')
      .populate('sender', 'name companyName')

    if (unreadMessages.length === 0) {
      return {
        actionsExecuted: ['check_completed:no_unread'],
        recipientsNotified: [],
        details: { unreadCount: 0 },
      }
    }

    // Group by project
    const byProject = new Map<string, { projectName: string; count: number; projectId: string }>()

    for (const msg of unreadMessages) {
      const project = msg.project as { _id?: unknown; name?: string } | null
      const projectId = project?._id ? (project._id as object).toString() : 'unknown'
      const projectName = project?.name || 'Projet inconnu'

      const entry = byProject.get(projectId)
      if (entry) {
        entry.count++
      } else {
        byProject.set(projectId, { projectName, count: 1, projectId })
      }
    }

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    const summary = Array.from(byProject.values())
      .map((p) => `• ${p.projectName} : ${p.count} message(s) non lu(s)`)
      .join('\n')

    // Notify all admins
    for (const admin of adminUsers) {
      await createNotification({
        recipient: (admin._id as object).toString(),
        type: 'MESSAGE_UNREAD' as never,
        title: `${unreadMessages.length} message(s) client non lu(s)`,
        message: summary,
        link: '/admin/messagerie',
      })
      recipientsNotified.push((admin._id as object).toString())
    }

    actionsExecuted.push(`unread_alert:${unreadMessages.length}_messages:${byProject.size}_projects`)

    return {
      actionsExecuted,
      recipientsNotified,
      details: {
        totalUnread: unreadMessages.length,
        projectsAffected: byProject.size,
        breakdown: Object.fromEntries(byProject),
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
