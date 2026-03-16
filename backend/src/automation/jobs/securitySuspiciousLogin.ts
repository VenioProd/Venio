// ─────────────────────────────────────────────────────────────
// V2.1: security.suspicious_login_detector
// Détecte les connexions suspectes (nouvel IP, horaire inhabituel)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'security.suspicious_login_detector',
  title: 'Détection connexions suspectes',
  domain: 'security',
  triggerType: 'cron',
  schedule: '06:00',
  channels: ['in_app', 'system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 1,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `security.suspicious_login:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const AuditLog = mongoose.model('AuditLog')
    const User = mongoose.model('User')

    const yesterday = new Date(ctx.now.getTime() - 24 * 3600_000)
    const thirtyDaysAgo = new Date(ctx.now.getTime() - 30 * 24 * 3600_000)

    // Get yesterday's successful logins
    const recentLogins = await AuditLog.find({
      action: 'LOGIN_SUCCESS',
      createdAt: { $gte: yesterday },
      userId: { $ne: null },
    }).select('userId email ip createdAt')

    if (recentLogins.length === 0) {
      return {
        actionsExecuted: ['check:no_logins'],
        recipientsNotified: [],
      }
    }

    interface SuspiciousEvent {
      email: string
      reason: string
      ip: string
      time: string
    }

    const suspicious: SuspiciousEvent[] = []

    // Group by user
    const byUser = new Map<string, typeof recentLogins>()
    for (const login of recentLogins) {
      const uid = login.userId?.toString() || ''
      if (!byUser.has(uid)) byUser.set(uid, [])
      byUser.get(uid)!.push(login)
    }

    for (const [userId, logins] of byUser) {
      // Get historical IPs for this user (last 30 days, excluding yesterday)
      const historicalLogins = await AuditLog.find({
        action: 'LOGIN_SUCCESS',
        userId,
        createdAt: { $gte: thirtyDaysAgo, $lt: yesterday },
      }).select('ip createdAt')

      const knownIps = new Set(historicalLogins.map((l) => l.ip).filter(Boolean))

      for (const login of logins) {
        // 1. New IP never seen before
        if (login.ip && knownIps.size > 0 && !knownIps.has(login.ip)) {
          suspicious.push({
            email: login.email,
            reason: `Nouvelle IP : ${login.ip}`,
            ip: login.ip,
            time: new Date(login.createdAt).toLocaleTimeString('fr-FR'),
          })
        }

        // 2. Unusual hour (between 01:00 and 05:00)
        const hour = new Date(login.createdAt).getHours()
        if (hour >= 1 && hour <= 5) {
          // Check if user normally logs in at this hour
          const nightLogins = historicalLogins.filter((l) => {
            const h = new Date(l.createdAt).getHours()
            return h >= 1 && h <= 5
          })
          if (nightLogins.length === 0) {
            suspicious.push({
              email: login.email,
              reason: `Connexion à une heure inhabituelle : ${hour}h`,
              ip: login.ip,
              time: new Date(login.createdAt).toLocaleTimeString('fr-FR'),
            })
          }
        }
      }
    }

    const actionsExecuted = [`suspicious_check:${recentLogins.length}_logins:${suspicious.length}_suspicious`]
    const recipientsNotified: string[] = []

    if (suspicious.length > 0) {
      // Log suspicious events
      for (const event of suspicious) {
        await AuditLog.create({
          email: event.email,
          action: 'SUSPICIOUS_LOGIN',
          ip: event.ip,
          metadata: { reason: event.reason, time: event.time },
        })
      }

      // Notify super admins
      const admins = await User.find({
        role: 'SUPER_ADMIN',
        isActive: { $ne: false },
      }).select('_id')

      const summary = suspicious
        .slice(0, 10)
        .map((s) => `• ${s.email} — ${s.reason} (${s.time})`)
        .join('\n')

      for (const admin of admins) {
        await createNotification({
          recipient: admin._id.toString(),
          type: 'SECURITY_ALERT' as never,
          title: `${suspicious.length} connexion(s) suspecte(s) détectée(s)`,
          message: summary,
          link: '/admin/audit',
        })
        recipientsNotified.push(admin._id.toString())
      }
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { loginsChecked: recentLogins.length, suspiciousCount: suspicious.length },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
