// ─────────────────────────────────────────────────────────────
// billing.monthly_treasury_summary
// Synthèse mensuelle de trésorerie (1er du mois)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'billing.monthly_treasury_summary',
  title: 'Synthèse mensuelle de trésorerie',
  domain: 'billing',
  triggerType: 'cron',
  schedule: '08:00',
  channels: ['in_app'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `billing.treasury:${ctx.monthKey}`,

  evaluate: async (ctx) => ctx.now.getDate() === 1,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const BillingDocument = mongoose.model('BillingDocument')
    const User = mongoose.model('User')

    // Previous month range
    const firstOfThisMonth = new Date(ctx.now.getFullYear(), ctx.now.getMonth(), 1)
    const firstOfLastMonth = new Date(ctx.now.getFullYear(), ctx.now.getMonth() - 1, 1)

    // Total issued: invoices created in the previous month
    const issuedAgg = await BillingDocument.aggregate([
      {
        $match: {
          type: 'FACTURE',
          createdAt: { $gte: firstOfLastMonth, $lt: firstOfThisMonth },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalTTC' } } },
    ])
    const totalIssued = issuedAgg[0]?.total || 0

    // Total paid: invoices paid in the previous month
    const paidAgg = await BillingDocument.aggregate([
      {
        $match: {
          type: 'FACTURE',
          status: 'PAYEE',
          paidAt: { $gte: firstOfLastMonth, $lt: firstOfThisMonth },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalTTC' } } },
    ])
    const totalPaid = paidAgg[0]?.total || 0

    // Total overdue: unpaid invoices past due date
    const overdueAgg = await BillingDocument.aggregate([
      {
        $match: {
          type: 'FACTURE',
          status: { $in: ['ENVOYEE', 'EN_ATTENTE'] },
          dueDate: { $lt: ctx.now },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalTTC' } } },
    ])
    const totalOverdue = overdueAgg[0]?.total || 0

    // Total outstanding: issued but not yet paid (regardless of due date)
    const outstandingAgg = await BillingDocument.aggregate([
      {
        $match: {
          type: 'FACTURE',
          status: { $in: ['ENVOYEE', 'EN_ATTENTE'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalTTC' } } },
    ])
    const totalOutstanding = outstandingAgg[0]?.total || 0

    const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2 })

    const message = [
      `Synthèse trésorerie — ${firstOfLastMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`,
      ``,
      `• Facturé : ${fmt(totalIssued)} EUR`,
      `• Encaissé : ${fmt(totalPaid)} EUR`,
      `• Impayé en retard : ${fmt(totalOverdue)} EUR`,
      `• En cours (non réglé) : ${fmt(totalOutstanding)} EUR`,
    ].join('\n')

    const actionsExecuted: string[] = ['treasury_summary_computed']
    const recipientsNotified: string[] = []

    const admins = await User.find({
      role: 'SUPER_ADMIN',
      isActive: { $ne: false },
    }).select('_id')

    for (const admin of admins) {
      await createNotification({
        recipient: (admin._id as object).toString(),
        type: 'BILLING_SUMMARY' as never,
        title: 'Synthèse trésorerie du mois',
        message,
        link: '/admin/billing',
      })
      recipientsNotified.push((admin._id as object).toString())
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { totalIssued, totalPaid, totalOverdue, totalOutstanding },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
