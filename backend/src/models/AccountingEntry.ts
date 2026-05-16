import mongoose, { type CallbackError } from 'mongoose'
import type { IAccountingEntry } from '../types/models/index.js'

const accountingEntrySchema = new mongoose.Schema<IAccountingEntry>(
  {
    journal: { type: mongoose.Schema.Types.ObjectId, ref: 'Journal', required: true },
    journalCode: { type: String, required: true, uppercase: true },
    fiscalYear: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalYear', required: true },
    entryNumber: { type: String, required: true },
    date: { type: Date, required: true },
    label: { type: String, default: '' },
    pieceRef: { type: String, default: '' },
    status: {
      type: String,
      enum: ['DRAFT', 'VALIDATED', 'LOCKED'],
      default: 'DRAFT',
    },
    source: {
      type: String,
      enum: ['MANUAL', 'BILLING', 'PAYMENT', 'EXTERNAL', 'AN', 'SYSTEM'],
      default: 'MANUAL',
    },
    sourceRef: {
      kind: { type: String, default: '' },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    externalSource: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalSource', default: null },
    idempotencyKey: { type: String, default: null },
    totalDebit: { type: Number, default: 0 },
    totalCredit: { type: Number, default: 0 },
    currency: { type: String, default: 'EUR' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    validatedAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
)

accountingEntrySchema.index({ journal: 1, date: 1 })
accountingEntrySchema.index(
  { fiscalYear: 1, journalCode: 1, entryNumber: 1 },
  { unique: true }
)
accountingEntrySchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
)
accountingEntrySchema.index({ status: 1, source: 1 })
accountingEntrySchema.index({ date: 1 })

/**
 * Hook anti-modification d'une écriture verrouillée.
 *
 * Si le document est déjà LOCKED côté base (status persisté = LOCKED) ET que
 * la sauvegarde modifie autre chose que archivedAt, on refuse. Cela permet
 * encore d'archiver une LOCKED (cas exceptionnel d'erreur historique avérée)
 * mais bloque toute édition silencieuse.
 *
 * Cas autorisés explicitement :
 *   - création initiale d'un document LOCKED (isNew=true) — utile aux scripts
 *     d'import qui posent directement le statut final ;
 *   - modification ne touchant que archivedAt.
 */
accountingEntrySchema.pre('save', function blockLocked(next) {
  if (this.isNew) return next()
  // status persisté = valeur actuelle du status si non modifié dans ce save.
  const wasLocked = this.status === 'LOCKED' && !this.isModified('status')
  if (!wasLocked) return next()
  const modified = this.modifiedPaths()
  // On autorise uniquement archivedAt et updatedAt comme champs modifiés sur un LOCKED.
  const blockedPaths = modified.filter(
    (p) => p !== 'archivedAt' && p !== 'updatedAt'
  )
  if (blockedPaths.length === 0) return next()
  const err = new Error(
    `Écriture verrouillée : modification interdite (champs : ${blockedPaths.join(', ')})`
  ) as Error & { status?: number }
  err.status = 423
  next(err as CallbackError)
})

export default mongoose.model<IAccountingEntry>('AccountingEntry', accountingEntrySchema)
