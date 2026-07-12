import crypto from 'crypto'
import type { Response } from 'express'
import AuthSession, { hashSessionToken } from '../models/AuthSession.js'
import User from '../models/User.js'
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
  options: { impersonatorId?: string; mfaVerifiedAt?: Date; ttlMs?: number } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const user = await User.findById(userId).select('sessionVersion').lean()
  if (!user) throw new Error('Cannot create a session for an unknown user')

  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + (options.ttlMs ?? SESSION_TTL_MS))
  await AuthSession.create({
    userId,
    tokenHash: hashSessionToken(token),
    sessionVersion: user.sessionVersion ?? 0,
    expiresAt,
    impersonatorId: options.impersonatorId ?? null,
    mfaVerifiedAt: options.mfaVerifiedAt ?? null,
  })
  return { token, expiresAt }
}

export async function setSessionCookie(
  res: Response,
  userId: string,
  options: { impersonatorId?: string; mfaVerifiedAt?: Date; impersonation?: boolean } = {},
): Promise<void> {
  const { token, expiresAt } = await createSession(userId, {
    impersonatorId: options.impersonatorId,
    mfaVerifiedAt: options.mfaVerifiedAt,
    ttlMs: options.impersonation ? IMPERSONATION_TTL_MS : undefined,
  })
  res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt.getTime() - Date.now()))
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

export async function revokeUserSessions(userId: string): Promise<void> {
  await AuthSession.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } })
}

export async function authenticateSession(token: string): Promise<JwtPayload | null> {
  const session = await AuthSession.findOne({
    tokenHash: hashSessionToken(token),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
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

  return {
    id: String(user._id),
    role: user.role,
    email: user.email,
    name: user.name,
    sessionVersion: user.sessionVersion ?? 0,
    mfaVerifiedAt: session.mfaVerifiedAt?.getTime(),
    impersonatorId: session.impersonatorId ? String(session.impersonatorId) : undefined,
  }
}
