import crypto from 'crypto'
import type { Types } from 'mongoose'
import AuthSession, { hashSessionToken } from '../models/AuthSession.js'
import MobileDevice, { type IMobileDevice, type MobileDeviceRevokeReason } from '../models/MobileDevice.js'
import MobileRefreshToken from '../models/MobileRefreshToken.js'
import User from '../models/User.js'
import { ADMIN_ROLES } from './permissions.js'
import { createSession } from './session.js'
import { isMfaEnabled } from './mfa.js'

export const ACCESS_TOKEN_PREFIX = 'vnm_at_'
export const REFRESH_TOKEN_PREFIX = 'vnm_rt_'
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
// Au-delà, l'app redemande le mot de passe, même si elle s'est servie tous les jours.
export const DEVICE_MAX_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000

export interface MobileTokens {
  accessToken: string
  accessTokenExpiresAt: Date
  refreshToken: string
  refreshTokenExpiresAt: Date
}

/** L'app native est réservée à l'équipe interne : pas de compte client ni d'agent. */
export function canUseMobileApp(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role)
}

/** Émet un couple access + refresh pour un appareil actif. */
export async function issueDeviceTokens(device: {
  _id: Types.ObjectId
  userId: Types.ObjectId
  expiresAt: Date
  mfaVerifiedAt: Date | null
}): Promise<MobileTokens> {
  const refreshToken = REFRESH_TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url')
  const refreshTokenExpiresAt = new Date(Math.min(Date.now() + REFRESH_TOKEN_TTL_MS, device.expiresAt.getTime()))
  await MobileRefreshToken.create({
    userId: device.userId,
    deviceId: device._id,
    tokenHash: hashSessionToken(refreshToken),
    expiresAt: refreshTokenExpiresAt,
  })

  const access = await createSession(String(device.userId), {
    deviceId: String(device._id),
    mfaVerifiedAt: device.mfaVerifiedAt ?? undefined,
    ttlMs: ACCESS_TOKEN_TTL_MS,
    tokenPrefix: ACCESS_TOKEN_PREFIX,
  })
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken,
    refreshTokenExpiresAt,
  }
}

/**
 * Révoque un appareil, ses refresh tokens et ses access tokens. L'appareil est
 * révoqué en premier : une rotation concurrente échoue alors sur sa vérification.
 * Renvoie false si l'appareil l'était déjà.
 */
export async function revokeDevice(
  deviceId: Types.ObjectId | string,
  reason: MobileDeviceRevokeReason,
): Promise<boolean> {
  const now = new Date()
  const result = await MobileDevice.updateOne(
    { _id: deviceId, revokedAt: null },
    { $set: { revokedAt: now, revokedReason: reason, apnsToken: null, apnsEnvironment: null } },
  )
  await MobileRefreshToken.updateMany({ deviceId, revokedAt: null }, { $set: { revokedAt: now } })
  await AuthSession.updateMany({ deviceId, revokedAt: null }, { $set: { revokedAt: now } })
  return result.modifiedCount === 1
}

export type RefreshOutcome =
  | { kind: 'rotated'; device: IMobileDevice & { _id: Types.ObjectId }; tokens: MobileTokens }
  | { kind: 'invalid' }
  | { kind: 'reused'; deviceId: Types.ObjectId; userId: Types.ObjectId }

/**
 * Rotation d'un refresh token. Chaque jeton ne sert qu'une fois : sa
 * consommation est atomique, et présenter un jeton déjà consommé révoque tout
 * l'appareil. On ne sait pas lequel des deux porteurs est légitime (ce peut
 * être l'app qui a perdu une réponse) : couper les deux est le seul choix sûr.
 */
export async function rotateRefreshToken(rawToken: string, ip: string): Promise<RefreshOutcome> {
  if (!rawToken.startsWith(REFRESH_TOKEN_PREFIX)) return { kind: 'invalid' }
  const tokenHash = hashSessionToken(rawToken)
  const now = new Date()

  const consumed = await MobileRefreshToken.findOneAndUpdate(
    { tokenHash, usedAt: null, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true },
  ).lean()

  if (!consumed) {
    const known = await MobileRefreshToken.findOne({ tokenHash }).select('deviceId userId usedAt').lean()
    if (known?.usedAt) {
      await revokeDevice(known.deviceId, 'REFRESH_REUSE')
      return { kind: 'reused', deviceId: known.deviceId, userId: known.userId }
    }
    return { kind: 'invalid' }
  }

  const device = await MobileDevice.findOne({
    _id: consumed.deviceId,
    userId: consumed.userId,
    revokedAt: null,
    expiresAt: { $gt: now },
  }).lean()
  if (!device) return { kind: 'invalid' }

  // Mot de passe changé, droits modifiés, compte désactivé : l'appareil ne
  // survit pas à ce que la session navigateur ne survivrait pas non plus.
  const user = await User.findById(device.userId).select('role status isActive sessionVersion twoFactorEnabled').lean()
  if (
    !user ||
    !user.isActive ||
    user.status === 'ARCHIVE' ||
    !canUseMobileApp(user.role) ||
    (user.sessionVersion ?? 0) !== device.sessionVersion ||
    // MFA réarmée après une connexion qui ne l'a pas passée : on redemande.
    (isMfaEnabled() && user.twoFactorEnabled && !device.mfaVerifiedAt)
  ) {
    await revokeDevice(device._id, 'CREDENTIALS_CHANGED')
    return { kind: 'invalid' }
  }

  const tokens = await issueDeviceTokens(device)
  await MobileDevice.updateOne({ _id: device._id }, { $set: { lastSeenAt: now, lastIp: ip } })
  return { kind: 'rotated', device, tokens }
}

/** Retrouve l'appareil d'un refresh token, quel que soit son état (déconnexion). */
export async function findDeviceIdByRefreshToken(rawToken: string): Promise<Types.ObjectId | null> {
  if (!rawToken.startsWith(REFRESH_TOKEN_PREFIX)) return null
  const known = await MobileRefreshToken.findOne({ tokenHash: hashSessionToken(rawToken) })
    .select('deviceId')
    .lean()
  return known?.deviceId ?? null
}

export function serializeDevice(device: IMobileDevice & { _id: Types.ObjectId }, currentDeviceId?: string) {
  return {
    id: String(device._id),
    name: device.name,
    platform: device.platform,
    model: device.model,
    osVersion: device.osVersion,
    appVersion: device.appVersion,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
    expiresAt: device.expiresAt,
    pushEnabled: Boolean(device.apnsToken),
    current: String(device._id) === currentDeviceId,
  }
}
