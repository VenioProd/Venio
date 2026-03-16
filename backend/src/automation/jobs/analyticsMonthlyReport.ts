// ─────────────────────────────────────────────────────────────
// analytics.monthly_report
// Rapport mensuel comparatif (mois N vs mois N-1)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

function trend(current: number, previous: number): string {
  if (previous === 0 && current === 0) return '='
  if (previous === 0) return '↑'
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct > 0) return `↑ +${pct}%`
  if (pct < 0) return `↓ ${pct}%`
  return '='
}

const definition: AutomationDefinition = {
  key: 'analytics.monthly_report',
  title: 'Rapport mensuel comparatif',
  domain: 'analytics',
  triggerType: 'cron',
  schedule: '08:00',
  channels: ['in_app'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `analytics.monthly:${ctx.monthKey}`,

  evaluate: async (ctx) => ctx.now.getDate() === 1,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Project = mongoose.model('Project')
    const Lead = mongoose.model('Lead')
    const BillingDocument = mongoose.model('BillingDocument')
    const User = mongoose.model('User')

    const firstOfThisMonth = new Date(ctx.now.getFullYear(), ctx.now.getMonth(), 1)
    const firstOfLastMonth = new Date(ctx.now.getFullYear(), ctx.now.getMonth() - 1, 1)
    const firstOfTwoMonthsAgo = new Date(ctx.now.getFullYear(), ctx.now.getMonth() - 2, 1)

    // --- Last month metrics ---
    const lastMonthActiveProjects = await Project.countDocuments({
      status: 'EN_COURS',
      createdAt: { $lt: firstOfThisMonth },
      $or: [{ endDate: null }, { endDate: { $gte: firstOfLastMonth } }],
    })

    const lastMonthCompletedProjects = await Project.countDocuments({
      status: 'TERMINE',
      updatedAt: { $gte: firstOfLastMonth, $lt: firstOfThisMonth },
    })

    const lastMonthNewLeads = await Lead.countDocuments({
      createdAt: { $gte: firstOfLastMonth, $lt: firstOfThisMonth },
    })

    const lastMonthWonLeads = await Lead.countDocuments({
      status: 'WON',
      updatedAt: { $gte: firstOfLastMonth, $lt: firstOfThisMonth },
    })

    const lastMonthLostLeads = await Lead.countDocuments({
      status: 'LOST',
      updatedAt: { $gte: firstOfLastMonth, $lt: firstOfThisMonth },
    })

    const lastMonthRevenueAgg = await BillingDocument.aggregate([
      {
        $match: {
          type: 'FACTURE',
          status: 'PAYEE',
          paidAt: { $gte: firstOfLastMonth, $lt: firstOfThisMonth },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalTTC' } } },
    ])
    const lastMonthRevenue = lastMonthRevenueAgg[0]?.total || 0

    // --- Previous month metrics (N-2) ---
    const prevMonthActiveProjects = await Project.countDocuments({
      status: 'EN_COURS',
      createdAt: { $lt: firstOfLastMonth },
      $or: [{ endDate: null }, { endDate: { $gte: firstOfTwoMonthsAgo } }],
    })

    const prevMonthCompletedProjects = await Project.countDocuments({
      status: 'TERMINE',
      updatedAt: { $gte: firstOfTwoMonthsAgo, $lt: firstOfLastMonth },
    })

    const prevMonthNewLeads = await Lead.countDocuments({
      createdAt: { $gte: firstOfTwoMonthsAgo, $lt: firstOfLastMonth },
    })

    const prevMonthWonLeads = await Lead.countDocuments({
      status: 'WON',
      updatedAt: { $gte: firstOfTwoMonthsAgo, $lt: firstOfLastMonth },
    })

    const prevMonthLostLeads = await Lead.countDocuments({
      status: 'LOST',
      updatedAt: { $gte: firstOfTwoMonthsAgo, $lt: firstOfLastMonth },
    })

    const prevMonthRevenueAgg = await BillingDocument.aggregate([
      {
        $match: {
          type: 'FACTURE',
          status: 'PAYEE',
          paidAt: { $gte: firstOfTwoMonthsAgo, $lt: firstOfLastMonth },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalTTC' } } },
    ])
    const prevMonthRevenue = prevMonthRevenueAgg[0]?.total || 0

    // Build comparison
    const lastWonLostRatio = lastMonthWonLeads + lastMonthLostLeads > 0
      ? `${lastMonthWonLeads}/${lastMonthLostLeads}`
      : '0/0'
    const prevWonLostRatio = prevMonthWonLeads + prevMonthLostLeads > 0
      ? `${prevMonthWonLeads}/${prevMonthLostLeads}`
      : '0/0'

    const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2 })

    const monthLabel = firstOfLastMonth.toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    })

    const message = [
      `Rapport mensuel — ${monthLabel}`,
      '',
      `• Projets actifs : ${lastMonthActiveProjects} ${trend(lastMonthActiveProjects, prevMonthActiveProjects)}`,
      `• Projets terminés : ${lastMonthCompletedProjects} ${trend(lastMonthCompletedProjects, prevMonthCompletedProjects)}`,
      `• Nouveaux leads : ${lastMonthNewLeads} ${trend(lastMonthNewLeads, prevMonthNewLeads)}`,
      `• Ratio gagné/perdu : ${lastWonLostRatio} (précédent : ${prevWonLostRatio})`,
      `• CA encaissé : ${fmt(lastMonthRevenue)} EUR ${trend(lastMonthRevenue, prevMonthRevenue)}`,
    ].join('\n')

    const actionsExecuted: string[] = ['monthly_report_generated']
    const recipientsNotified: string[] = []

    const admins = await User.find({
      role: 'SUPER_ADMIN',
      isActive: { $ne: false },
    }).select('_id')

    for (const admin of admins) {
      await createNotification({
        recipient: (admin._id as object).toString(),
        type: 'ANALYTICS_REPORT' as never,
        title: `Rapport mensuel — ${monthLabel}`,
        message,
        link: '/admin/analytics',
      })
      recipientsNotified.push((admin._id as object).toString())
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: {
        month: ctx.monthKey,
        lastMonth: {
          activeProjects: lastMonthActiveProjects,
          completedProjects: lastMonthCompletedProjects,
          newLeads: lastMonthNewLeads,
          wonLeads: lastMonthWonLeads,
          lostLeads: lastMonthLostLeads,
          revenue: lastMonthRevenue,
        },
        previousMonth: {
          activeProjects: prevMonthActiveProjects,
          completedProjects: prevMonthCompletedProjects,
          newLeads: prevMonthNewLeads,
          wonLeads: prevMonthWonLeads,
          lostLeads: prevMonthLostLeads,
          revenue: prevMonthRevenue,
        },
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
