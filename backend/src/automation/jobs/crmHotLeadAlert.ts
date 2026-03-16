// ─────────────────────────────────────────────────────────────
// crm.hot_lead_untreated_alert
// Alerte leads chauds non traités depuis 48h
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'crm.hot_lead_untreated_alert',
  title: 'Alerte leads chauds non traités',
  domain: 'crm',
  triggerType: 'cron',
  schedule: '08:30',
  channels: ['in_app', 'email'],
  recipientStrategy: ['lead_owner', 'admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `crm.hot_lead:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Lead = mongoose.model('Lead')
    const User = mongoose.model('User')

    const fortyEightHoursAgo = new Date(ctx.now.getTime() - 48 * 3600_000)

    const hotLeads = await Lead.find({
      leadTemperature: { $in: ['CHAUD', 'TRES_CHAUD'] },
      status: { $nin: ['WON', 'LOST'] },
      isArchived: { $ne: true },
      updatedAt: { $lt: fortyEightHoursAgo },
    }).populate('assignedTo', '_id email name')

    if (hotLeads.length === 0) {
      return { actionsExecuted: [], recipientsNotified: [], details: { hotLeadsFound: 0 } }
    }

    // Group by assignee
    const byAssignee = new Map<string, { user: { _id: string; name: string }; leads: typeof hotLeads }>()
    const unassigned: typeof hotLeads = []

    for (const lead of hotLeads) {
      const assignee = lead.assignedTo as { _id: unknown; email?: string; name?: string } | null
      if (!assignee) {
        unassigned.push(lead)
        continue
      }
      const id = (assignee._id as object).toString()
      if (!byAssignee.has(id)) {
        byAssignee.set(id, { user: { _id: id, name: assignee.name || '' }, leads: [] })
      }
      byAssignee.get(id)!.leads.push(lead)
    }

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    // Notify each assignee
    for (const [userId, { leads }] of byAssignee) {
      const leadNames = leads.map(l => l.company || l.contactName).join(', ')
      await createNotification({
        recipient: userId,
        type: 'CRM_ALERT' as never,
        title: `${leads.length} lead(s) chaud(s) sans suivi depuis 48h`,
        message: `Leads en attente : ${leadNames}`,
        link: '/admin/crm',
      })
      recipientsNotified.push(userId)
      actionsExecuted.push(`hot_lead_alert:owner:${userId}:${leads.length}_leads`)
    }

    // Notify admins (summary of all)
    const admins = await User.find({ role: { $in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: { $ne: false } }).select('_id')
    const totalSummary = `${hotLeads.length} lead(s) chaud(s)/très chaud(s) sans activité depuis 48h${unassigned.length > 0 ? ` dont ${unassigned.length} non assigné(s)` : ''}`

    for (const admin of admins) {
      const adminId = (admin._id as object).toString()
      if (!recipientsNotified.includes(adminId)) {
        await createNotification({
          recipient: adminId,
          type: 'CRM_ALERT' as never,
          title: `Leads chauds non traités`,
          message: totalSummary,
          link: '/admin/crm',
        })
        recipientsNotified.push(adminId)
      }
    }

    actionsExecuted.push(`hot_lead_alert:total:${hotLeads.length}`)

    return {
      actionsExecuted,
      recipientsNotified,
      details: { hotLeadsFound: hotLeads.length, unassigned: unassigned.length, ownersNotified: byAssignee.size },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
