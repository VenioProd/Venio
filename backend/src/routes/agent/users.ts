import express, { type Request, type Response, type NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import { body, param, validationResult } from 'express-validator'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour la gestion des Users (admins + super-admins).
 *
 * Note : pour le périmètre CLIENT (User role=CLIENT), utiliser /crm/clients.
 * Ce module gère les comptes internes (ADMIN, SUPER_ADMIN, RH, VIEWER).
 *
 * 2FA — manipulation du second facteur d'un user. Très sensible : ne pas
 * exposer le secret TOTP dans les retours.
 *
 * Scopes :
 *   - read:users        → list + détail (admins)
 *   - write:users       → create, update, delete admin
 *   - read:2fa          → statut 2FA d'un user
 *   - manage:2fa        → désactiver le 2FA d'un user (un agent ne peut
 *                          PAS l'activer car ça demande un secret TOTP
 *                          validé par l'utilisateur)
 */

const router = express.Router()

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RH', 'COMMERCIAL', 'COMPTABLE', 'VIEWER', 'STAGIAIRE'] as const

function emit(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, { errors: errors.array() })
    return true
  }
  return false
}

const ADMIN_AGENT_FIELDS = [
  '_id',
  'email',
  'role',
  'name',
  'title',
  'phone',
  'isActive',
  'twoFactorEnabled',
  'jobTitle',
  'grantedPermissions',
  'deniedPermissions',
  'locale',
  'colorTheme',
  'avatarUrl',
  'createdAt',
  'updatedAt',
].join(' ')

function sanitizeAdminForAgent(user: unknown): Record<string, unknown> {
  const source = user as Record<string, unknown>
  const safe: Record<string, unknown> = {}
  for (const key of ADMIN_AGENT_FIELDS.split(' ')) {
    if (source[key] !== undefined) safe[key] = source[key]
  }
  return safe
}

// ───────────────────────────────────────────────────────────────────────────
// Users (admins seulement — clients = /crm/clients)
// ───────────────────────────────────────────────────────────────────────────

