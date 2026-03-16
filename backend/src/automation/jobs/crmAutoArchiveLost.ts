// ─────────────────────────────────────────────────────────────
// crm.auto_archive_lost
// Archive automatiquement les leads LOST depuis 30+ jours
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'crm.auto_archive_lost',
  title: 'Archivage automatique des leads perdus',
  domain: 'crm',
  triggerType: 'cron',
  schedule: '03:00',
  channels: ['system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 1,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `crm.archive_lost:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Lead = mongoose.model('Lead')

    const thirtyDaysAgo = new Date(ctx.now.getTime() - 30 * 24 * 3600_000)

    const result = await Lead.updateMany(
      {
        status: 'LOST',
        isArchived: { $ne: true },
        updatedAt: { $lt: thirtyDaysAgo },
      },
      { $set: { isArchived: true } },
    )

    const archivedCount = result.modifiedCount || 0

    console.log(`[CRM AUTO ARCHIVE] ${archivedCount} lead(s) LOST archivé(s) (inactifs depuis 30j+)`)

    return {
      actionsExecuted: [`auto_archive_lost:${archivedCount}_leads`],
      recipientsNotified: [],
      details: { archivedCount },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
