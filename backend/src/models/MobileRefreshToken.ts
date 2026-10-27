import mongoose, { type Types } from 'mongoose'

export interface IMobileRefreshToken {
  userId: Types.ObjectId
  deviceId: Types.ObjectId
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// Les jetons consommés restent en base aussi longtemps que peut vivre leur
// appareil (180 jours) : c'est leur présence qui permet de reconnaître un
// rejeu et de révoquer l'appareil.
const RETENTION_AFTER_EXPIRY_S = 180 * 24 * 60 * 60

const mobileRefreshTokenSchema = new mongoose.Schema<IMobileRefreshToken>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'MobileDevice', required: true, index: true },
    // Seule l'empreinte SHA-256 est stockée, comme pour AuthSession.
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expires: RETENTION_AFTER_EXPIRY_S } },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export default mongoose.model<IMobileRefreshToken>('MobileRefreshToken', mobileRefreshTokenSchema)
