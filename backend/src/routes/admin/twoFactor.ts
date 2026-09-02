import express, { Request, Response, NextFunction } from 'express'
import { TOTP } from 'otpauth'
import QRCode from 'qrcode'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import User from '../../models/User.js'
import { createNotification } from '../../lib/notifications.js'
import AuditLog from '../../models/AuditLog.js'
import {
  createRecoveryCodes,
  consumeRecoveryCode,
  createTotpSecret,
  graceEndsAt,
  isMfaEnabled,
  verifyTotp,
} from '../../lib/mfa.js'
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
    const user = await User.findById(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })

    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA déjà activé' })
    }

    // OTPAuth accepts RFC 4648 base32 secrets only.
    const secret = createTotpSecret()

    const totp = new TOTP({
      issuer: 'Venio',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    })

    const otpauthUrl = totp.toString()
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl)

    // Store secret temporarily (not yet enabled)
    user.twoFactorSecret = secret
    await user.save()

    return res.json({ secret, qrDataUrl })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/2fa/verify — Verify TOTP code and enable 2FA
router.post('/verify', requireMfaFeature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body
    if (!code) return res.status(400).json({ error: 'Code requis' })

    const user = await User.findById(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })
    if (!user.twoFactorSecret) return res.status(400).json({ error: 'Aucune configuration 2FA en cours' })

    const totp = new TOTP({
      issuer: 'Venio',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: user.twoFactorSecret,
    })

    const delta = totp.validate({ token: String(code), window: 1 })
    if (delta === null) {
      return res.status(400).json({ error: 'Code invalide' })
    }

    user.twoFactorEnabled = true
    const recovery = await createRecoveryCodes()
    user.twoFactorRecoveryCodeHashes = recovery.hashes
    user.mfaGraceUntil = null
    await user.save()

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
    const user = await User.findById(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })

    const { code } = req.body || {}
    if (!user.twoFactorSecret || !verifyTotp(user.twoFactorSecret, user.email, code)) {
      return res.status(400).json({ error: 'Un code MFA valide est requis pour désactiver la MFA' })
    }

    user.twoFactorSecret = null
    user.twoFactorEnabled = false
    user.twoFactorRecoveryCodeHashes = []
    user.mfaGraceUntil = graceEndsAt()
    await user.save()

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
    const user = await User.findById(req.user!.id)
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) return res.status(400).json({ error: 'MFA non configurée' })
    const { code, recoveryCode } = req.body || {}
    const validTotp = code && verifyTotp(user.twoFactorSecret, user.email, code)
    const recovery = validTotp
      ? { valid: false, hashes: user.twoFactorRecoveryCodeHashes ?? [] }
      : await consumeRecoveryCode(user.twoFactorRecoveryCodeHashes ?? [], recoveryCode)
    if (!validTotp && !recovery.valid) return res.status(401).json({ error: 'Code MFA invalide' })
    if (recovery.valid) {
      user.twoFactorRecoveryCodeHashes = recovery.hashes
      await user.save()
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
    const user = await User.findById(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })
    return res.json({ enabled: user.twoFactorEnabled, enforced: isMfaEnabled() })
  } catch (err) {
    return next(err)
  }
})

export default router
