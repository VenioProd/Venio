import mongoose from 'mongoose'
import type { IAgentIdempotencyKey } from '../types/models/index.js'

/**
 * AgentIdempotencyKey : enregistrement persistant pour garantir
 * l'idempotency des mutations (POST/PATCH/DELETE) côté API agent.
 *
 * Stockage : (tokenId, key) unique. À chaque mutation :
 *   1. findOne({ tokenId, key })
 *   2. si trouvé + requestHash identique → rejouer responseStatus + responseBody
 *   3. si trouvé + requestHash différent → 409 IDEMPOTENCY_CONFLICT
 *   4. sinon → exécuter, puis insérer { status, body }
 *
 * TTL : 24h via index Mongo natif (`expireAfterSeconds: 86400` sur createdAt).
 */
const agentIdempotencyKeySchema = new mongoose.Schema<IAgentIdempotencyKey>(
  {
    tokenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AgentToken',
      required: true,
    },
    key: { type: String, required: true, maxlength: 255 },
    method: { type: String, required: true, maxlength: 10 },
    path: { type: String, required: true, maxlength: 500 },
    requestHash: { type: String, required: true, maxlength: 128 },
    responseStatus: { type: Number, required: true },
    responseBody: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, expires: 86400 },
  },
  { timestamps: false }
)

// Unicité de la clé par token
agentIdempotencyKeySchema.index({ tokenId: 1, key: 1 }, { unique: true })

export default mongoose.model<IAgentIdempotencyKey>(
  'AgentIdempotencyKey',
  agentIdempotencyKeySchema
)
