// ─────────────────────────────────────────────────────────────
// ticket.sla_breach_alert
// Alerte SLA dépassé pour les tickets internes
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

// SLA thresholds in hours
const SLA_THRESHOLDS: Record<string, number> = {
  URGENTE: 4,
  HAUTE: 4,
  NORMALE: 24,
}

const definition: AutomationDefinition = {
  key: 'ticket.sla_breach_alert',
  title: 'Alerte SLA tickets internes',
  domain: 'tickets',
  triggerType: 'cron',
  schedule: '10:00',
  channels: ['in_app'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `ticket.sla:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const InternalTicket = mongoose.model('InternalTicket')
    const User = mongoose.model('User')

    const breachedTickets: Array<{
      id: string
      title: string
      priority: string
      hoursOpen: number
      slaHours: number
    }> = []

    // Check high/urgent priority tickets (4h SLA)
    const highUrgentCutoff = new Date(ctx.now.getTime() - 4 * 3600_000)
    const highUrgentTickets = await InternalTicket.find({
      status: 'OUVERT',
      priority: { $in: ['HAUTE', 'URGENTE'] },
      createdAt: { $lt: highUrgentCutoff },
    })

    for (const ticket of highUrgentTickets) {
      const hoursOpen = Math.floor(
        (ctx.now.getTime() - new Date(ticket.createdAt).getTime()) / 3600_000
      )
      breachedTickets.push({
        id: (ticket._id as object).toString(),
        title: ticket.title,
        priority: ticket.priority,
        hoursOpen,
        slaHours: SLA_THRESHOLDS[ticket.priority] || 4,
      })
    }

    // Check normal priority tickets (24h SLA)
    const normalCutoff = new Date(ctx.now.getTime() - 24 * 3600_000)
    const normalTickets = await InternalTicket.find({
      status: 'OUVERT',
      priority: 'NORMALE',
      createdAt: { $lt: normalCutoff },
    })

    for (const ticket of normalTickets) {
      const hoursOpen = Math.floor(
        (ctx.now.getTime() - new Date(ticket.createdAt).getTime()) / 3600_000
      )
      breachedTickets.push({
        id: (ticket._id as object).toString(),
        title: ticket.title,
        priority: ticket.priority,
        hoursOpen,
        slaHours: SLA_THRESHOLDS[ticket.priority] || 24,
      })
    }

    const actionsExecuted: string[] = [`sla_check:${breachedTickets.length}_breaches`]
    const recipientsNotified: string[] = []

    if (breachedTickets.length === 0) {
      return {
        actionsExecuted: ['sla_check:no_breaches'],
        recipientsNotified: [],
        details: { breachedCount: 0 },
      }
    }

    const summary = breachedTickets
      .slice(0, 10)
      .map(
        (t) =>
          `• [${t.priority}] "${t.title}" — ouvert depuis ${t.hoursOpen}h (SLA: ${t.slaHours}h)`
      )
      .join('\n')

    const admins = await User.find({
      role: 'SUPER_ADMIN',
      isActive: { $ne: false },
    }).select('_id')

    for (const admin of admins) {
      await createNotification({
        recipient: (admin._id as object).toString(),
        type: 'TICKET_SLA' as never,
        title: `${breachedTickets.length} ticket(s) en dépassement SLA`,
        message: summary + (breachedTickets.length > 10 ? `\n... et ${breachedTickets.length - 10} autre(s)` : ''),
        link: '/admin/tickets',
      })
      recipientsNotified.push((admin._id as object).toString())
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: {
        breachedCount: breachedTickets.length,
        tickets: breachedTickets,
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
