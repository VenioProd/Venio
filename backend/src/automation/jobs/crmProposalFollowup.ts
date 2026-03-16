// ─────────────────────────────────────────────────────────────
// crm.proposal_followup
// Rappel de suivi après envoi de proposition (5 jours)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'crm.proposal_followup',
  title: 'Relance suivi proposition commerciale',
  domain: 'crm',
  triggerType: 'cron',
  schedule: '09:00',
  channels: ['in_app'],
  recipientStrategy: ['lead_owner'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `crm.proposal:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Lead = mongoose.model('Lead')

    const fiveDaysAgo = new Date(ctx.now.getTime() - 5 * 24 * 3600_000)

    const leads = await Lead.find({
      status: 'PROPOSAL',
      statusChangedAt: { $lt: fiveDaysAgo },
      isArchived: { $ne: true },
      assignedTo: { $ne: null },
    }).populate('assignedTo', '_id name')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    for (const lead of leads) {
      const assignee = lead.assignedTo as { _id: unknown; name?: string } | null
      if (!assignee) continue

      const assigneeId = (assignee._id as object).toString()
      const daysSinceProposal = Math.floor((ctx.now.getTime() - new Date(lead.statusChangedAt).getTime()) / 86400_000)

      await createNotification({
        recipient: assigneeId,
        type: 'CRM_FOLLOWUP' as never,
        title: `Relance proposition : ${lead.company || lead.contactName}`,
        message: `La proposition pour "${lead.company || lead.contactName}" a été envoyée il y a ${daysSinceProposal}j. Pensez à relancer le prospect !`,
        link: '/admin/crm',
      })

      actionsExecuted.push(`proposal_followup:lead:${(lead._id as object).toString()}`)
      if (!recipientsNotified.includes(assigneeId)) {
        recipientsNotified.push(assigneeId)
      }
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { leadsFound: leads.length },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
