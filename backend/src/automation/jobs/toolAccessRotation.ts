// ─────────────────────────────────────────────────────────────
// V2.1: toolaccess.rotation_reminder
// Rappel de rotation des credentials outils (> 90 jours)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const ROTATION_DAYS = 90

const definition: AutomationDefinition = {
  key: 'toolaccess.rotation_reminder',
  title: 'Rappel rotation credentials outils',
  domain: 'security',
  triggerType: 'cron',
  schedule: 'monday:09:00',
  channels: ['in_app'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 1,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `toolaccess.rotation:${ctx.weekKey}`,

  evaluate: async (ctx) => ctx.now.getDay() === 1,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const ToolAccess = mongoose.model('ToolAccess')
    const User = mongoose.model('User')

    const threshold = new Date(ctx.now.getTime() - ROTATION_DAYS * 24 * 3600_000)

    // Find tools with old passwords
    const staleTools = await ToolAccess.find({
      $or: [
        { lastRotatedAt: { $lt: threshold } },
        { lastRotatedAt: null, createdAt: { $lt: threshold } },
      ],
    }).select('name category lastRotatedAt createdAt')

    if (staleTools.length === 0) {
      return {
        actionsExecuted: ['check:all_rotated'],
        recipientsNotified: [],
      }
    }

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    const admins = await User.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN'] },
      isActive: { $ne: false },
    }).select('_id')

    const toolList = staleTools.map((t) => {
      const lastChanged = t.lastRotatedAt || t.createdAt
      const daysSince = Math.floor((ctx.now.getTime() - new Date(lastChanged).getTime()) / 86400_000)
      return `• ${t.name} (${t.category}) — ${daysSince}j sans rotation`
    })

    const summary = toolList.slice(0, 10).join('\n')

    for (const admin of admins) {
      await createNotification({
        recipient: admin._id.toString(),
        type: 'SECURITY_ALERT' as never,
        title: `${staleTools.length} outil(s) avec credentials non rotatés (${ROTATION_DAYS}j+)`,
        message: summary + (toolList.length > 10 ? `\n... et ${toolList.length - 10} autre(s)` : ''),
        link: '/admin/tool-access',
      })
      recipientsNotified.push(admin._id.toString())
    }

    actionsExecuted.push(`rotation_reminder:${staleTools.length}_tools`)

    return {
      actionsExecuted,
      recipientsNotified,
      details: { staleCount: staleTools.length },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
