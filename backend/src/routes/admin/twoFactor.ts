import express, { Request, Response, NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import User from '../../models/User.js'
import { createNotification } from '../../lib/notifications.js'
import AuditLog from '../../models/AuditLog.js'
import { graceEndsAt, isMfaEnabled, requiresMfa } from '../../lib/mfa.js'
import {
  clearTwoFactor,
  confirmTwoFactorEnrollment,
  loadTwoFactorUser,
  startTwoFactorEnrollment,
  verifySecondFactor,
} from '../../lib/auth/twoFactor.js'
import { buildActorFromReq, recordAudit } from '../../lib/audit/auditHelpers.js'
import { securityPagePath } from '../accountSecurity.js'
import { notifySuperAdmins } from '../../lib/notifyHelpers.js'
import { revokeSession, readSessionCookie, setSessionCookie } from '../../lib/session.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

/**
 * Refuse l'enrôlement quand le second facteur est désactivé globalement :
 * sans ce garde-fou on laisserait quelqu'un scanner un QR code pour un facteur
 * que la connexion ne demandera jamais. La désactivation et la lecture du
 * statut restent ouvertes, elles servent à revenir en arrière proprement.
 */
function requireMfaFeature(_req: Request, res: Response, next: NextFunction): void {
  if (!isMfaEnabled()) {
    res.status(409).json({
      error: 'MFA_DISABLED',
      message: 'La double authentification est désactivée sur cette instance.',
    })
    return
  }
  next()
}

// POST /api/admin/2fa/setup — Generate TOTP secret and QR code
router.post('/setup', requireMfaFeature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await loadTwoFactorUser(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })
    // Secret chiffré au repos, non actif tant qu'un premier code ne l'a pas confirmé.
    const started = await startTwoFactorEnrollment(user)
    if ('error' in started) return res.status(400).json({ error: '2FA déjà activé' })
    return res.json({ secret: started.secret, qrDataUrl: started.qrDataUrl, otpauthUri: started.otpauthUri })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/2fa/verify — Verify TOTP code and enable 2FA
router.post('/verify', requireMfaFeature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body
    if (!code) return res.status(400).json({ error: 'Code requis' })

    const user = await loadTwoFactorUser(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })
    const outcome = await confirmTwoFactorEnrollment(user, code)
    if ('error' in outcome) {
      if (outcome.error === 'NO_PENDING_SETUP')
        return res.status(400).json({ error: 'Aucune configuration 2FA en cours' })
      if (outcome.error === 'ALREADY_ENABLED') return res.status(400).json({ error: '2FA déjà activé' })
      return res.status(400).json({ error: 'Code invalide' })
    }
    const recovery = { codes: outcome.recoveryCodes }

    // The code has just been verified: rotate any enrollment-only or stale
    // session into a normal, freshly stepped-up session.
    const mfaVerifiedAt = new Date()
    await revokeSession(readSessionCookie(req.headers.cookie))
    await setSessionCookie(res, user._id.toString(), { mfaVerifiedAt })

    AuditLog.create({
      userId: user._id,
      email: user.email,
      action: 'MFA_ENABLED',
      ip: req.headers['x-forwarded-for'] || req.ip || '',
      userAgent: req.headers['user-agent'] || '',
    }).catch(() => {})

    // Notif à l'utilisateur (confirmation sécurité)
    createNotification({
      recipient: user._id,
      type: 'TWO_FACTOR_ENABLED',
      title: `🔐 2FA activée`,
      message: `L'authentification à deux facteurs est désormais active sur votre compte`,
      link: `/admin/profile`,
    }).catch(() => {})

    // Recovery codes are intentionally returned exactly once, at enrollment.
    return res.json({ enabled: true, recoveryCodes: recovery.codes })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/2fa/disable — Disable 2FA
router.post('/disable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await loadTwoFactorUser(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })

    const { code } = req.body || {}
    if (!user.twoFactorSecret || !(await verifySecondFactor(user, { code })).ok) {
      return res.status(400).json({ error: 'Un code MFA valide est requis pour désactiver la MFA' })
    }

    await clearTwoFactor(user._id, { mfaGraceUntil: graceEndsAt() })

    AuditLog.create({
      userId: user._id,
      email: user.email,
      action: 'MFA_DISABLED',
      ip: req.headers['x-forwarded-for'] || req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      metadata: { selfService: true },
    }).catch(() => {})

    // Notif alerte sécurité à l'utilisateur
    createNotification({
      recipient: user._id,
      type: 'TWO_FACTOR_DISABLED',
      title: `⚠️ 2FA désactivée`,
      message: `L'authentification à deux facteurs a été désactivée sur votre compte`,
      link: `/admin/profile`,
    }).catch(() => {})
    notifySuperAdmins({
      type: 'TWO_FACTOR_DISABLED',
      title: '⚠️ MFA désactivée',
      message: `La MFA a été désactivée pour ${user.email}. Réenrôlement requis sous 7 jours.`,
      link: '/admin/users',
    }).catch(() => {})

    return res.json({ enabled: false })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/2fa/step-up — exchange a TOTP/recovery code for a 15 minute MFA claim.
router.post('/step-up', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await loadTwoFactorUser(req.user!.id)
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) return res.status(400).json({ error: 'MFA non configurée' })
    const { code, recoveryCode } = req.body || {}
    const factor = await verifySecondFactor(user, { code, recoveryCode })
    if (!factor.ok) return res.status(401).json({ error: 'Code MFA invalide' })
    if (factor.method === 'recovery') {
      AuditLog.create({
        userId: user._id,
        email: user.email,
        action: 'MFA_RECOVERY_CODE_USED',
        ip: req.headers['x-forwarded-for'] || req.ip || '',
        userAgent: req.headers['user-agent'] || '',
      }).catch(() => {})
    }
    const mfaVerifiedAt = Date.now()
    // Replace the pre-step-up session so a stolen pre-MFA cookie cannot retain
    // a valid session alongside the elevated one.
    await revokeSession(readSessionCookie(req.headers.cookie))
    await setSessionCookie(res, user._id.toString(), { mfaVerifiedAt: new Date(mfaVerifiedAt) })
    AuditLog.create({
      userId: user._id,
      email: user.email,
      action: 'MFA_STEP_UP',
      ip: req.headers['x-forwarded-for'] || req.ip || '',
      userAgent: req.headers['user-agent'] || '',
    }).catch(() => {})
    return res.json({ mfaVerifiedAt })
  } catch (err) {
    return next(err)
  }
})

