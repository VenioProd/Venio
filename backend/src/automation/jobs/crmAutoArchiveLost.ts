// ─────────────────────────────────────────────────────────────
// crm.auto_archive_lost
// Archive automatiquement les leads LOST depuis 30+ jours
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'
import logger from '../../lib/logger.js'
import { withActiveLeads } from './crmLeadScope.js'
import { parisDateKey, serverScheduleForParis } from './crmParisTime.js'

const definition: AutomationDefinition = {
  key: 'crm.auto_archive_lost',
  title: 'Archivage automatique des leads perdus',
  domain: 'crm',
  triggerType: 'cron',
  /** 03:00 heure de Paris, traduite à chaque passage en heure du serveur. */
  get schedule() {
    return serverScheduleForParis('03:00')
  },
  channels: ['system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 1,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `crm.archive_lost:${parisDateKey(ctx.now)}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Lead = mongoose.model('Lead')

    const thirtyDaysAgo = new Date(ctx.now.getTime() - 30 * 24 * 3600_000)

    // Perdu depuis 30 jours : date de passage à LOST ; à défaut (anciens
    // leads), dernière modification.
    const leads = await Lead.find(
      withActiveLeads({
        status: 'LOST',
        $or: [
          { statusChangedAt: { $lt: thirtyDaysAgo } },
          { statusChangedAt: null, updatedAt: { $lt: thirtyDaysAgo } },
        ],
      }),
    )

    // Chaque archivage passe par le service unique : il est consigné dans
    // l'historique du lead comme un archivage manuel.
    const { applyLeadChange } = await import('../../lib/crmLeadService.js')
    let archivedCount = 0
    for (const lead of leads) {
      try {
        await applyLeadChange(
          lead,
          { archivedAt: ctx.now },
          { actor: null, source: 'scheduler', labelSuffix: '(archivage automatique)' },
        )
        archivedCount++
      } catch (err) {
        logger.warn({ data: (err as Error).message }, `[CRM AUTO ARCHIVE] lead ${String(lead._id)}`)
      }
    }

    logger.info(`[CRM AUTO ARCHIVE] ${archivedCount} lead(s) LOST archivé(s) (inactifs depuis 30j+)`)

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
