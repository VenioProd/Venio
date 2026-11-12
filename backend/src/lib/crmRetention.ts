import Lead from '../models/Lead.js'
import Interaction from '../models/Interaction.js'
import CrmSettings from '../models/CrmSettings.js'
import { anonymizeLead } from './crmPrivacy.js'
import logger from './logger.js'

/**
 * Durée de conservation des leads (RGPD, chantier 3D).
 *
 * Un lead non gagné, sans interaction ni modification depuis
 * `retentionMonths` (36 par défaut), est anonymisé — pas supprimé : les
 * statistiques du pilotage restent justes. Tant que `retentionPurgeEnabled`
 * est faux (défaut), la purge ne fait que compter : aucun effet sans
 * activation explicite dans les réglages du CRM.
 */

export const RETENTION_MIN_MONTHS = 6
export const RETENTION_MAX_MONTHS = 120
export const DEFAULT_RETENTION_MONTHS = 36
/** Leads traités au plus par passage : la purge rattrape un stock sur plusieurs jours. */
export const RETENTION_BATCH = 500

export function clampRetentionMonths(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RETENTION_MONTHS
  return Math.min(RETENTION_MAX_MONTHS, Math.max(RETENTION_MIN_MONTHS, n))
}

export function retentionCutoff(now: Date, months: number): Date {
  const cutoff = new Date(now.getTime())
  cutoff.setMonth(cutoff.getMonth() - months)
  return cutoff
}

/** Leads candidats : non gagnés, pas encore anonymisés, rien depuis la date limite. */
export function retentionFilter(cutoff: Date): Record<string, unknown> {
  return {
    status: { $ne: 'WON' },
    anonymizedAt: null,
    updatedAt: { $lt: cutoff },
    $and: [
      { $or: [{ lastInteractionAt: null }, { lastInteractionAt: { $lt: cutoff } }] },
      { $or: [{ lastContactAt: null }, { lastContactAt: { $lt: cutoff } }] },
    ],
  }
}

export interface RetentionPurgeResult {
  dryRun: boolean
  retentionMonths: number
  cutoff: string
  /** Leads éligibles dans ce passage (après vérification du journal des échanges). */
  eligible: number
  anonymized: number
  failed: number
}

export async function runRetentionPurge(
  now: Date = new Date(),
  opts: { batch?: number } = {},
): Promise<RetentionPurgeResult> {
  const settings = await CrmSettings.getSettings()
  const months = clampRetentionMonths(settings.retentionMonths)
  const dryRun = settings.retentionPurgeEnabled !== true
  const cutoff = retentionCutoff(now, months)
  const candidates = await Lead.find(retentionFilter(cutoff))
    .sort({ updatedAt: 1 })
    .limit(opts.batch ?? RETENTION_BATCH)

  // Le compteur dénormalisé peut manquer un échange : le journal fait foi.
  const recent = new Set(
    (
      await Interaction.distinct('subjectId', {
        subjectType: 'LEAD',
        subjectId: { $in: candidates.map((l) => l._id) },
        occurredAt: { $gte: cutoff },
      })
    ).map(String),
  )
  const eligible = candidates.filter((l) => !recent.has(String(l._id)))

  let anonymized = 0
  let failed = 0
  if (!dryRun) {
    for (const lead of eligible) {
      try {
        const out = await anonymizeLead(lead, { actor: null, source: 'scheduler', reason: 'RETENTION', now })
        if (out.anonymized) anonymized++
      } catch (err) {
        failed++
        logger.warn({ data: (err as Error).message }, `[crm-retention] lead ${String(lead._id)}`)
      }
    }
  }
  const result = {
    dryRun,
    retentionMonths: months,
    cutoff: cutoff.toISOString(),
    eligible: eligible.length,
    anonymized,
    failed,
  }
  logger.info(result, dryRun ? '[crm-retention] simulation (purge non activée)' : '[crm-retention] purge')
  return result
}
