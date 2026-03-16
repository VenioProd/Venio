// ─────────────────────────────────────────────────────────────
// Phase 1: billing.multi_stage_payment_followup
// Relance automatique de paiement multi-niveaux (J+3, J+7, J+15)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import { sendInvoiceReminderEmail } from '../../lib/email.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const REMINDER_STAGES = [3, 7, 15] // days past due

const definition: AutomationDefinition = {
  key: 'billing.multi_stage_payment_followup',
  title: 'Relance automatique de paiement multi-niveaux',
  domain: 'billing',
  triggerType: 'cron',
  schedule: '09:00',
  channels: ['email', 'in_app'],
  recipientStrategy: ['client_contact', 'admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `billing.payment_followup:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const BillingDocument = mongoose.model('BillingDocument')
    const User = mongoose.model('User')

    // Find unpaid invoices that are past due
    const unpaidInvoices = await BillingDocument.find({
      type: 'FACTURE',
      status: { $in: ['ENVOYEE', 'EN_ATTENTE'] },
      dueDate: { $lt: ctx.now },
    }).populate('client', 'email name')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    for (const invoice of unpaidInvoices) {
      const daysPastDue = Math.floor(
        (ctx.now.getTime() - new Date(invoice.dueDate).getTime()) / 86400_000
      )

      // Determine which stage we're at
      const currentStage = REMINDER_STAGES.find(
        (stage) => daysPastDue >= stage && daysPastDue < stage + 1
      )
      if (!currentStage) continue // not on a reminder day

      const client = invoice.client as { _id?: unknown; email?: string; name?: string } | null
      if (!client?.email) continue

      const amount = invoice.totalTTC?.toLocaleString('fr-FR') || invoice.totalHT?.toLocaleString('fr-FR') || '0'

      // Email client
      await sendInvoiceReminderEmail({
        to: client.email,
        name: client.name || 'Client',
        invoiceNumber: invoice.number || `FAC-${invoice._id}`,
        amount,
        daysPastDue,
      })

      // In-app notification for admins
      const admins = await User.find({
        role: { $in: ['SUPER_ADMIN', 'ADMIN'] },
      }).select('_id')

      for (const admin of admins) {
        await createNotification({
          recipient: admin._id.toString(),
          type: 'INVOICE_OVERDUE' as never,
          title: `Facture impayee J+${daysPastDue} : ${client.name}`,
          message: `Facture ${invoice.number || ''} de ${amount} EUR pour ${client.name} — ${daysPastDue} jours de retard`,
          link: `/admin/projets/${invoice.project}?tab=billing`,
        })

        if (!recipientsNotified.includes(admin._id.toString())) {
          recipientsNotified.push(admin._id.toString())
        }
      }

      recipientsNotified.push(client._id!.toString())
      actionsExecuted.push(`reminder_stage_${currentStage}:invoice:${invoice._id}`)
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { invoicesChecked: unpaidInvoices.length },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
