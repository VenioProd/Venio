import mongoose from 'mongoose'
import crypto from 'crypto'

const DEFAULT_TTL_DAYS = 7

const schema = new mongoose.Schema({
  token: { type: String, default: () => crypto.randomBytes(24).toString('hex') },
  label: { type: String, default: 'Lien de creation', trim: true },
  active: { type: Boolean, default: true },
  // Limites de réutilisation : un token créé est valide 7 jours et n'autorise
  // qu'une seule création de questionnaire avant désactivation automatique.
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000),
  },
  usageCount: { type: Number, default: 0 },
  maxUsage: { type: Number, default: 1 },
}, { timestamps: true })

schema.index({ token: 1 })
// TTL Mongo : purge automatique des tokens expirés.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.model('QualiopiCreationToken', schema)
