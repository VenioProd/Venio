import QRCode from 'qrcode'
import type { HydratedDocument, Types } from 'mongoose'
import User from '../../models/User.js'
import type { IUser } from '../../types/models/index.js'
import { decryptSecret, encryptSecret } from '../secretBox.js'
import { consumeRecoveryCode, createRecoveryCodes } from '../mfa.js'
import { buildOtpauthUri, generateTotpSecret, matchTotpStep } from './totp.js'

/**
 * Second facteur TOTP (VENIO-117), optionnel pour tous les comptes.
 *
 * - Le secret est chiffré au repos (secretBox, clé CREDENTIALS_KEY) ; les
 *   secrets enregistrés en clair avant ce changement restent lisibles et sont
 *   rechiffrés au prochain enrôlement.
 * - Un code TOTP n'est accepté qu'une fois : le dernier pas de temps accepté
 *   est mémorisé et tout pas inférieur ou égal est refusé (anti-rejeu).
 * - Les 10 codes de secours ne sont stockés que hachés et sont à usage unique.
 */

// Typée string : une projection littérale ferait déduire à Mongoose un document partiel.
export const TWO_FACTOR_SELECT: string = '+twoFactorSecret +twoFactorRecoveryCodeHashes +twoFactorLastUsedStep'

type UserDoc = HydratedDocument<IUser>

export function sealTotpSecret(secret: string): string {
  return encryptSecret(secret)
}

export function openTotpSecret(stored: string | null | undefined): string {
  return stored ? decryptSecret(stored) : ''
}

export async function loadTwoFactorUser(userId: Types.ObjectId | string): Promise<UserDoc | null> {
  // Le modèle User est typé par inférence du schéma : on revient à l'interface du domaine.
  return (await User.findById(userId).select(TWO_FACTOR_SELECT)) as unknown as UserDoc | null
}

/**
 * Vérifie un code TOTP et le « brûle » atomiquement : le même code (ou un code
 * plus ancien de la fenêtre) ne passe plus, même depuis une requête parallèle.
 */
export async function verifyTotpOnce(
  user: Pick<IUser, 'twoFactorSecret'> & { _id: Types.ObjectId },
  code: unknown,
  atMs = Date.now(),
): Promise<boolean> {
  const step = matchTotpStep(openTotpSecret(user.twoFactorSecret), code, { atMs })
  if (step === null) return false
  const result = await User.updateOne(
    {
      _id: user._id,
      $or: [{ twoFactorLastUsedStep: null }, { twoFactorLastUsedStep: { $lt: step } }],
    },
    { $set: { twoFactorLastUsedStep: step } },
  )
  return result.modifiedCount === 1
}

/**
 * Consomme atomiquement un code de secours. Le tableau du document en mémoire
 * n'est pas réécrit : une sauvegarde ultérieure ne doit pas faire renaître un
 * code consommé entre-temps par une autre requête.
 */
export async function consumeRecoveryCodeOnce(
  user: Pick<IUser, 'twoFactorRecoveryCodeHashes'> & { _id: Types.ObjectId },
  recoveryCode: unknown,
): Promise<boolean> {
  const hashes = user.twoFactorRecoveryCodeHashes ?? []
  const outcome = await consumeRecoveryCode(hashes, recoveryCode)
  if (!outcome.valid) return false
  const usedHash = hashes.find((hash) => !outcome.hashes.includes(hash))
  const pulled = await User.updateOne(
    { _id: user._id, twoFactorRecoveryCodeHashes: usedHash },
    { $pull: { twoFactorRecoveryCodeHashes: usedHash } },
  )
  return pulled.modifiedCount === 1
}

export type SecondFactorOutcome = { ok: true; method: 'totp' | 'recovery' } | { ok: false }

/** Code TOTP ou, à défaut, code de secours. */
export async function verifySecondFactor(
  user: UserDoc,
  input: { code?: unknown; recoveryCode?: unknown },
): Promise<SecondFactorOutcome> {
  if (!user.twoFactorEnabled || !user.twoFactorSecret) return { ok: false }
  if (input.code && (await verifyTotpOnce(user, input.code))) return { ok: true, method: 'totp' }
  if (input.recoveryCode && (await consumeRecoveryCodeOnce(user, input.recoveryCode))) {
    return { ok: true, method: 'recovery' }
  }
  return { ok: false }
}

export type EnrollmentStart = { secret: string; otpauthUri: string; qrDataUrl: string }

/**
 * Première étape : génère un secret (non actif tant qu'il n'est pas confirmé
 * par un code) et l'URI otpauth à scanner. Recommencer remplace le secret.
 */
export async function startTwoFactorEnrollment(user: UserDoc): Promise<EnrollmentStart | { error: 'ALREADY_ENABLED' }> {
  if (user.twoFactorEnabled) return { error: 'ALREADY_ENABLED' }
  const secret = generateTotpSecret()
  const otpauthUri = buildOtpauthUri(secret, user.email)
  user.twoFactorSecret = sealTotpSecret(secret)
  user.twoFactorLastUsedStep = null
  await user.save()
  const qrDataUrl = await QRCode.toDataURL(otpauthUri)
  return { secret, otpauthUri, qrDataUrl }
}

/** Deuxième étape : un premier code valide active la 2FA et renvoie les codes de secours, une seule fois. */
export async function confirmTwoFactorEnrollment(
  user: UserDoc,
  code: unknown,
): Promise<{ recoveryCodes: string[] } | { error: 'ALREADY_ENABLED' | 'NO_PENDING_SETUP' | 'INVALID_CODE' }> {
  if (user.twoFactorEnabled) return { error: 'ALREADY_ENABLED' }
  if (!user.twoFactorSecret) return { error: 'NO_PENDING_SETUP' }
  if (!(await verifyTotpOnce(user, code))) return { error: 'INVALID_CODE' }
  const recovery = await createRecoveryCodes()
  // Le secret en attente peut dater d'avant le chiffrement au repos.
  const plain = openTotpSecret(user.twoFactorSecret)
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        twoFactorEnabled: true,
        twoFactorSecret: sealTotpSecret(plain),
        twoFactorRecoveryCodeHashes: recovery.hashes,
        mfaGraceUntil: null,
      },
    },
  )
  user.twoFactorEnabled = true
  return { recoveryCodes: recovery.codes }
}

/** Nouveau jeu de 10 codes de secours ; les anciens cessent de fonctionner. */
export async function regenerateRecoveryCodes(userId: Types.ObjectId | string): Promise<string[]> {
  const recovery = await createRecoveryCodes()
  await User.updateOne({ _id: userId }, { $set: { twoFactorRecoveryCodeHashes: recovery.hashes } })
  return recovery.codes
}

/** Désactive la 2FA et efface le secret, les codes de secours et l'anti-rejeu. */
export async function clearTwoFactor(userId: Types.ObjectId | string, extra: Record<string, unknown> = {}) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodeHashes: [],
        twoFactorLastUsedStep: null,
        ...extra,
      },
    },
  )
}

export function remainingRecoveryCodes(user: Pick<IUser, 'twoFactorRecoveryCodeHashes'>): number {
  return (user.twoFactorRecoveryCodeHashes ?? []).length
}
