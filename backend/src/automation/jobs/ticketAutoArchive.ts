// ─────────────────────────────────────────────────────────────
// ticket.auto_archive
// Archivage automatique des tickets résolus/fermés (> 30 jours)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'
import logger from '../../lib/logger.js'

const ARCHIVE_AFTER_DAYS = 30

const definition: AutomationDefinition = {
  key: 'ticket.auto_archive',
  title: 'Archivage automatique des tickets',
  domain: 'tickets',
  triggerType: 'cron',
  schedule: '03:00',
  channels: ['system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 1,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `ticket.auto_archive:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const InternalTicket = mongoose.model('InternalTicket')

    const cutoffDate = new Date(ctx.now.getTime() - ARCHIVE_AFTER_DAYS * 24 * 3600_000)

    const result = await InternalTicket.updateMany(
      {
        status: { $in: ['RESOLU', 'FERME'] },
        isArchived: { $ne: true },
        updatedAt: { $lt: cutoffDate },
      },
      {
        $set: {
          isArchived: true,
          archivedAt: ctx.now,
        },
      }
    )

    const archivedCount = result.modifiedCount || 0

    logger.info(`[TICKET AUTO-ARCHIVE] ${archivedCount} ticket(s) archivé(s)`)

    return {
      actionsExecuted: [`auto_archive:${archivedCount}_tickets`],
      recipientsNotified: [],
      details: { archivedCount },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
