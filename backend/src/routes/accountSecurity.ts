import express, { type NextFunction, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import auth from '../middleware/auth.js'
import AuditLog from '../models/AuditLog.js'
import type { AuditAction } from '../types/enums.js'
import { createNotification } from '../lib/notifications.js'
import { graceEndsAt, isMfaEnabled, requiresMfa } from '../lib/mfa.js'
import { STAFF_ROLES } from '../lib/permissions.js'
import { requestIp } from '../lib/loginCredentials.js'
import { readSessionCookie, revokeSession, setSessionCookie } from '../lib/session.js'
import {
  clearTwoFactor,
  confirmTwoFactorEnrollment,
  loadTwoFactorUser,
  regenerateRecoveryCodes,
  remainingRecoveryCodes,
  startTwoFactorEnrollment,
  verifySecondFactor,
} from '../lib/auth/twoFactor.js'
import type { UserRole } from '../types/enums.js'

/**
 * 2FA volontaire du compte connecté (VENIO-117), pour tous les rôles :
 * monté sous /api/auth/2fa. Réservé au navigateur — le middleware refuse les
 * access tokens de l'app native sur ces chemins — et à la personne elle-même
 * (pas pendant une impersonation).
 */
const router = express.Router()

router.use(auth)
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.user!.deviceId || req.user!.impersonatorId) {
    res.status(403).json({ error: 'La sécurité du compte se gère depuis le navigateur, en votre nom propre.' })
    return
  }
  next()
})

export function securityPagePath(role: string): string {
  if (role === 'COMMERCIAL_EXTERNE') return '/commercial/securite'
  return STAFF_ROLES.includes(role as UserRole) ? '/admin/securite' : '/espace-client/securite'
}

function audit(req: Request, action: AuditAction, metadata: Record<string, unknown> = {}) {
  AuditLog.create({
    userId: req.user!.id,
    email: req.user!.email,
    action,
    ip: requestIp(req),
    userAgent: req.headers['user-agent'] || '',
    metadata,
  }).catch(() => {})
}

async function passwordMatches(hash: string | undefined, password: unknown): Promise<boolean> {
  return typeof password === 'string' && password.length > 0 && Boolean(hash) && bcrypt.compare(password, hash!)
}

// GET /api/auth/2fa/status
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await loadTwoFactorUser(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })
    return res.json({
      enabled: user.twoFactorEnabled,
      pendingSetup: !user.twoFactorEnabled && Boolean(user.twoFactorSecret),
      recoveryCodesRemaining: user.twoFactorEnabled ? remainingRecoveryCodes(user) : 0,
      // Obligatoire pour ce compte (rôle privilégié, MFA_ENABLED armé) : la désactivation ouvre une période de grâce.
      required: requiresMfa(user.role),
      enforced: isMfaEnabled(),
    })
  } catch (err) {
    return next(err)
  }
})

// POST /api/auth/2fa/setup { password } — génère le secret et l'URI otpauth (non actifs avant confirmation).
router.post('/setup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await loadTwoFactorUser(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })
    // Une session volée ne doit pas pouvoir verrouiller le compte avec son propre authentificateur.
    if (!(await passwordMatches(user.passwordHash, req.body?.password))) {
      return res.status(400).json({ error: 'Mot de passe incorrect', code: 'INVALID_PASSWORD' })
    }
    const started = await startTwoFactorEnrollment(user)
    if ('error' in started) return res.status(400).json({ error: '2FA déjà activée', code: started.error })
    return res.json(started)
  } catch (err) {
    return next(err)
  }
})

// POST /api/auth/2fa/confirm { code } — premier code : active la 2FA, renvoie les codes de secours une seule fois.
router.post('/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await loadTwoFactorUser(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })
    const outcome = await confirmTwoFactorEnrollment(user, req.body?.code)
    if ('error' in outcome) {
      const messages = {
        ALREADY_ENABLED: '2FA déjà activée',
        NO_PENDING_SETUP: 'Aucune configuration 2FA en cours',
        INVALID_CODE: 'Code invalide',
      } as const
      return res.status(400).json({ error: messages[outcome.error], code: outcome.error })
    }
    // Le code vient d'être vérifié : la session courante devient une session élevée.
    await revokeSession(readSessionCookie(req.headers.cookie))
    await setSessionCookie(res, user._id.toString(), { mfaVerifiedAt: new Date() })
    audit(req, 'MFA_ENABLED', { selfService: true })
    createNotification({
      recipient: user._id,
      type: 'TWO_FACTOR_ENABLED',
      title: '🔐 2FA activée',
      message: "L'authentification à deux facteurs est désormais active sur votre compte",
      link: securityPagePath(user.role),
    }).catch(() => {})
    return res.json({ enabled: true, recoveryCodes: outcome.recoveryCodes })
  } catch (err) {
    return next(err)
  }
})

// POST /api/auth/2fa/disable { password, code | recoveryCode }
router.post('/disable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await loadTwoFactorUser(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })
    if (!user.twoFactorEnabled) return res.status(400).json({ error: '2FA non activée', code: 'NOT_ENABLED' })
    if (!(await passwordMatches(user.passwordHash, req.body?.password))) {
      return res.status(400).json({ error: 'Mot de passe incorrect', code: 'INVALID_PASSWORD' })
    }
    const factor = await verifySecondFactor(user, { code: req.body?.code, recoveryCode: req.body?.recoveryCode })
    if (!factor.ok) return res.status(400).json({ error: 'Code 2FA invalide', code: 'INVALID_CODE' })
    await clearTwoFactor(user._id, requiresMfa(user.role) ? { mfaGraceUntil: graceEndsAt() } : {})
    audit(req, 'MFA_DISABLED', { selfService: true, method: factor.method })
    createNotification({
      recipient: user._id,
      type: 'TWO_FACTOR_DISABLED',
      title: '⚠️ 2FA désactivée',
      message: "L'authentification à deux facteurs a été désactivée sur votre compte",
      link: securityPagePath(user.role),
    }).catch(() => {})
    return res.json({ enabled: false })
  } catch (err) {
    return next(err)
  }
})

// POST /api/auth/2fa/recovery-codes { password, code } — nouveau jeu de 10 codes, les anciens sont invalidés.
router.post('/recovery-codes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await loadTwoFactorUser(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })
    if (!user.twoFactorEnabled) return res.status(400).json({ error: '2FA non activée', code: 'NOT_ENABLED' })
    if (!(await passwordMatches(user.passwordHash, req.body?.password))) {
      return res.status(400).json({ error: 'Mot de passe incorrect', code: 'INVALID_PASSWORD' })
    }
    const factor = await verifySecondFactor(user, { code: req.body?.code })
    if (!factor.ok) return res.status(400).json({ error: 'Code 2FA invalide', code: 'INVALID_CODE' })
    const recoveryCodes = await regenerateRecoveryCodes(user._id)
    audit(req, 'MFA_RECOVERY_CODES_REGENERATED')
    return res.json({ recoveryCodes })
  } catch (err) {
    return next(err)
  }
})

export default router
