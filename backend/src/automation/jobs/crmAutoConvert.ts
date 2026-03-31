// ─────────────────────────────────────────────────────────────
// Phase 2: crm.auto_convert_won_lead
// Convertit automatiquement un lead WON en client
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'crm.auto_convert_won_lead',
  title: 'Conversion automatique lead gagné → client',
  domain: 'crm',
  triggerType: 'event',
  channels: ['in_app', 'email', 'system_log'],
  recipientStrategy: ['lead_owner', 'admins'],
  retryable: true,
  maxRetries: 3,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `crm.auto_convert:${ctx.meta?.leadId}`,

  evaluate: async (ctx) => {
    return ctx.meta?.newStatus === 'WON' && !!ctx.meta?.leadId
  },

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Lead = mongoose.model('Lead')
    const User = mongoose.model('User')

    const leadId = ctx.meta!.leadId as string
    const lead = await Lead.findById(leadId)

    if (!lead) {
      return {
        actionsExecuted: ['skipped:lead_not_found'],
        recipientsNotified: [],
      }
    }

    // Check if a client already exists with this email
    const existingClient = lead.contactEmail
      ? await User.findOne({ email: lead.contactEmail, role: 'CLIENT' })
      : null

    if (existingClient) {
      return {
        actionsExecuted: ['skipped:client_already_exists'],
        recipientsNotified: [],
        details: { existingClientId: existingClient._id.toString() },
      }
    }

    // Create client account (without password — they'll use password reset)
    const bcrypt = await import('bcryptjs')
    const tempPassword = Math.random().toString(36).slice(-12)
    const passwordHash = await bcrypt.hash(tempPassword, 10)

    const newClient = await User.create({
      email: lead.contactEmail || `${lead.company.toLowerCase().replace(/\s+/g, '-')}@client.venio.paris`,
      passwordHash,
      role: 'CLIENT',
      name: lead.contactName || lead.company,
      companyName: lead.company,
      phone: lead.phone,
      source: 'CRM_CONVERSION',
      status: 'ACTIF',
      onboardingStatus: 'EN_ATTENTE',
    })

    // Mark lead as converted
    lead.convertedToClientId = newClient._id
    lead.convertedAt = ctx.now
    await lead.save()

    const actionsExecuted = [`converted:lead:${leadId}:client:${newClient._id}`]
    const recipientsNotified: string[] = []

    // Notify admins
    const admins = await User.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN'] },
      isActive: { $ne: false },
    }).select('_id')

    for (const admin of admins) {
      await createNotification({
        recipient: admin._id.toString(),
        type: 'CRM_CONVERSION' as never,
        title: `Lead converti : ${lead.company}`,
        message: `Le lead "${lead.company}" (${lead.contactName}) a été automatiquement converti en client`,
        link: `/admin/clients/${newClient._id}`,
      })
      recipientsNotified.push(admin._id.toString())
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: {
        leadId,
        newClientId: newClient._id.toString(),
        company: lead.company,
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
