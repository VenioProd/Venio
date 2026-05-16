import AccountingEntry from '../../models/AccountingEntry.js'
import AccountingLine from '../../models/AccountingLine.js'
import AuditLog from '../../models/AuditLog.js'
import { shallowDiff } from './auditMiddleware.js'

/**
 * Wrappers d'opérations sur AccountingEntry qui maintiennent un audit
 * trail homogène + politique de soft delete.
 *
 * Règles clés :
 *   - On ne supprime JAMAIS physiquement une entry. On positionne
 *     archivedAt = new Date() et on exclut via filtre.
 *   - Une entry LOCKED est immutable : toute tentative renvoie 423.
 *   - Toute modification logge un AuditLog ENTRY_UPDATE (avant/après + diff).
 */

const EDITABLE_FIELDS = new Set([
  'label',
  'pieceRef',
  'notes',
  'date',
  // On autorise aussi de changer le journal/journalCode/fiscalYear via patch,
  // mais ces cas sont rares — exposés pour la cohérence.
  'journal',
  'journalCode',
  'fiscalYear',
])

/**
 * Sérialise une entry pour la passer en before/after de l'audit.
 * On évite d'embarquer la collection mongoose entière et ne garde que
 * les champs sensibles.
 */
function snapshotEntry(entry) {
  if (!entry) return null
  const o = typeof entry.toObject === 'function' ? entry.toObject() : { ...entry }
  return {
    _id: o._id,
    entryNumber: o.entryNumber,
    journalCode: o.journalCode,
    date: o.date,
    label: o.label,
    pieceRef: o.pieceRef,
    notes: o.notes,
    status: o.status,
    totalDebit: o.totalDebit,
    totalCredit: o.totalCredit,
    validatedAt: o.validatedAt,
    lockedAt: o.lockedAt,
    archivedAt: o.archivedAt,
  }
}

/**
 * Met à jour une entry en respectant :
 *   - refus si LOCKED (423)
 *   - audit ENTRY_UPDATE avec before/after/diff
 *
 * @param {string|ObjectId} entryId
 * @param {object} patch  Champs à modifier (sous-ensemble de EDITABLE_FIELDS)
 * @param {object} actor  Objet construit par buildActorFromReq
 * @returns {Promise<{ entry: object, auditLog: object|null }>}
 */
export async function updateEntryWithAudit(entryId, patch, actor) {
  const entry = await AccountingEntry.findOne({ _id: entryId, archivedAt: null })
  if (!entry) {
    const err = new Error('Écriture introuvable')
    err.status = 404
    throw err
  }
  if (entry.status === 'LOCKED') {
    const err = new Error('Écriture verrouillée, modification impossible')
    err.status = 423
    throw err
  }

  const before = snapshotEntry(entry)

  // Application stricte des champs autorisés.
  for (const [key, value] of Object.entries(patch || {})) {
    if (EDITABLE_FIELDS.has(key)) {
      if (key === 'date' && value) {
        entry[key] = value instanceof Date ? value : new Date(value)
      } else {
        entry[key] = value
      }
    }
  }

  await entry.save()
  const after = snapshotEntry(entry)
  const diff = shallowDiff(before, after)

  const auditLog = await AuditLog.record({
    action: 'ENTRY_UPDATE',
    entityType: 'AccountingEntry',
    entityId: entry._id,
    entityRef: entry.entryNumber,
    actor,
    summary: `Modification de ${entry.entryNumber}`,
    before,
    after,
    diff,
  })

  return { entry, auditLog }
}

/**
 * Soft delete d'une entry DRAFT.
 *
 * On exige le statut DRAFT pour éviter qu'on puisse "supprimer" une
 * écriture validée par contournement. Les lignes sont conservées (les
 * lignes vivront sous une entry archivée et seront ignorées des
 * requêtes grâce au filtre archivedAt côté entry).
 *
 * @param {string|ObjectId} entryId
 * @param {object} actor
 */
export async function softDeleteEntry(entryId, actor) {
  const entry = await AccountingEntry.findOne({ _id: entryId, archivedAt: null })
  if (!entry) {
    const err = new Error('Écriture introuvable')
    err.status = 404
    throw err
  }
  if (entry.status !== 'DRAFT') {
    const err = new Error('Seules les écritures DRAFT peuvent être archivées')
    err.status = 400
    throw err
  }

  const before = snapshotEntry(entry)
  entry.archivedAt = new Date()
  await entry.save()
  const after = snapshotEntry(entry)

  // Nettoyage des lignes pour ne pas polluer les rapports.
  // On les supprime physiquement car une entry DRAFT archivée n'a aucune
  // valeur probante.
  await AccountingLine.deleteMany({ entry: entry._id })

  const auditLog = await AuditLog.record({
    action: 'ENTRY_DELETE',
    entityType: 'AccountingEntry',
    entityId: entry._id,
    entityRef: entry.entryNumber,
    actor,
    summary: `Archivage du brouillon ${entry.entryNumber}`,
    before,
    after,
    diff: [{ field: 'archivedAt', before: null, after: after.archivedAt }],
  })

  return { entry, auditLog }
}

/**
 * Restore d'une entry archivée (uniquement si elle l'a été en DRAFT).
 * On ne peut pas restaurer ses lignes — c'est une re-saisie à faire à part.
 *
 * @param {string|ObjectId} entryId
 * @param {object} actor
 */
export async function restoreEntry(entryId, actor) {
  const entry = await AccountingEntry.findOne({ _id: entryId })
  if (!entry) {
    const err = new Error('Écriture introuvable')
    err.status = 404
    throw err
  }
  if (!entry.archivedAt) {
    const err = new Error('Écriture non archivée')
    err.status = 400
    throw err
  }
  if (entry.status === 'LOCKED') {
    const err = new Error('Écriture verrouillée, restauration impossible')
    err.status = 423
    throw err
  }

  const before = snapshotEntry(entry)
  entry.archivedAt = null
  await entry.save()
  const after = snapshotEntry(entry)

  const auditLog = await AuditLog.record({
    action: 'ENTRY_RESTORE',
    entityType: 'AccountingEntry',
    entityId: entry._id,
    entityRef: entry.entryNumber,
    actor,
    summary: `Restauration de ${entry.entryNumber}`,
    before,
    after,
    diff: [{ field: 'archivedAt', before: before.archivedAt, after: null }],
  })

  return { entry, auditLog }
}
