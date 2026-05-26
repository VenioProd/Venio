import express, { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { body, validationResult } from 'express-validator'
import { TOTP } from 'otpauth'
import User from '../models/User.js'
import AuditLog from '../models/AuditLog.js'
import PasswordResetToken from '../models/PasswordResetToken.js'
import { ADMIN_ROLES, resolvePermissions } from '../lib/permissions.js'
import { sendPasswordResetEmail } from '../lib/email.js'
import auth from '../middleware/auth.js'
import { avatarsDir } from './avatars.js'

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 heure

function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

/**
 * Persiste un nouveau reset token. Retourne le token CLAIR à inclure dans le
 * mail ; en DB on ne stocke que son hash SHA-256 + une expiration.
 */
export async function createResetToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex')
  await PasswordResetToken.create({
    userId,
    tokenHash: hashResetToken(rawToken),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  })
  return rawToken
}

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

const MIN_PASSWORD_LENGTH = 12
const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/
const PASSWORD_COMPLEXITY_MESSAGE =
  'Le mot de passe doit contenir au moins 1 majuscule, 1 minuscule et 1 chiffre'

function signToken(user: { _id: unknown; role: string; email: string; name: string }): string {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email, name: user.name },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
  )
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

      const { email, password } = req.body

      const clientIp = req.headers['x-forwarded-for'] || req.ip || ''
      const userAgent = req.headers['user-agent'] || ''

      const user = await User.findOne({ email: email.toLowerCase().trim() })
      if (!user) {
        AuditLog.create({ email, action: 'LOGIN_FAILED', ip: clientIp, userAgent, metadata: { reason: 'user_not_found' } }).catch(() => {})
        return res.status(401).json({ error: 'Identifiants invalides' })
      }

      const isValid = await bcrypt.compare(password, user.passwordHash)
      if (!isValid) {
        AuditLog.create({ userId: user._id, email, action: 'LOGIN_FAILED', ip: clientIp, userAgent, metadata: { reason: 'bad_password' } }).catch(() => {})
        return res.status(401).json({ error: 'Identifiants invalides' })
      }

      // Bloquer les clients archivés
      if (user.role === 'CLIENT' && user.status === 'ARCHIVE') {
        AuditLog.create({ userId: user._id, email, action: 'LOGIN_FAILED', ip: clientIp, userAgent, metadata: { reason: 'account_archived' } }).catch(() => {})
        return res.status(403).json({ error: 'Votre accès a été désactivé. Contactez votre chargé de compte.' })
      }

      // Check 2FA
      if (user.twoFactorEnabled && user.twoFactorSecret) {
        const { totpCode } = req.body
        if (!totpCode) {
          return res.json({ requires2FA: true })
        }
        const totp = new TOTP({ issuer: 'Venio', label: user.email, algorithm: 'SHA1', digits: 6, period: 30, secret: user.twoFactorSecret })
        const delta = totp.validate({ token: String(totpCode), window: 1 })
        if (delta === null) {
          AuditLog.create({ userId: user._id, email, action: 'LOGIN_FAILED', ip: clientIp, userAgent, metadata: { reason: '2fa_invalid' } }).catch(() => {})
          return res.status(401).json({ error: 'Code 2FA invalide' })
        }
      }

      AuditLog.create({ userId: user._id, email, action: 'LOGIN_SUCCESS', ip: clientIp, userAgent, metadata: { role: user.role } }).catch(() => {})

      // Track last login
      user.lastLoginAt = new Date()
      user.lastLoginIp = typeof clientIp === 'string' ? clientIp : Array.isArray(clientIp) ? clientIp[0] : ''
      user.save().catch(() => {})

      const token = signToken(user)
      return res.json({ token })
    } catch (err) {
      return next(err)
    }
  }
)

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
  body('colorTheme').optional({ nullable: true }).isIn([
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
  }
)

