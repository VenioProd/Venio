// ─────────────────────────────────────────────────────────────
// V2.1: security.brute_force_alert
// Détecte les tentatives de brute force (>5 échecs / 10min par email)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const THRESHOLD = 5 // failed attempts
const WINDOW_MINUTES = 10

const definition: AutomationDefinition = {
  key: 'security.brute_force_alert',
  title: 'Détection brute force',
  domain: 'security',
  triggerType: 'cron',
  schedule: '00:05', // every hour at :05 (checked every 60s by scheduler)
  channels: ['in_app', 'system_log'],
  recipientStrategy: ['super_admins'],
  retryable: false,
  maxRetries: 0,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => {
    // Run every 5 minutes — use a 5-min block key
    const block = Math.floor(ctx.now.getMinutes() / 5)
    return `security.brute_force:${ctx.dateKey}:${ctx.now.getHours()}:${block}`
  },

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const AuditLog = mongoose.model('AuditLog')
    const User = mongoose.model('User')

    const windowStart = new Date(ctx.now.getTime() - WINDOW_MINUTES * 60_000)

    // Aggregate failed logins by email in the window
    const attacks = await AuditLog.aggregate([
      {
        $match: {
          action: 'LOGIN_FAILED',
          createdAt: { $gte: windowStart },
        },
      },
      {
        $group: {
          _id: '$email',
          count: { $sum: 1 },
          ips: { $addToSet: '$ip' },
          lastAttempt: { $max: '$createdAt' },
        },
      },
      {
        $match: { count: { $gte: THRESHOLD } },
      },
    ])

    if (attacks.length === 0) {
      return {
        actionsExecuted: ['check:no_brute_force'],
        recipientsNotified: [],
      }
    }

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    // Log brute force detection
    for (const attack of attacks) {
      await AuditLog.create({
        email: attack._id,
        action: 'BRUTE_FORCE_DETECTED',
        metadata: {
          failedAttempts: attack.count,
          ips: attack.ips,
          windowMinutes: WINDOW_MINUTES,
        },
      })
      actionsExecuted.push(`brute_force:${attack._id}:${attack.count}_attempts`)
    }

    // Notify super admins
    const admins = await User.find({
      role: 'SUPER_ADMIN',
      isActive: { $ne: false },
    }).select('_id')

    const summary = attacks
      .map((a: { _id: string; count: number; ips: string[] }) =>
        `• ${a._id} : ${a.count} échecs depuis ${a.ips.length} IP(s)`
      )
      .join('\n')

    for (const admin of admins) {
      await createNotification({
        recipient: admin._id.toString(),
        type: 'SECURITY_ALERT' as never,
        title: `Alerte sécurité : ${attacks.length} attaque(s) brute force détectée(s)`,
        message: summary,
        link: '/admin/audit',
      })
      recipientsNotified.push(admin._id.toString())
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { attacks: attacks.map((a: { _id: string; count: number }) => ({ email: a._id, attempts: a.count })) },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
