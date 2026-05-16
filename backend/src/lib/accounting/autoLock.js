import AccountingEntry from '../../models/AccountingEntry.js'
import AuditLog from '../../models/AuditLog.js'

/**
 * Auto-lock des écritures comptables.
 *
 * Une écriture VALIDATED depuis plus de N jours doit basculer en LOCKED
 * (immutable). Le délai est configurable via :
 *   ACCOUNTING_LOCK_VALIDATED_AFTER_DAYS  (défaut 30)
 *   0 ou négatif → désactivé.
 *
 * Le scheduler tourne :
 *   - une fois immédiatement après mongoose.connect (run initial) ;
 *   - puis toutes les 6 heures.
 *
 * Pour chaque entry verrouillée, on enregistre un AuditLog ENTRY_LOCK
 * avec actor SYSTEM.
 */

const INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 heures
let timer = null

/**
 * Lit la fenêtre configurée. Retourne null si désactivé.
 */
function readLockWindowDays() {
  const raw = process.env.ACCOUNTING_LOCK_VALIDATED_AFTER_DAYS
  if (raw === undefined || raw === null || raw === '') return 30
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

/**
 * Parcourt les écritures VALIDATED dont validatedAt < now - Nj
 * et les bascule en LOCKED. Logge un AuditLog par entry.
 *
 * @returns {Promise<{ lockedCount: number, disabled?: boolean }>}
 */
export async function autoLockExpiredEntries() {
  const days = readLockWindowDays()
  if (days === null) return { lockedCount: 0, disabled: true }

  const now = new Date()
  const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  // On itère pour pouvoir générer un AuditLog par entry sans bloquer toute
  // la boucle si l'audit échoue.
  const expired = await AccountingEntry.find(
    {
      status: 'VALIDATED',
      validatedAt: { $ne: null, $lte: threshold },
      archivedAt: null,
    },
    { _id: 1, entryNumber: 1, validatedAt: 1, totalDebit: 1, totalCredit: 1 }
  ).lean()

  let lockedCount = 0
  for (const e of expired) {
    try {
      const res = await AccountingEntry.updateOne(
        { _id: e._id, status: 'VALIDATED' },
        { $set: { status: 'LOCKED', lockedAt: now } }
      )
      if (res.modifiedCount > 0) {
        lockedCount += 1
        // Audit (best effort) : on note la transition + ancien validatedAt.
        await AuditLog.record({
          action: 'ENTRY_LOCK',
          entityType: 'AccountingEntry',
          entityId: e._id,
          entityRef: e.entryNumber,
          actor: { type: 'SYSTEM' },
          summary: `Verrouillage automatique de ${e.entryNumber} (validée depuis > ${days}j)`,
          before: { status: 'VALIDATED', lockedAt: null },
          after: { status: 'LOCKED', lockedAt: now },
          diff: [
            { field: 'status', before: 'VALIDATED', after: 'LOCKED' },
            { field: 'lockedAt', before: null, after: now },
          ],
          metadata: {
            validatedAt: e.validatedAt,
            windowDays: days,
            totalDebit: e.totalDebit,
            totalCredit: e.totalCredit,
          },
        })
      }
    } catch {
      // On ne casse pas la boucle pour un échec isolé : on continue.
    }
  }

  return { lockedCount }
}

/**
 * Démarre le scheduler : run immédiat puis toutes les 6h.
 * Idempotent (un seul timer actif quel que soit le nombre d'appels).
 *
 * À appeler depuis index.js après mongoose.connect().
 */
export function startAutoLockScheduler() {
  if (timer) return // déjà démarré

  // Run initial différé d'une seconde pour ne pas concurrencer le démarrage HTTP.
  setTimeout(() => {
    autoLockExpiredEntries().then(
      (res) => {
        if (res && res.lockedCount > 0) {
          // Trace minimaliste : utile au log de boot pour diagnostiquer la
          // bonne exécution. Non-bloquant si stdout est fermé.
          // eslint-disable-next-line no-console
          console.log(`[accounting] auto-lock initial: ${res.lockedCount} écritures verrouillées`)
        }
      },
      () => {
        /* on ne casse pas le boot pour ça */
      }
    )
  }, 1000)

  timer = setInterval(() => {
    autoLockExpiredEntries().catch(() => {
      /* swallow */
    })
  }, INTERVAL_MS)
  // Ne bloque pas le process à l'arrêt.
  if (typeof timer.unref === 'function') timer.unref()
}

/**
 * Stoppe le scheduler (utile en tests).
 */
export function stopAutoLockScheduler() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
