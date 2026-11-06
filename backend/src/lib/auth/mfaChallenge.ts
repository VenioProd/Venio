import crypto from 'node:crypto'
import type { Types } from 'mongoose'
import MfaChallenge from '../../models/MfaChallenge.js'

/** Délai laissé pour saisir le code après le mot de passe. */
export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000
/** Au-delà, le jeton est brûlé et il faut ressaisir le mot de passe. */
export const MFA_CHALLENGE_MAX_ATTEMPTS = 5
const TOKEN_PREFIX = 'mfa_'

function hashChallengeToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function createMfaChallenge(
  user: { _id: Types.ObjectId; sessionVersion?: number },
  options: { passwordNeedsUpgrade?: boolean; now?: Date } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const now = options.now ?? new Date()
  const token = TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + MFA_CHALLENGE_TTL_MS)
  await MfaChallenge.create({
    userId: user._id,
    tokenHash: hashChallengeToken(token),
    sessionVersion: user.sessionVersion ?? 0,
    passwordNeedsUpgrade: options.passwordNeedsUpgrade ?? false,
    expiresAt,
  })
  return { token, expiresAt }
}

/**
 * Réserve une tentative sur le jeton : renvoie le défi s'il est encore
 * utilisable (non expiré, non consommé, tentatives restantes), sinon null.
 * L'incrément est atomique, donc le plafond tient même en parallèle.
 */
export async function reserveMfaChallengeAttempt(token: unknown, now = new Date()) {
  if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX) || token.length > 128) return null
  return MfaChallenge.findOneAndUpdate(
    {
      tokenHash: hashChallengeToken(token),
      usedAt: null,
      expiresAt: { $gt: now },
      attempts: { $lt: MFA_CHALLENGE_MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { new: true },
  ).lean()
}

/** Marque le défi consommé ; false si une autre requête l'a consommé entre-temps. */
export async function completeMfaChallenge(challengeId: Types.ObjectId, now = new Date()): Promise<boolean> {
  const result = await MfaChallenge.updateOne({ _id: challengeId, usedAt: null }, { $set: { usedAt: now } })
  return result.modifiedCount === 1
}

export async function revokeMfaChallenges(userId: Types.ObjectId | string): Promise<void> {
  await MfaChallenge.deleteMany({ userId })
}
