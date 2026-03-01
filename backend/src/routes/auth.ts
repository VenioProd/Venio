import express, { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { body, validationResult } from 'express-validator'
import { TOTP } from 'otpauth'
import User from '../models/User.js'
import AuditLog from '../models/AuditLog.js'
import { ADMIN_ROLES, getPermissionsForRole } from '../lib/permissions.js'
import auth from '../middleware/auth.js'

const router = express.Router()

const MIN_PASSWORD_LENGTH = 6

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
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
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
    const permissions = getPermissionsForRole(user.role)
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
  body('phone').optional().trim(),
  body('companyName').optional().trim(),
  body('website').optional().trim(),
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

      const { name, phone, companyName, website } = req.body || {}
      if (name !== undefined) user.name = name
      if (phone !== undefined) user.phone = phone
      if (companyName !== undefined) user.companyName = companyName
      if (website !== undefined) user.website = website

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
  body('newPassword').isLength({ min: MIN_PASSWORD_LENGTH }).withMessage(`Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`),
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
      await user.save()

      AuditLog.create({ userId: user._id, email: user.email, action: 'PASSWORD_CHANGED', ip: req.headers['x-forwarded-for'] || req.ip || '', userAgent: req.headers['user-agent'] || '' }).catch(() => {})

      return res.json({ message: 'Mot de passe modifié avec succès' })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/auth/bootstrap-admin
router.post(
  '/bootstrap-admin',
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
  body('password').isLength({ min: MIN_PASSWORD_LENGTH }).withMessage(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`),
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

      const token = signToken(admin)
      return res.status(201).json({ token })
    } catch (err) {
      return next(err)
    }
  }
)

export default router
