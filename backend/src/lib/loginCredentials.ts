import bcrypt from 'bcryptjs'
import type { Request } from 'express'
import type { HydratedDocument } from 'mongoose'
import User from '../models/User.js'
import AuditLog from '../models/AuditLog.js'
import type { IUser } from '../types/models/index.js'
import { graceEndsAt, requiresMfa } from './mfa.js'
import { passwordNeedsUpgrade } from './auth/passwordPolicy.js'
import { TWO_FACTOR_SELECT, consumeRecoveryCodeOnce, verifyTotpOnce } from './auth/twoFactor.js'

// Empreinte factice : un e-mail inconnu coûte le même temps de hachage qu'un
// mot de passe faux, la durée de réponse ne trahit pas l'existence du compte.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('venio-timing-equalizer', 10)

export type CredentialCheck =
  | { kind: 'rejected'; status: number; body: { error: string } }
  | { kind: 'mfa_required'; user: HydratedDocument<IUser>; passwordNeedsUpgrade: boolean }
  | {
      kind: 'accepted'
      user: HydratedDocument<IUser>
      mfaVerifiedAt: Date | null
      mfaEnrollmentOnly: boolean
      /** Mot de passe valide mais hors politique (VENIO-117) : à renforcer, sans blocage. */
      passwordNeedsUpgrade: boolean
    }

export function requestIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded) || req.ip || ''
}

/**
 * Vérification commune au login navigateur et au login de l'app native :
 * mot de passe, compte actif, second facteur et période de grâce MFA, avec les
 * mêmes entrées de journal d'audit. Les modifications du document (grâce
 * initialisée) sont à enregistrer par l'appelant.
 *
 * Un compte dont la 2FA est active reçoit `mfa_required` tant qu'aucun code
 * n'accompagne le mot de passe. Le navigateur poursuit en deux temps
 * (POST /api/auth/mfa/verify) ; l'app native renvoie identifiants et code
 * dans la même requête, parcours conservé ici.
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

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select(TWO_FACTOR_SELECT)
  if (!user) {
    await bcrypt.compare(String(password ?? ''), DUMMY_PASSWORD_HASH)
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

  const needsUpgrade = passwordNeedsUpgrade(password, { email: user.email, name: user.name })
  let mfaVerifiedAt: Date | null = null
  let mfaEnrollmentOnly = false
  // 2FA volontaire ou obligatoire : dès qu'elle est active sur le compte, elle
  // est demandée. Le code de secours est consommé atomiquement avec la connexion.
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    if (!totpCode && !recoveryCode) return { kind: 'mfa_required', user, passwordNeedsUpgrade: needsUpgrade }
    const validTotp = Boolean(totpCode) && (await verifyTotpOnce(user, totpCode))
    const validRecovery = !validTotp && Boolean(recoveryCode) && (await consumeRecoveryCodeOnce(user, recoveryCode))
    if (!validTotp && !validRecovery) {
      audit('LOGIN_FAILED', user._id, { reason: '2fa_invalid' })
      return { kind: 'rejected', status: 401, body: { error: 'Code 2FA invalide' } }
    }
    if (validRecovery) audit('MFA_RECOVERY_CODE_USED', user._id)
    mfaVerifiedAt = new Date()
  } else if (requiresMfa(user.role)) {
    // Rolling grace is initialized on first login, rather than at deploy,
    // so existing administrators are never locked out by a release.
    if (!user.mfaGraceUntil) user.mfaGraceUntil = graceEndsAt()
    if (user.mfaGraceUntil.getTime() <= Date.now()) mfaEnrollmentOnly = true
  }

  return { kind: 'accepted', user, mfaVerifiedAt, mfaEnrollmentOnly, passwordNeedsUpgrade: needsUpgrade }
}
