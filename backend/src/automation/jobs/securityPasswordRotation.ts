// ─────────────────────────────────────────────────────────────
// V2.1: security.password_rotation_reminder
// Rappel de rotation de mot de passe (admins, > 90 jours)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const ROTATION_DAYS = 90

const definition: AutomationDefinition = {
  key: 'security.password_rotation_reminder',
  title: 'Rappel rotation mot de passe',
  domain: 'security',
  triggerType: 'cron',
  schedule: '08:00',
  channels: ['in_app'],
  recipientStrategy: ['all_internal_active'],
  retryable: true,
  maxRetries: 1,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN', 'RH'],

  buildIdempotencyKey: (ctx) => `security.password_rotation:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const User = mongoose.model('User')

    const threshold = new Date(ctx.now.getTime() - ROTATION_DAYS * 24 * 3600_000)

    // Find internal users whose password hasn't been changed in 90+ days
    const users = await User.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN', 'RH'] },
      isActive: { $ne: false },
      $or: [
        { passwordChangedAt: { $lt: threshold } },
        { passwordChangedAt: null, createdAt: { $lt: threshold } },
      ],
    }).select('_id name email passwordChangedAt createdAt')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    for (const user of users) {
      const lastChanged = user.passwordChangedAt || user.createdAt
      const daysSince = Math.floor(
        (ctx.now.getTime() - new Date(lastChanged).getTime()) / 86400_000
      )

      await createNotification({
        recipient: user._id.toString(),
        type: 'SECURITY_ALERT' as never,
        title: `Mot de passe non changé depuis ${daysSince} jours`,
        message: `Pour la sécurité de votre compte, veuillez changer votre mot de passe. Dernier changement il y a ${daysSince} jour(s).`,
        link: '/admin/profil',
      })

      recipientsNotified.push(user._id.toString())
      actionsExecuted.push(`password_reminder:${user._id}:${daysSince}d`)
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { usersChecked: users.length },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
