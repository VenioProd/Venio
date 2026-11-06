import express, { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { body, validationResult } from 'express-validator'
import User from '../models/User.js'
import AuditLog from '../models/AuditLog.js'
import { ADMIN_ROLES, STAFF_ROLES, resolvePermissions } from '../lib/permissions.js'
import { sendPasswordResetEmail } from '../lib/email.js'
import auth from '../middleware/auth.js'
import { avatarsDir } from './avatars.js'
import { requiresMfa } from '../lib/mfa.js'
import { checkLoginCredentials, requestIp } from '../lib/loginCredentials.js'
import {
  clearSessionCookie,
  readSessionCookie,
  revokeSession,
  revokeUserSessions,
  setSessionCookie,
} from '../lib/session.js'
import logger from '../lib/logger.js'
import { checkPasswordPolicy } from '../lib/auth/passwordPolicy.js'
import {
  FORGOT_PASSWORD_MESSAGE,
  INVALID_RESET_LINK_MESSAGE,
  consumePasswordResetToken,
  findUsablePasswordResetToken,
  invalidatePasswordResetTokens,
  issuePasswordResetToken,
} from '../lib/auth/passwordReset.js'
import {
  MFA_CHALLENGE_TTL_MS,
  completeMfaChallenge,
  createMfaChallenge,
  reserveMfaChallengeAttempt,
  revokeMfaChallenges,
} from '../lib/auth/mfaChallenge.js'
import { loadTwoFactorUser, verifySecondFactor } from '../lib/auth/twoFactor.js'
import accountSecurityRoutes from './accountSecurity.js'

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarsDir),
  filename: (req, file, cb) => {
    const MIME_TO_EXT: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    }
    const ext = MIME_TO_EXT[file.mimetype] ?? '.jpg'
    cb(null, req.user!.id + ext)
  },
})

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Type de fichier non autorisé. Utilisez JPEG, PNG ou WebP.'))
    }
  },
})

const router = express.Router()

/** Réponse d'erreur homogène de la politique de mot de passe (VENIO-117). */
function rejectWeakPassword(
  res: Response,
  password: unknown,
  identity: { email?: string | null; name?: string | null },
): boolean {
  const verdict = checkPasswordPolicy(password, identity)
  if (verdict.ok) return false
  res.status(400).json({ error: verdict.message, code: verdict.code })
  return true
}

/** Corps de réponse d'une connexion réussie (session déjà posée en cookie). */
function loginSuccessBody(
  user: { role: string; twoFactorEnabled?: boolean; mfaGraceUntil?: Date | null },
  needsUpgrade: boolean,
) {
  return {
    ...(requiresMfa(user.role) && !user.twoFactorEnabled
      ? { mfaEnrollmentRequired: true, mfaGraceUntil: user.mfaGraceUntil }
      : {}),
    ...(needsUpgrade ? { passwordNeedsUpgrade: true } : {}),
  }
}

