import express, { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requireAnyPermission, requirePermission } from '../../middleware/role.js'
import User from '../../models/User.js'
import { ADMIN_ROLES, PERMISSIONS, getPermissionsForRole } from '../../lib/permissions.js'
import type { AdminRole } from '../../types/enums.js'
import { triggerAutomations } from '../../automation/trigger.js'
import { sendAdminCredentials } from '../../lib/email.js'
import { resetTokens } from '../auth.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const adminFilter = { role: { $in: ADMIN_ROLES } }

async function countSuperAdmins(): Promise<number> {
  return User.countDocuments({ role: 'SUPER_ADMIN' })
}

router.get(
  '/',
  requireAnyPermission([PERMISSIONS.MANAGE_ADMINS, PERMISSIONS.VIEW_CRM, PERMISSIONS.MANAGE_QUALIOPI]),
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

    // Custom permissions (SUPER_ADMIN only)
    let customPermissions: string[] | null = null
    const allPermValues = Object.values(PERMISSIONS) as string[]
    if (req.body.customPermissions !== undefined && req.user!.role === 'SUPER_ADMIN') {
      if (Array.isArray(req.body.customPermissions)) {
        const validated = req.body.customPermissions.filter((p: string) => allPermValues.includes(p))
        customPermissions = validated.length > 0 ? validated : null
      }
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      role: nextRole,
      name,
      customPermissions,
    })

    // Trigger internal user onboarding
    triggerAutomations(
      ['onboarding.internal_user_setup'],
      { userId: user._id.toString(), actorId: req.user!.id }
    )

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

    // Marquer comme stagiaire (SUPER_ADMIN only)
    if (req.body.markAsStagiaire !== undefined && req.user!.role === 'SUPER_ADMIN') {
      const Intern = (await import('../../models/Intern.js')).default
      if (req.body.markAsStagiaire === true) {
        // Ajouter le tag STAGIAIRE
        if (!user.tags) user.tags = []
        if (!user.tags.includes('STAGIAIRE')) user.tags.push('STAGIAIRE')

        // Creer la fiche Intern si elle n'existe pas
        const existing = await Intern.findOne({ userId: user._id })
        if (!existing) {
          const { type, poste, departement, dateDebut, dateFin, tuteur, ecole, formation, joursPresence } = req.body.internInfo || {}
          await Intern.create({
            userId: user._id,
            type: type && ['STAGIAIRE', 'ALTERNANT'].includes(type) ? type : 'STAGIAIRE',
            poste: poste || user.role || 'Stagiaire',
            departement: departement || '',
            dateDebut: dateDebut ? new Date(dateDebut) : new Date(),
            dateFin: dateFin ? new Date(dateFin) : new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
            tuteur: tuteur || null,
            ecole: ecole || '',
            formation: formation || '',
            joursPresence: Array.isArray(joursPresence) ? joursPresence : ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
            createdBy: req.user!.id,
          })
        } else if (req.body.internInfo) {
          // Mettre a jour la fiche existante
          const { type, poste, departement, dateDebut, dateFin, tuteur, ecole, formation, joursPresence, inclureEquipe } = req.body.internInfo
          if (type && ['STAGIAIRE', 'ALTERNANT'].includes(type)) existing.type = type
          if (poste !== undefined) existing.poste = poste
          if (departement !== undefined) existing.departement = departement
          if (dateDebut !== undefined) existing.dateDebut = new Date(dateDebut)
          if (dateFin !== undefined) existing.dateFin = new Date(dateFin)
          if (tuteur !== undefined) existing.tuteur = tuteur || null
          if (ecole !== undefined) existing.ecole = ecole
          if (formation !== undefined) existing.formation = formation
          if (Array.isArray(joursPresence)) existing.joursPresence = joursPresence
          if (inclureEquipe !== undefined) existing.inclureEquipe = Boolean(inclureEquipe)
          if (existing.status === 'TERMINE' || existing.status === 'ANNULE') existing.status = 'ACTIF'
          await existing.save()
        }
      } else {
        // Retirer le tag STAGIAIRE
        user.tags = (user.tags || []).filter((t: string) => t !== 'STAGIAIRE')
        // Marquer la fiche Intern comme TERMINE
        const intern = await Intern.findOne({ userId: user._id })
        if (intern && intern.status === 'ACTIF') {
          intern.status = 'TERMINE'
          await intern.save()
        }
      }
    }

    // Custom permissions (SUPER_ADMIN only)
    if (req.body.customPermissions !== undefined && req.user!.role === 'SUPER_ADMIN') {
      if (req.body.customPermissions === null) {
        user.customPermissions = null
      } else if (Array.isArray(req.body.customPermissions)) {
        const allPermValues = Object.values(PERMISSIONS) as string[]
        const validated = req.body.customPermissions.filter((p: string) => allPermValues.includes(p))
        user.customPermissions = validated.length > 0 ? validated : null
      }
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

// Send credentials by email
router.post('/:userId/send-credentials', requirePermission(PERMISSIONS.MANAGE_ADMINS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = req.body || {}
    if (!password) {
      return res.status(400).json({ error: 'Le mot de passe est requis pour envoyer les identifiants.' })
    }
    const user = await User.findById(req.params.userId)
    if (!user || !ADMIN_ROLES.includes(user.role as AdminRole)) {
      return res.status(404).json({ error: 'Admin not found' })
    }
    const result = await sendAdminCredentials({
      to: user.email,
      name: user.name,
      email: user.email,
      password,
    })
    if (!result.sent) {
      return res.status(500).json({ error: result.error || 'Erreur lors de l\'envoi de l\'email.' })
    }
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/admins/:userId/reset-link — generate a password reset link (no email sent)
router.post('/:userId/reset-link', requirePermission(PERMISSIONS.MANAGE_ADMINS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Seul le Super Admin peut générer un lien de réinitialisation' })
    }

    const user = await User.findById(req.params.userId)
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' })
    }

    const token = crypto.randomBytes(32).toString('hex')
    resetTokens.set(token, {
      userId: user._id.toString(),
      expiresAt: Date.now() + 3600000, // 1 hour
    })

    const baseUrl = process.env.CORS_ORIGIN || 'http://localhost:5501'
    const loginPath = ADMIN_ROLES.includes(user.role as any) ? '/admin/login' : '/espace-client/login'
    const resetUrl = `${baseUrl}${loginPath}?reset=${token}`

    return res.json({ resetUrl })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/admins/impersonate/:userId — SUPER_ADMIN only
router.post('/impersonate/:userId', requirePermission(PERMISSIONS.MANAGE_ADMINS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Seul le Super Admin peut utiliser cette fonctionnalité' })
    }

    const target = await User.findById(req.params.userId)
    if (!target) {
      return res.status(404).json({ error: 'Utilisateur introuvable' })
    }

    const token = jwt.sign(
      { id: target._id, role: target.role, email: target.email, name: target.name },
      process.env.JWT_SECRET as string,
      { expiresIn: '2h' } as jwt.SignOptions
    )

    return res.json({ token, user: { _id: target._id, email: target.email, name: target.name, role: target.role } })
  } catch (err) {
    return next(err)
  }
})

export default router
