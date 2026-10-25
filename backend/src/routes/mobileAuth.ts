import express, { type NextFunction, type Request, type Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import AuditLog from '../models/AuditLog.js'
import type { AuditAction } from '../types/enums.js'
import MobileDevice, { MOBILE_PLATFORMS } from '../models/MobileDevice.js'
import auth from '../middleware/auth.js'
import { resolvePermissions } from '../lib/permissions.js'
import { checkLoginCredentials, requestIp } from '../lib/loginCredentials.js'
import {
  canUseMobileApp,
  DEVICE_MAX_LIFETIME_MS,
  findDeviceIdByRefreshToken,
  issueDeviceTokens,
  revokeDevice,
  rotateRefreshToken,
  serializeDevice,
} from '../lib/mobileAuth.js'

const router = express.Router()

function rejectInvalid(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (errors.isEmpty()) return false
  res.status(400).json({ error: errors.array()[0]!.msg, code: 'VALIDATION_ERROR' })
  return true
}

function audit(req: Request, action: AuditAction, userId: unknown, email: string, metadata: Record<string, unknown>) {
  AuditLog.create({
    userId,
    email,
    action,
    ip: requestIp(req),
    userAgent: req.headers['user-agent'] || '',
    metadata: { channel: 'mobile', ...metadata },
  }).catch(() => {})
}

// POST /api/auth/mobile/login
router.post(
  '/login',
  body('email').isEmail().withMessage('Email invalide'),
  body('password').isString().notEmpty().withMessage('Mot de passe requis'),
  body('device.name').isString().trim().isLength({ min: 1, max: 100 }).withMessage("Nom d'appareil requis"),
  body('device.platform').isIn(MOBILE_PLATFORMS).withMessage('Plateforme inconnue'),
  body(['device.model', 'device.osVersion', 'device.appVersion']).optional().isString().trim().isLength({ max: 40 }),
  body('device.installationId')
    .optional()
    .matches(/^[A-Za-z0-9-]{8,100}$/)
    .withMessage("Identifiant d'installation invalide"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (rejectInvalid(req, res)) return

      const check = await checkLoginCredentials(req, { channel: 'mobile' })
      if (check.kind === 'rejected') return res.status(check.status).json(check.body)
      if (check.kind === 'mfa_required') return res.json({ requires2FA: true })
      const { user, mfaVerifiedAt, mfaEnrollmentOnly } = check

      if (!canUseMobileApp(user.role)) {
        audit(req, 'LOGIN_FAILED', user._id, user.email, { reason: 'mobile_role_not_allowed' })
        return res.status(403).json({ error: "L'app est réservée à l'équipe Venio.", code: 'MOBILE_ROLE_NOT_ALLOWED' })
      }
      // Le web accorde une session restreinte à l'enrôlement MFA ; l'app ne
      // sait pas enrôler, elle renvoie donc vers le navigateur.
      if (mfaEnrollmentOnly) {
        audit(req, 'LOGIN_FAILED', user._id, user.email, { reason: 'mfa_enrollment_required' })
        return res.status(403).json({
          error: 'Configurez la double authentification depuis le navigateur avant de vous connecter.',
          code: 'MFA_SETUP_REQUIRED',
        })
      }

      const { device: deviceInput } = req.body
      const installationId: string | null = deviceInput.installationId ?? null
      // Une reconnexion depuis la même installation remplace l'ancien appareil
      // au lieu d'en accumuler un par connexion.
      if (installationId) {
        const previous = await MobileDevice.find({ userId: user._id, installationId, revokedAt: null })
          .select('_id')
          .lean()
        for (const { _id } of previous) await revokeDevice(_id, 'REPLACED')
      }

      const ip = requestIp(req)
      const device = await MobileDevice.create({
        userId: user._id,
        name: String(deviceInput.name).trim(),
        platform: deviceInput.platform,
        model: deviceInput.model ?? '',
        osVersion: deviceInput.osVersion ?? '',
        appVersion: deviceInput.appVersion ?? '',
        installationId,
        sessionVersion: user.sessionVersion ?? 0,
        mfaVerifiedAt,
        expiresAt: new Date(Date.now() + DEVICE_MAX_LIFETIME_MS),
        lastIp: ip,
      })
      const tokens = await issueDeviceTokens(device)

      user.lastLoginAt = new Date()
      user.lastLoginIp = ip
      await user.save()
      audit(req, 'LOGIN_SUCCESS', user._id, user.email, { role: user.role, deviceId: String(device._id) })

      return res.json({
        ...tokens,
        device: serializeDevice(device.toObject(), String(device._id)),
        user: {
          id: String(user._id),
          name: user.name,
          email: user.email,
          role: user.role,
          isAssociate: user.isAssociate ?? false,
          permissions: resolvePermissions(user.role, user.grantedPermissions ?? [], user.deniedPermissions ?? []),
        },
      })
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/auth/mobile/refresh
router.post(
  '/refresh',
  body('refreshToken').isString().notEmpty().withMessage('Refresh token requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (rejectInvalid(req, res)) return
      const outcome = await rotateRefreshToken(req.body.refreshToken, requestIp(req))
      if (outcome.kind === 'reused') {
        audit(req, 'MOBILE_REFRESH_REUSE', outcome.userId, '', { deviceId: String(outcome.deviceId) })
      }
      if (outcome.kind !== 'rotated') {
        return res
          .status(401)
          .json({ error: 'Session expirée, veuillez vous reconnecter.', code: 'INVALID_REFRESH_TOKEN' })
      }
      return res.json(outcome.tokens)
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/auth/mobile/logout — la possession du refresh token suffit, pour
// qu'une app dont l'access token a expiré puisse quand même se déconnecter.
router.post(
  '/logout',
  body('refreshToken').isString().notEmpty().withMessage('Refresh token requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (rejectInvalid(req, res)) return
      const deviceId = await findDeviceIdByRefreshToken(req.body.refreshToken)
      if (deviceId && (await revokeDevice(deviceId, 'LOGOUT'))) {
        const device = await MobileDevice.findById(deviceId).select('userId').lean()
        audit(req, 'LOGOUT', device?.userId, '', { deviceId: String(deviceId) })
      }
      // Même réponse quel que soit le jeton : la route ne renseigne pas sur sa validité.
      return res.status(204).send()
    } catch (err) {
      return next(err)
    }
  },
)

// Appareils connectés : accessibles depuis le navigateur comme depuis l'app.
router.get('/devices', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const devices = await MobileDevice.find({
      userId: req.user!.id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .sort({ lastSeenAt: -1 })
      .lean()
    return res.json({ devices: devices.map((device) => serializeDevice(device, req.user!.deviceId)) })
  } catch (err) {
    return next(err)
  }
})

router.delete(
  '/devices/:id',
  auth,
  param('id').isMongoId().withMessage('Identifiant invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (rejectInvalid(req, res)) return
      const device = await MobileDevice.findOne({ _id: req.params.id, userId: req.user!.id, revokedAt: null })
        .select('_id')
        .lean()
      if (!device) return res.status(404).json({ error: 'Appareil introuvable', code: 'DEVICE_NOT_FOUND' })
      if (await revokeDevice(device._id, 'USER_REVOKED')) {
        audit(req, 'MOBILE_DEVICE_REVOKED', req.user!.id, req.user!.email, {
          deviceId: String(device._id),
          reason: 'USER_REVOKED',
        })
      }
      return res.status(204).send()
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/auth/mobile/devices/revoke-all — déconnecte tous les appareils,
// sauf celui qui fait la demande quand elle vient de l'app.
router.post('/devices/revoke-all', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const devices = await MobileDevice.find({
      userId: req.user!.id,
      revokedAt: null,
      ...(req.user!.deviceId ? { _id: { $ne: req.user!.deviceId } } : {}),
    })
      .select('_id')
      .lean()
    let revoked = 0
    for (const { _id } of devices) if (await revokeDevice(_id, 'REVOKE_ALL')) revoked += 1
    if (revoked > 0) {
      audit(req, 'MOBILE_DEVICE_REVOKED', req.user!.id, req.user!.email, { reason: 'REVOKE_ALL', count: revoked })
    }
    return res.json({ revoked })
  } catch (err) {
    return next(err)
  }
})

export default router
