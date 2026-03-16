// ─────────────────────────────────────────────────────────────
// billing.critical_unpaid_alert
// Alerte factures impayées critiques (> 30 jours de retard)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const CRITICAL_DAYS = 30

const definition: AutomationDefinition = {
  key: 'billing.critical_unpaid_alert',
  title: 'Alerte factures impayées critiques',
  domain: 'billing',
  triggerType: 'cron',
  schedule: '09:00',
  channels: ['in_app', 'email'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `billing.critical_unpaid:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const BillingDocument = mongoose.model('BillingDocument')
    const User = mongoose.model('User')

    const cutoffDate = new Date(ctx.now.getTime() - CRITICAL_DAYS * 24 * 3600_000)

    const criticalInvoices = await BillingDocument.find({
      type: 'FACTURE',
      status: { $in: ['ENVOYEE', 'EN_ATTENTE'] },
      dueDate: { $lt: cutoffDate },
    }).populate('client', 'name companyName healthStatus')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    const admins = await User.find({
      role: 'SUPER_ADMIN',
      isActive: { $ne: false },
    }).select('_id')

    for (const invoice of criticalInvoices) {
      const client = invoice.client as {
        _id?: unknown
        name?: string
        companyName?: string
        healthStatus?: string
        save?: () => Promise<unknown>
      } | null

      const clientName = client?.companyName || client?.name || 'Client inconnu'
      const amount = invoice.totalTTC?.toLocaleString('fr-FR') || invoice.totalHT?.toLocaleString('fr-FR') || '0'
      const daysOverdue = Math.floor(
        (ctx.now.getTime() - new Date(invoice.dueDate).getTime()) / 86400_000
      )

      // Update client health status to CRITIQUE if not already
      if (client && client.healthStatus !== 'CRITIQUE' && client.save) {
        client.healthStatus = 'CRITIQUE'
        await client.save()
        actionsExecuted.push(`health_update:client:${(client._id as object).toString()}:CRITIQUE`)
      }

      // Notify SUPER_ADMINs
      for (const admin of admins) {
        await createNotification({
          recipient: (admin._id as object).toString(),
          type: 'INVOICE_CRITICAL' as never,
          title: `Facture critique : ${clientName} — ${daysOverdue}j de retard`,
          message: `Facture ${invoice.number || ''} de ${amount} EUR pour ${clientName} — ${daysOverdue} jours de retard (seuil critique dépassé)`,
          link: `/admin/projets/${invoice.project}?tab=billing`,
        })

        if (!recipientsNotified.includes((admin._id as object).toString())) {
          recipientsNotified.push((admin._id as object).toString())
        }
      }

      actionsExecuted.push(`critical_alert:invoice:${(invoice._id as object).toString()}`)
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { criticalInvoicesFound: criticalInvoices.length },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
