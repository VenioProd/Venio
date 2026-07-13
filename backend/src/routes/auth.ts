import express, { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { body, validationResult } from 'express-validator'
import User from '../models/User.js'
import AuditLog from '../models/AuditLog.js'
import { ADMIN_ROLES, resolvePermissions } from '../lib/permissions.js'
import { sendPasswordResetEmail } from '../lib/email.js'
import auth from '../middleware/auth.js'
import { avatarsDir } from './avatars.js'
import { consumeRecoveryCode, graceEndsAt, requiresMfa, verifyTotp } from '../lib/mfa.js'
import {
  clearSessionCookie,
  readSessionCookie,
  revokeSession,
  revokeUserSessions,
  setSessionCookie,
} from '../lib/session.js'

// In-memory store for reset tokens (simple approach, clears on restart)
export const resetTokens = new Map<string, { userId: string; expiresAt: number }>()

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

const MIN_PASSWORD_LENGTH = 6

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

      const { email, password } = req.body

      const clientIp = req.headers['x-forwarded-for'] || req.ip || ''
      const userAgent = req.headers['user-agent'] || ''

      const user = await User.findOne({ email: email.toLowerCase().trim() })
      if (!user) {
        AuditLog.create({
          email,
          action: 'LOGIN_FAILED',
          ip: clientIp,
          userAgent,
          metadata: { reason: 'user_not_found' },
        }).catch(() => {})
        return res.status(401).json({ error: 'Identifiants invalides' })
      }

      const isValid = await bcrypt.compare(password, user.passwordHash)
      if (!isValid) {
        AuditLog.create({
          userId: user._id,
          email,
          action: 'LOGIN_FAILED',
          ip: clientIp,
          userAgent,
          metadata: { reason: 'bad_password' },
        }).catch(() => {})
        return res.status(401).json({ error: 'Identifiants invalides' })
      }

      // Every inactive or archived account is blocked, including administrators.
      if (!user.isActive || user.status === 'ARCHIVE') {
        AuditLog.create({
          userId: user._id,
          email,
          action: 'LOGIN_FAILED',
          ip: clientIp,
          userAgent,
          metadata: { reason: 'account_archived' },
        }).catch(() => {})
        return res.status(403).json({ error: 'Votre accès a été désactivé. Contactez votre chargé de compte.' })
      }

      let mfaVerifiedAt: number | undefined
      let mfaEnrollmentOnly = false
      // Check 2FA, including a single-use recovery code when the authenticator
      // is unavailable. A recovery code is consumed atomically with the login.
      if (user.twoFactorEnabled && user.twoFactorSecret) {
        const { totpCode, recoveryCode } = req.body
        if (!totpCode && !recoveryCode) {
          return res.json({ requires2FA: true })
        }
        const validTotp = totpCode && verifyTotp(user.twoFactorSecret, user.email, totpCode)
        const recovery = validTotp
          ? { valid: false, hashes: user.twoFactorRecoveryCodeHashes ?? [] }
          : await consumeRecoveryCode(user.twoFactorRecoveryCodeHashes ?? [], recoveryCode)
        if (!validTotp && !recovery.valid) {
          AuditLog.create({
            userId: user._id,
            email,
            action: 'LOGIN_FAILED',
            ip: clientIp,
            userAgent,
            metadata: { reason: '2fa_invalid' },
          }).catch(() => {})
          return res.status(401).json({ error: 'Code 2FA invalide' })
        }
        if (recovery.valid) {
          user.twoFactorRecoveryCodeHashes = recovery.hashes
          AuditLog.create({ userId: user._id, email, action: 'MFA_RECOVERY_CODE_USED', ip: clientIp, userAgent }).catch(
            () => {},
          )
        }
        mfaVerifiedAt = Date.now()
      } else if (requiresMfa(user.role)) {
        // Rolling grace is initialized on first login, rather than at deploy,
        // so existing administrators are never locked out by a release.
        if (!user.mfaGraceUntil) user.mfaGraceUntil = graceEndsAt()
        if (user.mfaGraceUntil.getTime() <= Date.now()) {
          // Issue a constrained browser session so the account can complete
          // enrollment instead of becoming permanently locked out. The auth
          // middleware limits this session to /me, logout and MFA setup APIs.
          mfaEnrollmentOnly = true
        }
      }

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
      user.lastLoginIp = typeof clientIp === 'string' ? clientIp : Array.isArray(clientIp) ? clientIp[0] : ''
      user.save().catch(() => {})

      await setSessionCookie(res, user._id.toString(), {
        ...(mfaVerifiedAt ? { mfaVerifiedAt: new Date(mfaVerifiedAt) } : {}),
        ...(mfaEnrollmentOnly ? { mfaEnrollmentOnly: true } : {}),
      })
      return res.json({
        ...(requiresMfa(user.role) && !user.twoFactorEnabled
          ? { mfaEnrollmentRequired: true, mfaGraceUntil: user.mfaGraceUntil }
          : {}),
      })
    } catch (err) {
      return next(err)
    }
  },
)

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
    const user = await User.findById(req.user!.id).select('-passwordHash')
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
  body('newPassword')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`),
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

      user.passwordHash = await bcrypt.hash(newPassword, 10)
      user.passwordChangedAt = new Date()
      user.sessionVersion = (user.sessionVersion ?? 0) + 1
      await user.save()
      await revokeUserSessions(user._id.toString())
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
  body('password')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`),
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
      const user = await User.findOne({ email: email.toLowerCase().trim() })

      // Always return success to prevent email enumeration
      if (!user) {
        return res.json({ message: 'Si un compte existe avec cet email, un lien de reinitialisation a ete envoye.' })
      }

      // Generate reset token
      const token = crypto.randomBytes(32).toString('hex')
      resetTokens.set(token, {
        userId: user._id.toString(),
        expiresAt: Date.now() + 3600000, // 1 hour
      })

      // Clean expired tokens
      for (const [key, val] of resetTokens) {
        if (val.expiresAt < Date.now()) resetTokens.delete(key)
      }

      const baseUrl = process.env.CORS_ORIGIN || 'http://localhost:5501'
      const loginPath = ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])
        ? '/admin/login'
        : '/espace-client/login'
      const resetUrl = `${baseUrl}${loginPath}?reset=${token}`

      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
      })

      return res.json({ message: 'Si un compte existe avec cet email, un lien de reinitialisation a ete envoye.' })
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  body('token').notEmpty().withMessage('Token requis'),
  body('password')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caracteres`),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg })
      }

      const { token, password } = req.body
      const entry = resetTokens.get(token)

      if (!entry || entry.expiresAt < Date.now()) {
        resetTokens.delete(token)
        return res.status(400).json({ error: 'Lien de reinitialisation expire ou invalide.' })
      }

      const user = await User.findById(entry.userId)
      if (!user) {
        resetTokens.delete(token)
        return res.status(400).json({ error: 'Utilisateur introuvable.' })
      }

      user.passwordHash = await bcrypt.hash(password, 10)
      user.passwordChangedAt = new Date()
      user.sessionVersion = (user.sessionVersion ?? 0) + 1
      await user.save()
      await revokeUserSessions(user._id.toString())

      resetTokens.delete(token)

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
