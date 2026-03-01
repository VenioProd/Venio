import express, { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requireAnyPermission, requirePermission } from '../../middleware/role.js'
import User from '../../models/User.js'
import { ADMIN_ROLES, PERMISSIONS } from '../../lib/permissions.js'
import type { AdminRole } from '../../types/enums.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const adminFilter = { role: { $in: ADMIN_ROLES } }

async function countSuperAdmins(): Promise<number> {
  return User.countDocuments({ role: 'SUPER_ADMIN' })
}

router.get(
  '/',
  requireAnyPermission([PERMISSIONS.MANAGE_ADMINS, PERMISSIONS.VIEW_CRM]),
  async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await User.find(adminFilter).select('-passwordHash').sort({ createdAt: -1 })
    return res.json({ users })
  } catch (err) {
    return next(err)
  }
  }
)

router.post(
  '/',
  requirePermission(PERMISSIONS.MANAGE_ADMINS),
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Mot de passe: minimum 6 caractères'),
  body('name').trim().notEmpty().withMessage('Le nom est requis'),
  async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
    }

    const { email, password, name, role } = req.body || {}

    const normalizedEmail = email.toLowerCase().trim()
    const existing = await User.findOne({ email: normalizedEmail })
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' })
    }

    const nextRole = role ? role : 'ADMIN'
    if (!ADMIN_ROLES.includes(nextRole)) {
      return res.status(400).json({ error: 'Invalid role' })
    }
    if (nextRole === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (nextRole === 'SUPER_ADMIN') {
      const superAdminCount = await countSuperAdmins()
      if (superAdminCount > 0) {
        return res.status(409).json({ error: 'Super admin already exists' })
      }
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      role: nextRole,
      name,
    })

    const safeUser = await User.findById(user._id).select('-passwordHash')
    return res.status(201).json({ user: safeUser })
  } catch (err) {
    return next(err)
  }
  }
)

router.get('/:userId', requirePermission(PERMISSIONS.MANAGE_ADMINS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.params.userId).select('-passwordHash')
    if (!user || !ADMIN_ROLES.includes(user.role as AdminRole)) {
      return res.status(404).json({ error: 'Admin not found' })
    }
    return res.json({ user })
  } catch (err) {
    return next(err)
  }
})

router.patch(
  '/:userId',
  requirePermission(PERMISSIONS.MANAGE_ADMINS),
  body('role').optional().isIn(ADMIN_ROLES).withMessage('Rôle invalide'),
  body('password').optional().isLength({ min: 6 }).withMessage('Mot de passe: minimum 6 caractères'),
  async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
    }

    const { name, role, password } = req.body || {}
    const user = await User.findById(req.params.userId)
    if (!user || !ADMIN_ROLES.includes(user.role as AdminRole)) {
      return res.status(404).json({ error: 'Admin not found' })
    }

    if (role) {
      if (!ADMIN_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' })
      }
      if (role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Forbidden' })
      }
      if (role === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
        const superAdminCount = await countSuperAdmins()
        if (superAdminCount > 0) {
          return res.status(409).json({ error: 'Super admin already exists' })
        }
      }
      if (user.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') {
        const superAdminCount = await countSuperAdmins()
        if (superAdminCount <= 1) {
          return res.status(400).json({ error: 'Cannot downgrade the last super admin' })
        }
      }
      if (String(user._id) === req.user!.id && role !== 'SUPER_ADMIN') {
        return res.status(400).json({ error: 'Cannot remove your own admin management access' })
      }
      user.role = role
    }

    if (name !== undefined) {
      user.name = name
    }
    if (password) {
      user.passwordHash = await bcrypt.hash(password, 10)
    }

    await user.save()
    const safeUser = await User.findById(user._id).select('-passwordHash')
    return res.json({ user: safeUser })
  } catch (err) {
    return next(err)
  }
  }
)

router.delete('/:userId', requirePermission(PERMISSIONS.MANAGE_ADMINS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.params.userId)
    if (!user || !ADMIN_ROLES.includes(user.role as AdminRole)) {
      return res.status(404).json({ error: 'Admin not found' })
    }

    if (String(user._id) === req.user!.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' })
    }

    if (user.role === 'SUPER_ADMIN') {
      const superAdminCount = await countSuperAdmins()
      if (superAdminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last super admin' })
      }
    }

    await user.deleteOne()
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

export default router
