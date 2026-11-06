import mongoose, { type Types } from 'mongoose'

/**
 * Jeton de réinitialisation de mot de passe (VENIO-116), persistant pour
 * survivre aux redémarrages et aux déploiements. Seule l'empreinte SHA-256 du
 * jeton est stockée : une lecture de la base ne permet pas de s'en servir.
 * Logique : src/lib/auth/passwordReset.ts.
 */
export interface IPasswordResetToken {
  userId: Types.ObjectId
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const passwordResetTokenSchema = new mongoose.Schema<IPasswordResetToken>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    // Index TTL : MongoDB purge le document une fois l'échéance passée. La
    // purge est différée (jusqu'à une minute) : l'expiration est donc aussi
    // contrôlée explicitement à la consommation.
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export default mongoose.model<IPasswordResetToken>('PasswordResetToken', passwordResetTokenSchema)
