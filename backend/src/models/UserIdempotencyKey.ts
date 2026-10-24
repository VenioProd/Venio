import mongoose, { type Types } from 'mongoose'

export interface IUserIdempotencyKey {
  userId: Types.ObjectId
  key: string
  method: string
  path: string
  requestHash: string
  responseStatus: number | null
  responseBody: unknown
  createdAt: Date
}

/**
 * Clé d'idempotence d'une mutation faite par un utilisateur (app native hors
 * ligne). La ligne est réservée AVANT l'exécution : deux rejeux simultanés ne
 * peuvent pas exécuter tous les deux. `responseStatus` nul = exécution en cours.
 * Conservée 24 h, comme celles de l'API agent.
 */
const userIdempotencyKeySchema = new mongoose.Schema<IUserIdempotencyKey>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true, maxlength: 64 },
    method: { type: String, required: true, maxlength: 10 },
    path: { type: String, required: true, maxlength: 500 },
    requestHash: { type: String, required: true, maxlength: 128 },
    responseStatus: { type: Number, default: null },
    responseBody: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, expires: 86400 },
  },
  { timestamps: false },
)

userIdempotencyKeySchema.index({ userId: 1, key: 1 }, { unique: true })

export default mongoose.model<IUserIdempotencyKey>('UserIdempotencyKey', userIdempotencyKeySchema)