// POST /api/auth/change-password — change own password
router.post(
  '/change-password',
  auth,
  body('currentPassword').notEmpty().withMessage('Mot de passe actuel requis'),
  body('newPassword')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`)
    .matches(PASSWORD_COMPLEXITY_REGEX)
    .withMessage(PASSWORD_COMPLEXITY_MESSAGE),
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
      await user.save()

      AuditLog.create({ userId: user._id, email: user.email, action: 'PASSWORD_CHANGED', ip: req.headers['x-forwarded-for'] || req.ip || '', userAgent: req.headers['user-agent'] || '' }).catch(() => {})

      return res.json({ message: 'Mot de passe modifié avec succès' })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/auth/bootstrap-admin
// En production, le endpoint est désactivé dès qu'un SUPER_ADMIN existe (404).
// Le check + create est atomique via findOneAndUpdate(upsert) côté Mongo,
// et l'index partiel unique_super_admin sur User garantit l'unicité au cas où
// deux requêtes concurrentes traversent la condition simultanément.
router.post(
  '/bootstrap-admin',
  body('email').isEmail().withMessage('Email invalide'),
  body('password')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`)
    .matches(PASSWORD_COMPLEXITY_REGEX)
    .withMessage(PASSWORD_COMPLEXITY_MESSAGE),
  body('name').trim().notEmpty().withMessage('Le nom est requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const isProd = process.env.NODE_ENV === 'production'
      if (isProd) {
        const existing = await User.exists({ role: 'SUPER_ADMIN' })
        if (existing) {
          return res.status(404).json({ error: 'Not found' })
        }
      }

      const { email, password, name } = req.body
      const normalizedEmail = (email as string).toLowerCase().trim()
      const passwordHash = await bcrypt.hash(password, 10)

      let admin
      try {
        admin = await User.findOneAndUpdate(
          { role: { $in: ADMIN_ROLES } },
          {
            $setOnInsert: {
              email: normalizedEmail,
              passwordHash,
              role: 'SUPER_ADMIN',
              name,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
      } catch (err: unknown) {
        // Collision sur l'index partiel unique_super_admin : un SUPER_ADMIN existe.
        if ((err as { code?: number })?.code === 11000) {
          return res.status(403).json({ error: 'Admin already exists' })
        }
        throw err
      }

      // Si le findOneAndUpdate a trouvé un admin existant (autre que celui qu'on
      // vient d'insérer), refuser : le bootstrap est un opérateur one-shot.
      if (!admin || admin.email !== normalizedEmail) {
        return res.status(403).json({ error: 'Admin already exists' })
      }

      const token = signToken(admin)
      return res.status(201).json({ token })
    } catch (err) {
      return next(err)
    }
  }
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

      // Generate reset token (persisted hashed, with TTL Mongo)
      const token = await createResetToken(user._id.toString())

      const baseUrl = process.env.CORS_ORIGIN || 'http://localhost:5501'
      const loginPath = ADMIN_ROLES.includes(user.role as any) ? '/admin/login' : '/espace-client/login'
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
  }
)

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  body('token').notEmpty().withMessage('Token requis'),
  body('password')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caracteres`)
    .matches(PASSWORD_COMPLEXITY_REGEX)
    .withMessage(PASSWORD_COMPLEXITY_MESSAGE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg })
      }

      const { token, password } = req.body
      const tokenHash = hashResetToken(String(token))
      const entry = await PasswordResetToken.findOne({ tokenHash })

      if (!entry || entry.expiresAt.getTime() < Date.now()) {
        if (entry) await entry.deleteOne().catch(() => {})
        return res.status(400).json({ error: 'Lien de reinitialisation expire ou invalide.' })
      }

      const user = await User.findById(entry.userId)
      if (!user) {
        await entry.deleteOne().catch(() => {})
        return res.status(400).json({ error: 'Utilisateur introuvable.' })
      }

      user.passwordHash = await bcrypt.hash(password, 10)
      user.passwordChangedAt = new Date()
      await user.save()

      // Invalidation immédiate du token consommé (en plus du TTL).
      await entry.deleteOne().catch(() => {})

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
  }
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

      const userId = (req as any).user?.id
      if (!userId) return res.status(401).json({ error: 'Non authentifie' })

      await User.findByIdAndUpdate(userId, { locale: req.body.locale })
      return res.json({ ok: true })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/auth/avatar — upload photo de profil
router.post('/avatar', auth, (req: Request, res: Response, next: NextFunction) => {
  avatarUpload.single('avatar')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (max 2 Mo)' : err.message
      return res.status(400).json({ error: msg })
    }
    if (err instanceof Error) return res.status(400).json({ error: err.message })
    next()
  })
}, async (req: Request, res: Response, next: NextFunction) => {
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
        await fs.promises.unlink(oldPath).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e })
      }
    }

    user.avatarUrl = newUrl
    await user.save()

    return res.json({ avatarUrl: newUrl })
  } catch (err) {
    return next(err)
  }
})

// DELETE /api/auth/avatar — supprimer photo de profil
router.delete('/avatar', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })

    if (user.avatarUrl) {
      const filename = path.basename(user.avatarUrl)
      const filePath = path.join(avatarsDir, filename)
      if (filePath.startsWith(avatarsDir + path.sep)) {
        await fs.promises.unlink(filePath).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e })
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
