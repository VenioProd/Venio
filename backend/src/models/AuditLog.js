import mongoose from 'mongoose'

/**
 * AuditLog = trace de toutes les opérations sensibles sur la comptabilité.
 * Obligatoire pour conformité (art. L102B CGI + jurisprudence DGFiP).
 *
 * Cas d'usage capturés :
 *   - Validation d'une écriture DRAFT → VALIDATED
 *   - Modification d'une écriture VALIDATED (avant verrouillage)
 *   - Verrouillage automatique d'écriture (VALIDATED → LOCKED)
 *   - Suppression d'un brouillon
 *   - Clôture d'exercice
 *   - Création / rotation / suppression de source externe
 *   - Soumission de déclaration TVA
 *   - Export FEC
 *
 * Aucun update/delete possible sur ce modèle (append-only). Conservation 10 ans.
 */

const auditLogSchema = new mongoose.Schema(
  {
    // Action effectuée
    action: {
      type: String,
      required: true,
      enum: [
        'ENTRY_CREATE',
        'ENTRY_UPDATE',
        'ENTRY_VALIDATE',
        'ENTRY_LOCK',
        'ENTRY_DELETE',
        'ENTRY_RESTORE',
        'FISCAL_YEAR_CLOSE',
        'FISCAL_YEAR_REOPEN',
        'EXTERNAL_SOURCE_CREATE',
        'EXTERNAL_SOURCE_UPDATE',
        'EXTERNAL_SOURCE_DELETE',
        'EXTERNAL_SOURCE_ROTATE',
        'VAT_DECLARATION_CREATE',
        'VAT_DECLARATION_SUBMIT',
        'VAT_DECLARATION_DELETE',
        'FEC_EXPORT',
        'LETTRAGE_APPLY',
        'LETTRAGE_REMOVE',
        'CHART_OF_ACCOUNTS_SEED',
        'CHART_OF_ACCOUNTS_DEACTIVATE',
        'BILLING_TO_ENTRY',
        'PAYMENT_TO_ENTRY',
      ],
    },

    // Cible
    entityType: { type: String, required: true },      // 'AccountingEntry', 'FiscalYear', 'ExternalSource', etc.
    entityId: { type: mongoose.Schema.Types.ObjectId, required: false },
    entityRef: { type: String, default: '' },           // Référence lisible (entryNumber, slug, etc.)

    // Acteur
    actor: {
      type: { type: String, enum: ['USER', 'SYSTEM', 'EXTERNAL'], default: 'USER' },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      userEmail: { type: String, default: '' },
      externalSourceSlug: { type: String, default: '' },
      ip: { type: String, default: '' },
      userAgent: { type: String, default: '' },
    },

    // Détails
    summary: { type: String, default: '' },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    diff: { type: mongoose.Schema.Types.Mixed, default: null },  // tableau des champs modifiés
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
  }
)

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 })
auditLogSchema.index({ action: 1, createdAt: -1 })
auditLogSchema.index({ 'actor.userId': 1, createdAt: -1 })
auditLogSchema.index({ createdAt: -1 })

// Append-only : on bloque toute tentative de modification/suppression au niveau Mongoose
auditLogSchema.pre('updateOne', function blockUpdate() {
  throw new Error('AuditLog est append-only : updateOne interdit')
})
auditLogSchema.pre('findOneAndUpdate', function blockUpdate() {
  throw new Error('AuditLog est append-only : findOneAndUpdate interdit')
})
auditLogSchema.pre('deleteOne', function blockDelete() {
  throw new Error('AuditLog est append-only : deleteOne interdit')
})
auditLogSchema.pre('deleteMany', function blockDelete() {
  throw new Error('AuditLog est append-only : deleteMany interdit')
})

auditLogSchema.statics.record = async function record({
  action,
  entityType,
  entityId,
  entityRef,
  actor,
  summary,
  before,
  after,
  diff,
  metadata,
}) {
  try {
    return await this.create({
      action,
      entityType,
      entityId: entityId || undefined,
      entityRef: entityRef || '',
      actor: actor || { type: 'SYSTEM' },
      summary: summary || '',
      before: before || null,
      after: after || null,
      diff: diff || null,
      metadata: metadata || null,
    })
  } catch (err) {
    // L'audit ne doit JAMAIS faire échouer l'opération métier.
    // On log l'erreur et on continue silencieusement.
    console.error('AuditLog.record failed:', err.message)
    return null
  }
}

export default mongoose.model('AuditLog', auditLogSchema)