// GET /api/admin/2fa/status — Check if 2FA is enabled
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.id).select('twoFactorEnabled')
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })
    return res.json({ enabled: user.twoFactorEnabled, enforced: isMfaEnabled() })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/2fa/users/:userId/reset — le super-admin retire la 2FA d'un membre
// (authentificateur perdu, codes de secours épuisés). Audité ; le membre est prévenu.
router.post('/users/:userId/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: "Seul le Super Admin peut réinitialiser la 2FA d'un membre" })
    }
    if (req.user!.impersonatorId || req.user!.deviceId) {
      return res.status(403).json({ error: 'Action réservée au navigateur, en votre nom propre.' })
    }
    if (!/^[a-f\d]{24}$/i.test(String(req.params.userId)))
      return res.status(400).json({ error: 'Identifiant invalide' })
    if (String(req.params.userId) === String(req.user!.id)) {
      return res.status(400).json({ error: 'Utilisez la page Sécurité pour votre propre compte.' })
    }
    const target = await User.findById(req.params.userId).select('email name role twoFactorEnabled')
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' })
    if (!target.twoFactorEnabled) return res.status(400).json({ error: "La 2FA n'est pas activée sur ce compte" })

    await clearTwoFactor(target._id, requiresMfa(target.role) ? { mfaGraceUntil: graceEndsAt() } : {})
    await recordAudit({
      action: 'MFA_RESET_BY_ADMIN',
      actor: buildActorFromReq(req),
      entityType: 'User',
      entityId: String(target._id),
      entityRef: target.email,
      summary: `2FA réinitialisée pour ${target.email}`,
      before: { twoFactorEnabled: true },
      after: { twoFactorEnabled: false },
    })
    createNotification({
      recipient: target._id,
      type: 'TWO_FACTOR_DISABLED',
      title: '⚠️ 2FA réinitialisée',
      message: "Un super-administrateur a réinitialisé l'authentification à deux facteurs de votre compte",
      link: securityPagePath(target.role),
    }).catch(() => {})
    return res.json({ reset: true })
  } catch (err) {
    return next(err)
  }
})

export default router
