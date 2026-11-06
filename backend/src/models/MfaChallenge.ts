import mongoose, { type Types } from 'mongoose'

/**
 * Étape intermédiaire de la connexion en deux temps (VENIO-117) : le mot de
 * passe a été vérifié, il reste le second facteur. Le navigateur ne reçoit
 * qu'un jeton opaque de courte durée ; seule son empreinte est stockée.
 * Logique : src/lib/auth/mfaChallenge.ts.
 */
export interface IMfaChallenge {
  userId: Types.ObjectId
  tokenHash: string
  sessionVersion: number
  passwordNeedsUpgrade: boolean
  attempts: number
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const mfaChallengeSchema = new mongoose.Schema<IMfaChallenge>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    sessionVersion: { type: Number, required: true, default: 0 },
    passwordNeedsUpgrade: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export default mongoose.model<IMfaChallenge>('MfaChallenge', mfaChallengeSchema)
