// ─────────────────────────────────────────────────────────────
// V2.1: security.permissions_review
// Audit mensuel des permissions — comptes inactifs, custom perms
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'security.permissions_review',
  title: 'Audit mensuel des permissions',
  domain: 'security',
  triggerType: 'cron',
  schedule: 'monday:09:00', // first Monday of month (checked in evaluate)
  channels: ['in_app', 'system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 1,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `security.permissions_review:${ctx.monthKey}`,

  evaluate: async (ctx) => {
    // Only run on the first Monday of the month
    return ctx.now.getDay() === 1 && ctx.now.getDate() <= 7
  },

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const User = mongoose.model('User')

    interface ReviewIssue {
      category: string
      description: string
      severity: 'info' | 'warning' | 'error'
    }

    const issues: ReviewIssue[] = []

    // 1. Users with permission overrides (granted or denied)
    const customPermUsers = await User.find({
      $or: [
        { grantedPermissions: { $exists: true, $not: { $size: 0 } } },
        { deniedPermissions: { $exists: true, $not: { $size: 0 } } },
      ],
      role: { $in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RH', 'COMPTABLE', 'VIEWER'] },
    }).select('name email role grantedPermissions deniedPermissions')

    if (customPermUsers.length > 0) {
      for (const u of customPermUsers) {
        const grantedCount = (u.grantedPermissions as string[] | undefined)?.length || 0
        const deniedCount = (u.deniedPermissions as string[] | undefined)?.length || 0
        issues.push({
          category: 'Permissions custom',
          description: `${u.name} (${u.email}, ${u.role}) — ${grantedCount} accordée(s), ${deniedCount} retirée(s)`,
          severity: 'info',
        })
      }
    }

    // 2. Admin accounts inactive for 60+ days (no login)
    const sixtyDaysAgo = new Date(ctx.now.getTime() - 60 * 24 * 3600_000)
    const inactiveAdmins = await User.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN', 'RH'] },
      isActive: { $ne: false },
      $or: [
        { lastLoginAt: { $lt: sixtyDaysAgo } },
        { lastLoginAt: null, createdAt: { $lt: sixtyDaysAgo } },
      ],
    }).select('name email role lastLoginAt createdAt')

    for (const u of inactiveAdmins) {
      const lastSeen = u.lastLoginAt || u.createdAt
      const daysSince = Math.floor((ctx.now.getTime() - new Date(lastSeen).getTime()) / 86400_000)
      issues.push({
        category: 'Compte admin inactif',
        description: `${u.name} (${u.email}, ${u.role}) — dernière connexion il y a ${daysSince}j`,
        severity: daysSince > 90 ? 'error' : 'warning',
      })
    }

    // 3. Active accounts with SUPER_ADMIN role (count check)
    const superAdminCount = await User.countDocuments({
      role: 'SUPER_ADMIN',
      isActive: { $ne: false },
    })

    if (superAdminCount > 3) {
      issues.push({
        category: 'Trop de super admins',
        description: `${superAdminCount} comptes SUPER_ADMIN actifs — vérifier si tous sont nécessaires`,
        severity: 'warning',
      })
    }

    // 4. Clients with admin-level status but CLIENT role (data integrity)
    const clientsWithAdminAccess = await User.countDocuments({
      role: 'CLIENT',
      $or: [
        { grantedPermissions: { $exists: true, $not: { $size: 0 } } },
        { deniedPermissions: { $exists: true, $not: { $size: 0 } } },
      ],
    })

    if (clientsWithAdminAccess > 0) {
      issues.push({
        category: 'Permissions client anormales',
        description: `${clientsWithAdminAccess} client(s) ont des permissions custom — à vérifier`,
        severity: 'error',
      })
    }

    const actionsExecuted = [`permissions_review:${issues.length}_issues`]
    const recipientsNotified: string[] = []

    if (issues.length > 0) {
      const admins = await User.find({
        role: 'SUPER_ADMIN',
        isActive: { $ne: false },
      }).select('_id')

      const errorCount = issues.filter((i) => i.severity === 'error').length
      const warningCount = issues.filter((i) => i.severity === 'warning').length

      const summary = issues
        .slice(0, 10)
        .map((i) => {
          const icon = i.severity === 'error' ? 'ERREUR' : i.severity === 'warning' ? 'ATTENTION' : 'INFO'
          return `• [${icon}] ${i.category}: ${i.description}`
        })
        .join('\n')

      for (const admin of admins) {
        await createNotification({
          recipient: admin._id.toString(),
          type: 'SECURITY_ALERT' as never,
          title: `Audit permissions : ${errorCount} erreur(s), ${warningCount} avertissement(s)`,
          message: summary + (issues.length > 10 ? `\n... et ${issues.length - 10} autre(s)` : ''),
          link: '/admin/audit',
        })
        recipientsNotified.push(admin._id.toString())
      }
    }

    console.log(`[SECURITY] Permissions review: ${issues.length} issue(s)`)

    return {
      actionsExecuted,
      recipientsNotified,
      details: { issues },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
