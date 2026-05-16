import AccountingEntry from '../../models/AccountingEntry.js'
import { recordAudit } from '../audit/auditHelpers.js'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

/**
 * Verrouille automatiquement les écritures VALIDATED depuis > N jours.
 * N est lu depuis ACCOUNTING_LOCK_VALIDATED_AFTER_DAYS (défaut 30, 0 = désactivé).
 */
export async function autoLockExpiredEntries(): Promise<{ lockedCount: number }> {
  const days = Number(process.env.ACCOUNTING_LOCK_VALIDATED_AFTER_DAYS ?? 30)
  if (!days || days <= 0) return { lockedCount: 0 }

  const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const candidates = await AccountingEntry.find({
    status: 'VALIDATED',
    validatedAt: { $ne: null, $lte: threshold },
  })
    .select('_id entryNumber journalCode')
    .lean()

  let lockedCount = 0
  for (const entry of candidates) {
    try {
      await AccountingEntry.updateOne(
        { _id: entry._id, status: 'VALIDATED' },
        { $set: { status: 'LOCKED', lockedAt: new Date() } }
      )
      lockedCount += 1
      await recordAudit({
        action: 'ACCOUNTING_ENTRY_LOCK',
        actor: { type: 'SYSTEM', ip: '', userAgent: 'autoLock' },
        entityType: 'AccountingEntry',
        entityId: String(entry._id),
        entityRef: entry.entryNumber,
        summary: `Verrouillage automatique après ${days} jours`,
      })
    } catch {
      /* noop — best effort */
    }
  }

  return { lockedCount }
}

let timer: NodeJS.Timeout | null = null

/**
 * Démarre le scheduler de verrouillage auto (run au démarrage + toutes les 6h).
 * À appeler dans index.ts après mongoose.connect.
 */
export function startAutoLockScheduler(): void {
  // Run initial dès le démarrage (non bloquant)
  autoLockExpiredEntries().catch(() => {
    /* noop */
  })

  // Puis tous les 6h
  timer = setInterval(() => {
    autoLockExpiredEntries().catch(() => {
      /* noop */
    })
  }, SIX_HOURS_MS)

  if (typeof timer.unref === 'function') timer.unref()
}

export function stopAutoLockScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
