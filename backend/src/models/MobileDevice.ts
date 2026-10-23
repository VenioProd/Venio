import mongoose, { type Types } from 'mongoose'

export const MOBILE_PLATFORMS = ['ios', 'ipados', 'watchos', 'macos'] as const
export type MobilePlatform = (typeof MOBILE_PLATFORMS)[number]

export const MOBILE_DEVICE_REVOKE_REASONS = [
  'LOGOUT',
  'USER_REVOKED',
  'REVOKE_ALL',
  'REFRESH_REUSE',
  'CREDENTIALS_CHANGED',
  'REPLACED',
  'EXPIRED',
] as const
export type MobileDeviceRevokeReason = (typeof MOBILE_DEVICE_REVOKE_REASONS)[number]

export const APNS_ENVIRONMENTS = ['sandbox', 'production'] as const
export type ApnsEnvironment = (typeof APNS_ENVIRONMENTS)[number]

export interface IMobileDevice {
  userId: Types.ObjectId
  name: string
  platform: MobilePlatform
  model: string
  osVersion: string
  appVersion: string
  installationId: string | null
  sessionVersion: number
  mfaVerifiedAt: Date | null
  expiresAt: Date
  lastSeenAt: Date
  lastIp: string
  revokedAt: Date | null
  revokedReason: MobileDeviceRevokeReason | null
  apnsToken: string | null
  apnsEnvironment: ApnsEnvironment | null
  apnsUpdatedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Un appareil connecté par l'app native. C'est aussi la « famille » des refresh
 * tokens : révoquer l'appareil révoque tous ses refresh tokens et ses access
 * tokens (AuthSession.deviceId), et coupe ses notifications APNs.
 */
const mobileDeviceSchema = new mongoose.Schema<IMobileDevice>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    platform: { type: String, enum: MOBILE_PLATFORMS, required: true },
    model: { type: String, default: '', trim: true, maxlength: 100 },
    osVersion: { type: String, default: '', trim: true, maxlength: 40 },
    appVersion: { type: String, default: '', trim: true, maxlength: 40 },
    // Identifiant d'installation généré par l'app et gardé dans son Keychain :
    // une reconnexion depuis la même installation remplace l'ancien appareil.
    installationId: { type: String, default: null, maxlength: 100 },
    sessionVersion: { type: Number, required: true, default: 0 },
    mfaVerifiedAt: { type: Date, default: null },
    // Durée de vie absolue de la famille, que les rotations ne prolongent pas.
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true, default: () => new Date() },
    lastIp: { type: String, default: '' },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, enum: [...MOBILE_DEVICE_REVOKE_REASONS, null], default: null },
    apnsToken: { type: String, default: null },
    apnsEnvironment: { type: String, enum: [...APNS_ENVIRONMENTS, null], default: null },
    apnsUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

mobileDeviceSchema.index({ userId: 1, revokedAt: 1 })
mobileDeviceSchema.index({ userId: 1, installationId: 1 })
// Un jeton APNs désigne une installation : il ne peut être porté que par un appareil.
mobileDeviceSchema.index(
  { apnsToken: 1 },
  { unique: true, partialFilterExpression: { apnsToken: { $type: 'string' } } },
)

export default mongoose.model<IMobileDevice>('MobileDevice', mobileDeviceSchema)
