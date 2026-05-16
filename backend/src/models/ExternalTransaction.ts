import mongoose from 'mongoose'
import type { IExternalTransaction } from '../types/models/index.js'

/**
 * ExternalTransaction = trace BRUTE de chaque payload reçu d'une source externe.
 * Conservée 10 ans (obligation comptable). Sert d'audit trail et d'idempotency.
 */

const externalTransactionSchema = new mongoose.Schema<IExternalTransaction>(
  {
    source: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalSource', required: true },
    sourceSlug: { type: String, required: true },

    // Identifiants côté source
    externalId: { type: String, default: '' },
    idempotencyKey: { type: String, required: true },

    // Statut de traitement
    status: {
      type: String,
      enum: ['RECEIVED', 'CLASSIFIED', 'POSTED', 'REJECTED', 'DUPLICATE', 'AWAITING_REVIEW'],
      default: 'RECEIVED',
    },
    errorReason: { type: String, default: '' },
    matchedRule: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassificationRule', default: null },
    autoValidated: { type: Boolean, default: false },

    // Payload brut tel que reçu (pour rejouer si besoin)
    rawPayload: { type: mongoose.Schema.Types.Mixed, required: true },
    normalizedPayload: { type: mongoose.Schema.Types.Mixed, default: null },

    // Lien vers l'écriture générée (si POSTED)
    generatedEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountingEntry', default: null },

    // Métadonnées de la requête HTTP
    requestIp: { type: String, default: '' },
    requestUserAgent: { type: String, default: '' },
    signatureVerified: { type: Boolean, default: false },

    receivedAt: { type: Date, default: () => new Date() },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

externalTransactionSchema.index({ source: 1, idempotencyKey: 1 }, { unique: true })
externalTransactionSchema.index({ status: 1 })
externalTransactionSchema.index({ sourceSlug: 1, receivedAt: -1 })
externalTransactionSchema.index({ externalId: 1 })

export default mongoose.model<IExternalTransaction>('ExternalTransaction', externalTransactionSchema)
