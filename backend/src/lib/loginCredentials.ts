import bcrypt from 'bcryptjs'
import type { Request } from 'express'
import type { HydratedDocument } from 'mongoose'
import User from '../models/User.js'
import AuditLog from '../models/AuditLog.js'
import type { IUser } from '../types/models/index.js'
import { consumeRecoveryCode, graceEndsAt, isMfaEnabled, requiresMfa, verifyTotp } from './mfa.js'

export type CredentialCheck =
  | { kind: 'rejected'; status: number; body: { error: string } }
  | { kind: 'mfa_required' }
  | {
      kind: 'accepted'
      user: HydratedDocument<IUser>
      mfaVerifiedAt: Date | null
      mfaEnrollmentOnly: boolean
    }

export function requestIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded) || req.ip || ''
}

/**
 * Vérification commune au login navigateur et au login de l'app native :
 * mot de passe, compte actif, second facteur et période de grâce MFA, avec les
 * mêmes entrées de journal d'audit. Les modifications du document (codes de
 * secours consommés, grâce initialisée) sont à enregistrer par l'appelant.
 */
export async function checkLoginCredentials(
  req: Request,
  auditMetadata: Record<string, unknown> = {},
): Promise<CredentialCheck> {
  const { email, password, totpCode, recoveryCode } = req.body
  const ip = requestIp(req)
  const userAgent = req.headers['user-agent'] || ''
  const audit = (action: 'LOGIN_FAILED' | 'MFA_RECOVERY_CODE_USED', userId: unknown, metadata = {}) => {
    AuditLog.create({ userId, email, action, ip, userAgent, metadata: { ...metadata, ...auditMetadata } }).catch(
      () => {},
    )
  }

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select(
    '+twoFactorSecret +twoFactorRecoveryCodeHashes',
  )
  if (!user) {
    audit('LOGIN_FAILED', undefined, { reason: 'user_not_found' })
    return { kind: 'rejected', status: 401, body: { error: 'Identifiants invalides' } }
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    audit('LOGIN_FAILED', user._id, { reason: 'bad_password' })
    return { kind: 'rejected', status: 401, body: { error: 'Identifiants invalides' } }
  }

  // Every inactive or archived account is blocked, including administrators.
  if (!user.isActive || user.status === 'ARCHIVE') {
    audit('LOGIN_FAILED', user._id, { reason: 'account_archived' })
    return {
      kind: 'rejected',
      status: 403,
      body: { error: 'Votre accès a été désactivé. Contactez votre chargé de compte.' },
    }
  }

  let mfaVerifiedAt: Date | null = null
  let mfaEnrollmentOnly = false
  // Check 2FA, including a single-use recovery code when the authenticator
  // is unavailable. A recovery code is consumed atomically with the login.
  if (isMfaEnabled() && user.twoFactorEnabled && user.twoFactorSecret) {
    if (!totpCode && !recoveryCode) return { kind: 'mfa_required' }
    const validTotp = totpCode && verifyTotp(user.twoFactorSecret, user.email, totpCode)
    const recovery = validTotp
      ? { valid: false, hashes: user.twoFactorRecoveryCodeHashes ?? [] }
      : await consumeRecoveryCode(user.twoFactorRecoveryCodeHashes ?? [], recoveryCode)
    if (!validTotp && !recovery.valid) {
      audit('LOGIN_FAILED', user._id, { reason: '2fa_invalid' })
      return { kind: 'rejected', status: 401, body: { error: 'Code 2FA invalide' } }
    }
    if (recovery.valid) {
      // Consommation atomique en base : deux connexions simultanées avec le
      // même code ne peuvent pas réussir toutes les deux. Le tableau en mémoire
      // n'est pas réécrit, pour qu'une sauvegarde ultérieure du document ne
      // fasse pas renaître un code consommé entre-temps par une autre requête.
      const usedHash = (user.twoFactorRecoveryCodeHashes ?? []).find((hash) => !recovery.hashes.includes(hash))
      const pulled = await User.updateOne(
        { _id: user._id, twoFactorRecoveryCodeHashes: usedHash },
        { $pull: { twoFactorRecoveryCodeHashes: usedHash } },
      )
      if (pulled.modifiedCount !== 1) {
        audit('LOGIN_FAILED', user._id, { reason: '2fa_invalid' })
        return { kind: 'rejected', status: 401, body: { error: 'Code 2FA invalide' } }
      }
      audit('MFA_RECOVERY_CODE_USED', user._id)
    }
    mfaVerifiedAt = new Date()
  } else if (requiresMfa(user.role)) {
    // Rolling grace is initialized on first login, rather than at deploy,
    // so existing administrators are never locked out by a release.
    if (!user.mfaGraceUntil) user.mfaGraceUntil = graceEndsAt()
    if (user.mfaGraceUntil.getTime() <= Date.now()) mfaEnrollmentOnly = true
  }

  return { kind: 'accepted', user, mfaVerifiedAt, mfaEnrollmentOnly }
}
