import mongoose from 'mongoose'

/**
 * Stockage des tokens de reset de mot de passe.
 *
 * Sécurité :
 *  - Le token brut (clair) n'est JAMAIS persisté. On stocke uniquement son
 *    SHA-256 (`tokenHash`), de sorte qu'une compromission de la base ne
 *    permette pas la réutilisation des liens.
 *  - Le champ `expiresAt` déclenche un TTL Mongo : les entrées expirées sont
 *    automatiquement purgées par le serveur. Aucun cleanup manuel requis.
 *  - L'index unique sur `tokenHash` empêche toute collision et permet une
 *    recherche en O(1).
 */
export interface IPasswordResetToken {
  userId: mongoose.Types.ObjectId
  tokenHash: string
  expiresAt: Date
  createdAt: Date
}

const passwordResetTokenSchema = new mongoose.Schema<IPasswordResetToken>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
)

// TTL Mongo : la doc est purgée dès que `expiresAt` est dépassé.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.model<IPasswordResetToken>('PasswordResetToken', passwordResetTokenSchema)
