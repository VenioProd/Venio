import crypto from 'crypto'
import type { Response } from 'express'
import AuthSession, { hashSessionToken } from '../models/AuthSession.js'
import User from '../models/User.js'
import MobileDevice from '../models/MobileDevice.js'
import MobileRefreshToken from '../models/MobileRefreshToken.js'
import type { JwtPayload } from '../types/express.js'

export const SESSION_COOKIE = 'venio_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const IMPERSONATION_TTL_MS = 15 * 60 * 1000

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict' as const,
    path: '/',
    ...(maxAge === undefined ? {} : { maxAge }),
  }
}

export function readSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  for (const entry of cookieHeader.split(';')) {
    const [name, ...rawValue] = entry.trim().split('=')
    if (name !== SESSION_COOKIE) continue
    try {
      return decodeURIComponent(rawValue.join('=')) || null
    } catch {
      return null
    }
  }
  return null
}

export async function createSession(
  userId: string,
  options: {
    impersonatorId?: string
    mfaVerifiedAt?: Date
    mfaEnrollmentOnly?: boolean
    ttlMs?: number
    deviceId?: string
    tokenPrefix?: string
  } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const user = await User.findById(userId).select('sessionVersion').lean()
  if (!user) throw new Error('Cannot create a session for an unknown user')

  const token = (options.tokenPrefix ?? '') + crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + (options.ttlMs ?? SESSION_TTL_MS))
  await AuthSession.create({
    userId,
    tokenHash: hashSessionToken(token),
    sessionVersion: user.sessionVersion ?? 0,
    expiresAt,
    impersonatorId: options.impersonatorId ?? null,
    mfaVerifiedAt: options.mfaVerifiedAt ?? null,
    mfaEnrollmentOnly: options.mfaEnrollmentOnly ?? false,
    deviceId: options.deviceId ?? null,
  })
  return { token, expiresAt }
}

export async function setSessionCookie(
  res: Response,
  userId: string,
  options: {
    impersonatorId?: string
    mfaVerifiedAt?: Date
    mfaEnrollmentOnly?: boolean
    impersonation?: boolean
  } = {},
): Promise<void> {
  const ttlMs = options.impersonation ? IMPERSONATION_TTL_MS : SESSION_TTL_MS
  const { token } = await createSession(userId, {
    impersonatorId: options.impersonatorId,
    mfaVerifiedAt: options.mfaVerifiedAt,
    mfaEnrollmentOnly: options.mfaEnrollmentOnly,
    ttlMs,
  })
  // Use the requested TTL directly. Deriving it from the persisted expiry after
  // the database write can truncate the serialized Max-Age by one second.
  res.cookie(SESSION_COOKIE, token, cookieOptions(ttlMs))
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions())
}

export async function revokeSession(token: string | null): Promise<void> {
  if (!token) return
  await AuthSession.updateOne(
    { tokenHash: hashSessionToken(token), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  )
}

/** Révoque tout : sessions navigateur, appareils natifs et leurs refresh tokens. */
export async function revokeUserSessions(userId: string): Promise<void> {
  const now = new Date()
  await MobileDevice.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: now, revokedReason: 'CREDENTIALS_CHANGED', apnsToken: null, apnsEnvironment: null } },
  )
  await MobileRefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: now } })
  await AuthSession.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: now } })
}

/**
 * `cookie` n'accepte que les sessions navigateur, `bearer` que les access
 * tokens de l'app native : un jeton ne change jamais de transport.
 */
export async function authenticateSession(
  token: string,
  transport: 'cookie' | 'bearer' = 'cookie',
): Promise<JwtPayload | null> {
  const session = await AuthSession.findOne({
    tokenHash: hashSessionToken(token),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
    deviceId: transport === 'bearer' ? { $ne: null } : null,
  }).lean()
  if (!session) return null

  const user = await User.findById(session.userId).select('role status isActive email name sessionVersion').lean()
  if (
    !user ||
    !user.isActive ||
    user.status === 'ARCHIVE' ||
    (session.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)
  ) {
    return null
  }

  // Un access token natif meurt avec son appareil, y compris s'il a été émis
  // pendant que la révocation de l'appareil était en cours.
  if (session.deviceId) {
    const device = await MobileDevice.exists({
      _id: session.deviceId,
      userId: session.userId,
      // Un login engagé avant un changement de mot de passe ne doit pas
      // produire un appareil valable après la révocation.
      sessionVersion: user.sessionVersion ?? 0,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
    if (!device) return null
  }

  return {
    id: String(user._id),
    role: user.role,
    email: user.email,
    name: user.name,
    sessionVersion: user.sessionVersion ?? 0,
    mfaVerifiedAt: session.mfaVerifiedAt?.getTime(),
    mfaEnrollmentOnly: session.mfaEnrollmentOnly || undefined,
    impersonatorId: session.impersonatorId ? String(session.impersonatorId) : undefined,
    deviceId: session.deviceId ? String(session.deviceId) : undefined,
  }
}