// POST /api/auth/login
router.post(
  '/login',
  body('email').isEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Mot de passe requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const { email } = req.body
      const clientIp = requestIp(req)
      const userAgent = req.headers['user-agent'] || ''

      const check = await checkLoginCredentials(req)
      if (check.kind === 'rejected') return res.status(check.status).json(check.body)
      if (check.kind === 'mfa_required') {
        // Connexion en deux temps : le mot de passe est validé, le code 2FA est
        // attendu sur /api/auth/mfa/verify avec ce jeton de courte durée.
        const challenge = await createMfaChallenge(check.user, { passwordNeedsUpgrade: check.passwordNeedsUpgrade })
        return res.json({
          mfaRequired: true,
          // Compatibilité avec les clients antérieurs (app native, ancien front).
          requires2FA: true,
          mfaToken: challenge.token,
          mfaTokenExpiresIn: Math.round(MFA_CHALLENGE_TTL_MS / 1000),
        })
      }
      const { user, mfaVerifiedAt, mfaEnrollmentOnly, passwordNeedsUpgrade } = check

      AuditLog.create({
        userId: user._id,
        email,
        action: 'LOGIN_SUCCESS',
        ip: clientIp,
        userAgent,
        metadata: { role: user.role },
      }).catch(() => {})

      // Track last login
      user.lastLoginAt = new Date()
      user.lastLoginIp = clientIp
      user.save().catch(() => {})

      await setSessionCookie(res, user._id.toString(), {
        ...(mfaVerifiedAt ? { mfaVerifiedAt } : {}),
        ...(mfaEnrollmentOnly ? { mfaEnrollmentOnly: true } : {}),
      })
      return res.json(loginSuccessBody(user, passwordNeedsUpgrade))
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/auth/mfa/verify — second temps de la connexion : jeton du premier temps + code TOTP ou de secours.
router.post(
  '/mfa/verify',
  body('mfaToken').isString().notEmpty().withMessage('Jeton de connexion requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }
      const { mfaToken, code, recoveryCode } = req.body || {}
      const ip = requestIp(req)
      const userAgent = req.headers['user-agent'] || ''
      const expired = () =>
        res.status(401).json({
          error: 'Session de connexion expirée, veuillez ressaisir votre mot de passe.',
          code: 'MFA_TOKEN_INVALID',
        })

      const challenge = await reserveMfaChallengeAttempt(mfaToken)
      if (!challenge) return expired()
      const user = await loadTwoFactorUser(challenge.userId)
      // Mot de passe changé, compte désactivé ou 2FA retirée depuis le premier temps.
      if (
        !user ||
        !user.isActive ||
        user.status === 'ARCHIVE' ||
        (user.sessionVersion ?? 0) !== challenge.sessionVersion ||
        !user.twoFactorEnabled
      ) {
        await completeMfaChallenge(challenge._id)
        return expired()
      }

      const outcome = await verifySecondFactor(user, { code, recoveryCode })
      if (!outcome.ok) {
        AuditLog.create({
          userId: user._id,
          email: user.email,
          action: 'LOGIN_FAILED',
          ip,
          userAgent,
          metadata: { reason: '2fa_invalid', step: 'mfa_verify' },
        }).catch(() => {})
        return res.status(401).json({ error: 'Code 2FA invalide', code: 'MFA_CODE_INVALID' })
      }
      if (!(await completeMfaChallenge(challenge._id))) return expired()

      if (outcome.method === 'recovery') {
        AuditLog.create({ userId: user._id, email: user.email, action: 'MFA_RECOVERY_CODE_USED', ip, userAgent }).catch(
          () => {},
        )
      }
      AuditLog.create({
        userId: user._id,
        email: user.email,
        action: 'LOGIN_SUCCESS',
        ip,
        userAgent,
        metadata: { role: user.role, mfa: outcome.method },
      }).catch(() => {})

      await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), lastLoginIp: ip } })
      await setSessionCookie(res, user._id.toString(), { mfaVerifiedAt: new Date() })
      return res.json(loginSuccessBody(user, challenge.passwordNeedsUpgrade))
    } catch (err) {
      return next(err)
    }
  },
)

// 2FA volontaire du compte connecté (tous rôles) : /api/auth/2fa/*
router.use('/2fa', accountSecurityRoutes)

// POST /api/auth/logout — revoke the server-side session before clearing its cookie.
router.post('/logout', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await revokeSession(readSessionCookie(req.headers.cookie))
    clearSessionCookie(res)
    AuditLog.create({
      userId: req.user!.id,
      email: req.user!.email,
      action: 'LOGOUT',
      ip: req.headers['x-forwarded-for'] || req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      metadata: req.user!.impersonatorId ? { impersonatorId: req.user!.impersonatorId } : {},
    }).catch(() => {})
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
})

// GET /api/auth/me
router.get('/me', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Le secret TOTP et les empreintes des codes de secours ne quittent jamais le serveur.
    const user = await User.findById(req.user!.id).select('-passwordHash -twoFactorSecret -twoFactorRecoveryCodeHashes')
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    const permissions = resolvePermissions(user.role, user.grantedPermissions ?? [], user.deniedPermissions ?? [])
    return res.json({ user: { ...user.toObject(), permissions } })
  } catch (err) {
    return next(err)
  }
})

