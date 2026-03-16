// ─────────────────────────────────────────────────────────────
// crm.conversion_drop_alert
// Alerte hebdomadaire si le taux de conversion chute
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'crm.conversion_drop_alert',
  title: 'Alerte chute du taux de conversion',
  domain: 'crm',
  triggerType: 'cron',
  schedule: 'monday:08:00',
  channels: ['in_app'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `crm.conversion_drop:${ctx.weekKey}`,

  evaluate: async (ctx: AutomationContext) => {
    return ctx.now.getDay() === 1
  },

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Lead = mongoose.model('Lead')
    const User = mongoose.model('User')

    const thirtyDaysAgo = new Date(ctx.now.getTime() - 30 * 24 * 3600_000)
    const sixtyDaysAgo = new Date(ctx.now.getTime() - 60 * 24 * 3600_000)

    // Current period: last 30 days
    const currentWon = await Lead.countDocuments({
      status: 'WON',
      updatedAt: { $gte: thirtyDaysAgo },
    })

    // Previous period: 60-30 days ago
    const previousWon = await Lead.countDocuments({
      status: 'WON',
      updatedAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
    })

    // Also compare total new leads
    const currentNewLeads = await Lead.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    })

    const previousNewLeads = await Lead.countDocuments({
      createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
    })

    const actionsExecuted: string[] = ['conversion_analysis']
    const recipientsNotified: string[] = []

    const shouldAlert = previousWon > 0 && currentWon < previousWon * 0.5

    if (shouldAlert) {
      const dropPercent = previousWon > 0
        ? Math.round(((previousWon - currentWon) / previousWon) * 100)
        : 0

      const message = [
        `Leads gagnés (30 derniers jours) : ${currentWon} (vs ${previousWon} période précédente, -${dropPercent}%)`,
        `Nouveaux leads : ${currentNewLeads} (vs ${previousNewLeads} période précédente)`,
        '',
        'Une baisse significative du taux de conversion a été détectée.',
      ].join('\n')

      const admins = await User.find({ role: 'SUPER_ADMIN', isActive: { $ne: false } }).select('_id')

      for (const admin of admins) {
        const adminId = (admin._id as object).toString()
        await createNotification({
          recipient: adminId,
          type: 'CRM_ALERT' as never,
          title: `Chute conversion CRM : -${dropPercent}% de leads gagnés`,
          message,
          link: '/admin/crm',
        })
        recipientsNotified.push(adminId)
      }

      actionsExecuted.push(`conversion_drop_alert:${dropPercent}%`)
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: {
        currentWon,
        previousWon,
        currentNewLeads,
        previousNewLeads,
        alertTriggered: shouldAlert,
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
