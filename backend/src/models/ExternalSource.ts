import mongoose from 'mongoose'
import type { IExternalSource } from '../types/models/index.js'

/**
 * ExternalSource = un site/application tiers autorisé à pousser des écritures
 * comptables dans Venio (ex: arrow, ecom-bcg, stripe-mirror, etc.).
 *
 * Sécurité :
 *   - apiKeyHash : hash bcrypt de la clé API. Affichée UNE SEULE FOIS à la création.
 *   - webhookSecret : secret HMAC utilisé pour signer le body des requêtes.
 *   - Les deux peuvent être tournés via POST /external-sources/:id/rotate.
 */

const sourceSchema = new mongoose.Schema<IExternalSource>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9][a-z0-9-]{1,40}$/,
    },
    name: { type: String, required: true },
    description: { type: String, default: '' },

    // Sécurité
    apiKeyHash: { type: String, required: true },
    apiKeyPrefix: { type: String, default: '' },
    webhookSecret: { type: String, required: true },
    timestampToleranceSec: { type: Number, default: 300 },

    // Comportement
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'DISABLED'],
      default: 'ACTIVE',
    },
    autoValidateAll: { type: Boolean, default: false },
    rateLimitPerMin: { type: Number, default: 60 },

    // Mapping comptable par défaut (utilisé si une transaction n'est matchée par aucune règle)
    defaultJournalCode: { type: String, default: 'VE' },
    defaultCustomerAccount: { type: String, default: '411000' },
    defaultRevenueAccount: { type: String, default: '706000' },
    defaultExpenseAccount: { type: String, default: '604000' },
    defaultBankAccount: { type: String, default: '512000' },
    defaultVatCollectedAccount: { type: String, default: '445710' },
    defaultVatDeductibleAccount: { type: String, default: '445660' },

    // Stats
    lastSeenAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
    totalIngested: { type: Number, default: 0 },
    totalRejected: { type: Number, default: 0 },
    totalDuplicates: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rotatedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

sourceSchema.index({ status: 1 })

export default mongoose.model<IExternalSource>('ExternalSource', sourceSchema)