router.get('/users', requireScope('read:users'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = { role: { $in: ADMIN_ROLES } }
    if (typeof req.query.role === 'string' && (ADMIN_ROLES as readonly string[]).includes(req.query.role)) {
      filter.role = req.query.role
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ name: regex }, { email: regex }]
    }
    const [items, total] = await Promise.all([
      User.find(filter)
        .select(ADMIN_AGENT_FIELDS)
        .sort({ createdAt: -1 })
        .skip(pag.skip)
        .limit(pag.limit)
        .lean(),
      User.countDocuments(filter),
    ])
    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get(
  '/users/:id',
  requireScope('read:users'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const user = await User.findById(req.params.id)
        .select(ADMIN_AGENT_FIELDS)
        .lean()
      if (!user) return respondError(res, 404, 'NOT_FOUND', 'User introuvable')
      res.json(user)
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/users',
  requireScope('write:users'),
  body('email').isEmail(),
  body('name').isString().trim().isLength({ min: 1 }),
  body('role').isIn(ADMIN_ROLES as unknown as string[]),
  body('password').optional().isString().isLength({ min: 8 }),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const email = String(req.body.email).toLowerCase().trim()
      const existing = await User.findOne({ email })
      if (existing) {
        return respondError(res, 409, 'EMAIL_ALREADY_EXISTS', `Email ${email} déjà utilisé`)
      }
      // Si pas de password fourni, on en génère un aléatoire — le user devra
      // utiliser le flux de reset password (UI admin) pour le définir.
      const rawPwd = typeof req.body.password === 'string'
        ? req.body.password
        : `agent-pwd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const passwordHash = await bcrypt.hash(rawPwd, 10)
      const user = await User.create({
        email,
        passwordHash,
        name: String(req.body.name).trim(),
        role: req.body.role,
        title: typeof req.body.title === 'string' ? req.body.title : '',
        jobTitle: typeof req.body.jobTitle === 'string' ? req.body.jobTitle : '',
        grantedPermissions: Array.isArray(req.body.grantedPermissions)
          ? req.body.grantedPermissions.map(String)
          : [],
        deniedPermissions: Array.isArray(req.body.deniedPermissions)
          ? req.body.deniedPermissions.map(String)
          : [],
      })
      const safe = await User.findById(user._id).select(ADMIN_AGENT_FIELDS).lean()
      res.locals.audit = {
        entityType: 'User',
        entityId: String(user._id),
        entityRef: user.email,
        summary: `Création user ${user.email} (${user.role})`,
        after: safe,
      }
      res.status(201).json(safe)
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/users/:id',
  requireScope('write:users'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const user = await User.findById(req.params.id)
      if (!user) return respondError(res, 404, 'NOT_FOUND', 'User introuvable')
      if (!(ADMIN_ROLES as readonly string[]).includes(user.role)) {
        return respondError(res, 422, 'NOT_ADMIN', 'Cet endpoint ne gère que les comptes admin (CLIENT → /crm/clients)')
      }
      const before = sanitizeAdminForAgent(user.toObject())

      const stringFields = ['name', 'title', 'phone']
      for (const f of stringFields) {
        if (typeof req.body[f] === 'string') {
          ;(user as unknown as Record<string, string>)[f] = req.body[f]
        }
      }
      if (typeof req.body.role === 'string' && (ADMIN_ROLES as readonly string[]).includes(req.body.role)) {
        user.role = req.body.role as typeof user.role
      }
      if (Array.isArray(req.body.grantedPermissions)) {
        user.grantedPermissions = req.body.grantedPermissions.map(String)
      }
      if (Array.isArray(req.body.deniedPermissions)) {
        user.deniedPermissions = req.body.deniedPermissions.map(String)
      }
      if (typeof req.body.jobTitle === 'string') {
        user.jobTitle = req.body.jobTitle
      }
      if (typeof req.body.isActive === 'boolean') user.isActive = req.body.isActive
      if (typeof req.body.password === 'string' && req.body.password.length >= 8) {
        user.passwordHash = await bcrypt.hash(req.body.password, 10)
        user.passwordChangedAt = new Date()
      }
      await user.save()
      const safe = await User.findById(user._id).select(ADMIN_AGENT_FIELDS).lean()
      res.locals.audit = {
        entityType: 'User',
        entityId: String(user._id),
        entityRef: user.email,
        summary: `Modification user ${user.email}`,
        before,
        after: safe,
      }
      res.json(safe)
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/users/:id',
  requireScope('write:users'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const user = await User.findById(req.params.id)
      if (!user) return respondError(res, 404, 'NOT_FOUND', 'User introuvable')
      if (!(ADMIN_ROLES as readonly string[]).includes(user.role)) {
        return respondError(res, 422, 'NOT_ADMIN', 'Cet endpoint ne gère que les comptes admin (CLIENT → /crm/clients)')
      }
      // Sanity check : empêcher de supprimer le dernier SUPER_ADMIN
      if (user.role === 'SUPER_ADMIN') {
        const count = await User.countDocuments({ role: 'SUPER_ADMIN' })
        if (count <= 1) {
          return respondError(res, 409, 'LAST_SUPER_ADMIN', 'Impossible de supprimer le dernier SUPER_ADMIN')
        }
      }
      const before = sanitizeAdminForAgent(user.toObject())
      await User.deleteOne({ _id: user._id })
      res.locals.audit = {
        entityType: 'User',
        entityId: String(user._id),
        entityRef: user.email,
        summary: `Suppression user ${user.email}`,
        before,
      }
      res.json({ ok: true, deletedId: String(user._id) })
    } catch (err) {
      next(err)
    }
  }
)

// ───────────────────────────────────────────────────────────────────────────
// 2FA — lecture du statut + désactivation (l'activation reste manuelle)
// ───────────────────────────────────────────────────────────────────────────

router.get(
  '/users/:id/2fa',
  requireScope('read:2fa'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const user = await User.findById(req.params.id).select('email twoFactorEnabled').lean()
      if (!user) return respondError(res, 404, 'NOT_FOUND', 'User introuvable')
      res.json({
        userId: String(user._id),
        email: user.email,
        twoFactorEnabled: Boolean(user.twoFactorEnabled),
      })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/users/:id/2fa/disable',
  requireScope('manage:2fa'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      // Agent PATs cannot satisfy an interactive MFA step-up. Keeping this
      // endpoint would create a bypass around mandatory MFA.
      return respondError(res, 403, 'MFA_STEP_UP_REQUIRED', 'La désactivation MFA doit être effectuée par l’utilisateur avec une vérification MFA interactive.')
    } catch (err) {
      next(err)
    }
  }
)

export default router
