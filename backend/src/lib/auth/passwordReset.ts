import crypto from 'node:crypto'
import type { Types } from 'mongoose'
import PasswordResetToken from '../../models/PasswordResetToken.js'
import MfaChallenge from '../../models/MfaChallenge.js'

/** Durée de validité d'un lien de réinitialisation. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000

/** Réponse unique de « mot de passe oublié », que le compte existe ou non. */
export const FORGOT_PASSWORD_MESSAGE = 'Si un compte existe avec cet email, un lien de reinitialisation a ete envoye.'
export const INVALID_RESET_LINK_MESSAGE = 'Lien de reinitialisation expire ou invalide.'

export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Émet un jeton pour l'utilisateur et invalide tous ses jetons encore
 * inutilisés : seul le dernier lien envoyé fonctionne.
 */
export async function issuePasswordResetToken(
  userId: Types.ObjectId | string,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  await invalidatePasswordResetTokens(userId)
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS)
  await PasswordResetToken.create({ userId, tokenHash: hashResetToken(token), expiresAt })
  return { token, expiresAt }
}

/** Supprime les jetons non utilisés d'un utilisateur (nouvelle demande, mot de passe changé). */
export async function invalidatePasswordResetTokens(userId: Types.ObjectId | string): Promise<number> {
  const { deletedCount } = await PasswordResetToken.deleteMany({ userId, usedAt: null })
  return deletedCount ?? 0
}

function looksLikeToken(token: unknown): token is string {
  return typeof token === 'string' && /^[a-f0-9]{64}$/i.test(token)
}

/** Lecture sans consommation : sert à valider le nouveau mot de passe avant de brûler le jeton. */
export async function findUsablePasswordResetToken(token: unknown, now = new Date()) {
  if (!looksLikeToken(token)) return null
  return PasswordResetToken.findOne({
    tokenHash: hashResetToken(token),
    usedAt: null,
    expiresAt: { $gt: now },
  }).lean()
}

/**
 * Consommation atomique : deux requêtes simultanées avec le même jeton ne
 * peuvent pas réussir toutes les deux. Renvoie l'identifiant de l'utilisateur
 * ou null (jeton inconnu, expiré ou déjà utilisé).
 */
export async function consumePasswordResetToken(token: unknown, now = new Date()): Promise<Types.ObjectId | null> {
  if (!looksLikeToken(token)) return null
  const entry = await PasswordResetToken.findOneAndUpdate(
    { tokenHash: hashResetToken(token), usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true },
  ).lean()
  return entry?.userId ?? null
}

/** Index des collections d'authentification ajoutées par VENIO-116/117 (migration 013). */
export async function ensureAuthHardeningIndexes(dryRun = false) {
  const counts = {
    passwordResetTokens: await PasswordResetToken.estimatedDocumentCount(),
    mfaChallenges: await MfaChallenge.estimatedDocumentCount(),
  }
  if (dryRun) return { dryRun: true, ...counts }
  await PasswordResetToken.createIndexes()
  await MfaChallenge.createIndexes()
  return { dryRun: false, ...counts }
}
