// ─────────────────────────────────────────────────────────────
// crm.retention_purge
// Anonymise les leads non gagnés inactifs au-delà de la durée de conservation
// (RGPD). Simulation tant que le réglage retentionPurgeEnabled est faux.
// ─────────────────────────────────────────────────────────────

import { registerAutomation } from '../registry.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'
import { acquireSchedulerLock, releaseSchedulerLock } from '../../models/SchedulerLock.js'
import { parisDateKey, serverScheduleForParis } from './crmParisTime.js'

const DAILY_LOCK_TTL_MS = 3 * 24 * 3600_000

const definition: AutomationDefinition = {
  key: 'crm.retention_purge',
  title: 'Conservation des données CRM (anonymisation)',
  domain: 'crm',
  triggerType: 'cron',
  /** 04:00 heure de Paris, traduite à chaque passage en heure du serveur. */
  get schedule() {
    return serverScheduleForParis('04:00')
  },
  channels: ['system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 1,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `crm.retention_purge:${parisDateKey(ctx.now)}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    // Une seule instance par jour de Paris, comme les tâches du planificateur CRM.
    const lockKey = `crm-scheduler:retentionPurge:${parisDateKey(ctx.now)}`
    if (!(await acquireSchedulerLock(lockKey, DAILY_LOCK_TTL_MS, ctx.now))) {
      return { actionsExecuted: [], recipientsNotified: [], details: { skipped: 'LOCKED' } }
    }
    try {
      const { runRetentionPurge } = await import('../../lib/crmRetention.js')
      const result = await runRetentionPurge(ctx.now)
      return {
        actionsExecuted: [
          result.dryRun
            ? `retention_purge:dry_run:${result.eligible}_leads`
            : `retention_purge:${result.anonymized}_leads`,
        ],
        recipientsNotified: [],
        details: { ...result },
      }
    } catch (err) {
      await releaseSchedulerLock(lockKey).catch(() => {})
      throw err
    }
  },
}

export function register() {
  registerAutomation(definition)
}
