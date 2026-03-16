// ─────────────────────────────────────────────────────────────
// Phase 1: crm.inactive_lead_followup
// Relance automatique des leads inactifs
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import { sendColdLeadsReminderEmail } from '../../lib/email.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const DEFAULT_INACTIVE_DAYS = 7

const definition: AutomationDefinition = {
  key: 'crm.inactive_lead_followup',
  title: 'Relance automatique des leads inactifs',
  domain: 'crm',
  triggerType: 'cron',
  schedule: '09:00',
  channels: ['in_app', 'email'],
  recipientStrategy: ['lead_owner'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `crm.inactive_lead_followup:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Lead = mongoose.model('Lead')
    const User = mongoose.model('User')

    const inactiveDays = (ctx.settings.config?.inactiveDays as number) || DEFAULT_INACTIVE_DAYS
    const threshold = new Date(ctx.now.getTime() - inactiveDays * 24 * 3600_000)

    const inactiveLeads = await Lead.find({
      status: { $nin: ['WON', 'LOST'] },
      isArchived: { $ne: true },
      updatedAt: { $lt: threshold },
      assignedTo: { $ne: null },
    }).populate('assignedTo', 'email name')

    // Group leads by assignee
    const byAssignee = new Map<string, { user: { _id: string; email: string; name: string }; leads: typeof inactiveLeads }>()

    for (const lead of inactiveLeads) {
      const assignee = lead.assignedTo as { _id: unknown; email?: string; name?: string } | null
      if (!assignee?.email) continue
      const id = (assignee._id as object).toString()
      if (!byAssignee.has(id)) {
        byAssignee.set(id, {
          user: { _id: id, email: assignee.email!, name: assignee.name || '' },
          leads: [],
        })
      }
      byAssignee.get(id)!.leads.push(lead)
    }

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    for (const [userId, { user, leads }] of byAssignee) {
      // In-app notification
      await createNotification({
        recipient: userId,
        type: 'CRM_FOLLOWUP' as never,
        title: `${leads.length} lead(s) inactif(s) depuis ${inactiveDays}j`,
        message: `Leads sans activite : ${leads.map(l => l.company).join(', ')}`,
        link: '/admin/crm',
      })

      // Email grouped
      await sendColdLeadsReminderEmail({
        to: user.email,
        assigneeName: user.name,
        leads: leads.map(l => ({
          company: l.company,
          contactName: l.contactName,
          daysSinceContact: Math.floor((ctx.now.getTime() - new Date(l.updatedAt).getTime()) / 86400_000),
        })),
      })

      recipientsNotified.push(userId)
      actionsExecuted.push(`followup:${leads.length}_leads:owner:${userId}`)
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { totalInactiveLeads: inactiveLeads.length, ownersNotified: byAssignee.size },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