// PATCH /api/auth/profile — update own profile
router.patch(
  '/profile',
  auth,
  body('isAssociate').not().exists().withMessage('Le statut associé se modifie depuis la gestion des administrateurs'),
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Le nom ne peut pas être vide'),
  body('email').optional().isEmail().withMessage('Email invalide'),
  body('phone').optional().trim(),
  body('companyName').optional().trim(),
  body('website').optional().trim(),
  body('colorTheme')
    .optional({ nullable: true })
    .isIn([
      'sky',
      'violet',
      'emerald',
      'amber',
      'rose',
      'coral',
      'yellow',
      'indigo',
      'teal',
      'fuchsia',
      'lime',
      'slate',
      null,
    ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const user = await User.findById(req.user!.id)
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur introuvable' })
      }

      const { name, email, phone, companyName, website, colorTheme } = req.body || {}
      if (name !== undefined) user.name = name
      if (email !== undefined) {
        const newEmail = (email as string).toLowerCase().trim()
        const existing = await User.exists({ email: newEmail, _id: { $ne: user._id } })
        if (existing) return res.status(400).json({ error: 'Cet email est déjà utilisé' })
        user.email = newEmail
      }
      if (phone !== undefined) user.phone = phone
      if (companyName !== undefined) user.companyName = companyName
      if (website !== undefined) user.website = website
      if (colorTheme !== undefined) user.colorTheme = colorTheme

      await user.save()

      const safeUser = await User.findById(user._id).select('-passwordHash')
      return res.json({ user: safeUser })
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/auth/change-password — change own password
router.post(
  '/change-password',
  auth,
  body('currentPassword').notEmpty().withMessage('Mot de passe actuel requis'),
  body('newPassword').isString().withMessage('Nouveau mot de passe requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const user = await User.findById(req.user!.id)
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur introuvable' })
      }

      const { currentPassword, newPassword } = req.body

      const isValid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!isValid) {
        return res.status(400).json({ error: 'Mot de passe actuel incorrect' })
      }
      if (rejectWeakPassword(res, newPassword, user)) return
      if (await bcrypt.compare(newPassword, user.passwordHash)) {
        return res
          .status(400)
          .json({ error: "Le nouveau mot de passe doit être différent de l'actuel.", code: 'PASSWORD_UNCHANGED' })
      }

      user.passwordHash = await bcrypt.hash(newPassword, 10)
      user.passwordChangedAt = new Date()
      user.sessionVersion = (user.sessionVersion ?? 0) + 1
      await user.save()
      await revokeUserSessions(user._id.toString())
      await invalidatePasswordResetTokens(user._id)
      await revokeMfaChallenges(user._id)
      clearSessionCookie(res)

      AuditLog.create({
        userId: user._id,
        email: user.email,
        action: 'PASSWORD_CHANGED',
        ip: req.headers['x-forwarded-for'] || req.ip || '',
        userAgent: req.headers['user-agent'] || '',
      }).catch(() => {})

      return res.json({ message: 'Mot de passe modifié avec succès' })
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/auth/bootstrap-admin
router.post(
  '/bootstrap-admin',
  body('email').isEmail().withMessage('Email invalide'),
  body('password').isString().withMessage('Mot de passe requis'),
  body('name').trim().notEmpty().withMessage('Le nom est requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const existingAdmin = await User.exists({ role: { $in: ADMIN_ROLES } })
      if (existingAdmin) {
        return res.status(403).json({ error: 'Admin already exists' })
      }

      const { email, password, name } = req.body
      if (rejectWeakPassword(res, password, { email, name })) return

      const passwordHash = await bcrypt.hash(password, 10)
      const admin = await User.create({
        email: email.toLowerCase().trim(),
        passwordHash,
        role: 'SUPER_ADMIN',
        name,
      })

      await setSessionCookie(res, admin._id.toString())
      return res.status(201).json({})
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/auth/forgot-password
// Même statut et même corps que le compte existe ou non (pas d'énumération) ;
// un échec d'envoi est journalisé sans être révélé.
router.post(
  '/forgot-password',
  body('email').isEmail().withMessage('Email invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg })
      }

      const { email } = req.body
      const user = await User.findOne({ email: String(email).toLowerCase().trim() })
      if (user && user.isActive !== false && user.status !== 'ARCHIVE') {
        // Invalide les liens précédents : seul le dernier envoyé fonctionne.
        const { token } = await issuePasswordResetToken(user._id)
        const baseUrl = process.env.CORS_ORIGIN || 'http://localhost:5501'
        const loginPath = STAFF_ROLES.includes(user.role) ? '/admin/login' : '/espace-client/login'
        const resetUrl = `${baseUrl}${loginPath}?reset=${token}`
        try {
          const sent = await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl })
          if (!sent.sent) logger.warn({ userId: String(user._id) }, 'password reset email not sent')
        } catch (err) {
          logger.error({ err, userId: String(user._id) }, 'password reset email failed')
        }
      }

      return res.json({ message: FORGOT_PASSWORD_MESSAGE })
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/auth/reset-password — jeton à usage unique, valable 1 h.
router.post(
  '/reset-password',
  body('token').isString().notEmpty().withMessage('Token requis'),
  body('password').isString().withMessage('Mot de passe requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg })
      }

      const { token, password } = req.body
      // Le nouveau mot de passe est validé avant de consommer le jeton : une
      // saisie refusée par la politique ne brûle pas le lien reçu.
      const pending = await findUsablePasswordResetToken(token)
      if (!pending) return res.status(400).json({ error: INVALID_RESET_LINK_MESSAGE, code: 'RESET_TOKEN_INVALID' })
      const target = await User.findById(pending.userId).select('email name')
      if (!target) return res.status(400).json({ error: INVALID_RESET_LINK_MESSAGE, code: 'RESET_TOKEN_INVALID' })
      if (rejectWeakPassword(res, password, target)) return

      const userId = await consumePasswordResetToken(token)
      if (!userId || String(userId) !== String(target._id)) {
        return res.status(400).json({ error: INVALID_RESET_LINK_MESSAGE, code: 'RESET_TOKEN_INVALID' })
      }
      const user = await User.findById(userId)
      if (!user) return res.status(400).json({ error: INVALID_RESET_LINK_MESSAGE, code: 'RESET_TOKEN_INVALID' })

      user.passwordHash = await bcrypt.hash(password, 10)
      user.passwordChangedAt = new Date()
      user.sessionVersion = (user.sessionVersion ?? 0) + 1
      await user.save()
      await revokeUserSessions(user._id.toString())
      await invalidatePasswordResetTokens(user._id)
      await revokeMfaChallenges(user._id)

      AuditLog.create({
        userId: user._id,
        email: user.email,
        action: 'PASSWORD_RESET',
        ip: req.headers['x-forwarded-for'] || req.ip || '',
        userAgent: req.headers['user-agent'] || '',
      }).catch(() => {})

      return res.json({ message: 'Mot de passe reinitialise avec succes.' })
    } catch (err) {
      return next(err)
    }
  },
)

// PATCH /api/auth/locale
router.patch(
  '/locale',
  auth,
  body('locale').isIn(['fr', 'en']).withMessage('Locale must be "fr" or "en"'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg })
      }

      const userId = req.user?.id
      if (!userId) return res.status(401).json({ error: 'Non authentifie' })

      await User.findByIdAndUpdate(userId, { locale: req.body.locale })
      return res.json({ ok: true })
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/auth/avatar — upload photo de profil
router.post(
  '/avatar',
  auth,
  (req: Request, res: Response, next: NextFunction) => {
    avatarUpload.single('avatar')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (max 2 Mo)' : err.message
        return res.status(400).json({ error: msg })
      }
      if (err instanceof Error) return res.status(400).json({ error: err.message })
      next()
    })
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier reçu' })
      }

      const user = await User.findById(req.user!.id)
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })

      const ext = path.extname(req.file.filename)
      const newUrl = `/api/avatars/${req.user!.id}${ext}`

      // Supprimer l'ancien fichier si l'extension a changé
      if (user.avatarUrl && user.avatarUrl !== newUrl) {
        const oldFilename = path.basename(user.avatarUrl)
        const oldPath = path.join(avatarsDir, oldFilename)
        if (oldPath.startsWith(avatarsDir + path.sep)) {
          await fs.promises.unlink(oldPath).catch((e: NodeJS.ErrnoException) => {
            if (e.code !== 'ENOENT') throw e
          })
        }
      }

      user.avatarUrl = newUrl
      await user.save()

      return res.json({ avatarUrl: newUrl })
    } catch (err) {
      return next(err)
    }
  },
)

// DELETE /api/auth/avatar — supprimer photo de profil
router.delete('/avatar', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })

    if (user.avatarUrl) {
      const filename = path.basename(user.avatarUrl)
      const filePath = path.join(avatarsDir, filename)
      if (filePath.startsWith(avatarsDir + path.sep)) {
        await fs.promises.unlink(filePath).catch((e: NodeJS.ErrnoException) => {
          if (e.code !== 'ENOENT') throw e
        })
      }
      user.avatarUrl = ''
      await user.save()
    }

    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

export default router
