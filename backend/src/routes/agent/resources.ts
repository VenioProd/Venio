import express, { type Request, type Response, type NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import CompanyResource, { RESOURCE_CATEGORIES } from '../../models/CompanyResource.js'
import ToolAccess from '../../models/ToolAccess.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour les Resources d'entreprise (CompanyResource) et les
 * ToolAccess (credentials d'outils tiers).
 *
 * - CompanyResource : assets internes (charte graphique, modèles, etc.).
 *   Lecture du metadata et liste pour cataloguer. L'upload binaire reste
 *   spécifique à l'UI admin pour la V1 — l'API agent expose seulement
 *   la consultation et la mise à jour des métadonnées.
 * - ToolAccess : credentials sensibles (mots de passe d'outils tiers).
 *   Le champ `password` est chiffré côté model. Pas exposé en clair par
 *   l'API agent : on retourne un placeholder "***" sur les lectures.
 */

const router = express.Router()

function emit(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, { errors: errors.array() })
    return true
  }
  return false
}

// ═════════════════════════════════════════════════════════════════════════
// CompanyResource
// ═════════════════════════════════════════════════════════════════════════

router.get('/resources', requireScope('read:resources'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    if (typeof req.query.category === 'string') filter.category = req.query.category
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ name: regex }, { description: regex }]
    }
    const [items, total] = await Promise.all([
      CompanyResource.find(filter).sort({ updatedAt: -1 }).skip(pag.skip).limit(pag.limit).lean(),
      CompanyResource.countDocuments(filter),
    ])
    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get(
  '/resources/categories',
  requireScope('read:resources'),
  (_req: Request, res: Response) => {
    res.json({ categories: RESOURCE_CATEGORIES })
  }
)

router.get(
  '/resources/:id',
  requireScope('read:resources'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const r = await CompanyResource.findById(req.params.id).lean()
      if (!r) return respondError(res, 404, 'NOT_FOUND', 'Resource introuvable')
      res.json(r)
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/resources/:id',
  requireScope('write:resources'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const r = await CompanyResource.findById(req.params.id)
      if (!r) return respondError(res, 404, 'NOT_FOUND', 'Resource introuvable')
      const before = r.toObject()
      if (typeof req.body.name === 'string') r.name = req.body.name
      if (typeof req.body.description === 'string') r.description = req.body.description
      if (typeof req.body.category === 'string' && (RESOURCE_CATEGORIES as readonly string[]).includes(req.body.category)) {
        r.category = req.body.category
      }
      await r.save()
      res.locals.audit = { entityType: 'CompanyResource', entityId: String(r._id), before, after: r.toObject() }
      res.json(r.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/resources/:id',
  requireScope('write:resources'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const r = await CompanyResource.findById(req.params.id)
      if (!r) return respondError(res, 404, 'NOT_FOUND', 'Resource introuvable')
      const before = r.toObject()
      await CompanyResource.deleteOne({ _id: r._id })
      res.locals.audit = { entityType: 'CompanyResource', entityId: String(r._id), before }
      res.json({ ok: true, deletedId: String(r._id) })
    } catch (err) {
      next(err)
    }
  }
)

// ═════════════════════════════════════════════════════════════════════════
// ToolAccess
// ═════════════════════════════════════════════════════════════════════════

const TOOL_CATEGORIES = ['IA', 'DESIGN', 'DEV', 'MARKETING', 'COMMUNICATION', 'GESTION', 'AUTRE'] as const

/** Supprime le mot de passe des retours API agent. */
function sanitizeToolAccess<T extends { password?: unknown }>(obj: T): Omit<T, 'password'> {
  if (obj && typeof obj === 'object') {
    const { password: _password, ...safe } = obj
    return safe
  }
  return obj
}

router.get(
  '/tool-access',
  requireScope('read:toolaccess'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pag = parsePagination(req)
      const filter: Record<string, unknown> = {}
      if (typeof req.query.category === 'string') filter.category = req.query.category
      if (typeof req.query.q === 'string' && req.query.q.trim()) {
        const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        filter.$or = [{ name: regex }, { url: regex }]
      }
      const [items, total] = await Promise.all([
        ToolAccess.find(filter).sort({ updatedAt: -1 }).skip(pag.skip).limit(pag.limit).lean(),
        ToolAccess.countDocuments(filter),
      ])
      res.json(paginatedResponse(items.map(sanitizeToolAccess), pag, total))
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/tool-access',
  requireScope('write:toolaccess'),
  body('name').isString().trim().isLength({ min: 1 }),
  body('login').isString().trim().isLength({ min: 1 }),
  body('password').isString().isLength({ min: 1 }),
  body('category').optional().isIn(TOOL_CATEGORIES as unknown as string[]),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id name email').lean()
      if (!admin) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour addedBy')
      const t = await ToolAccess.create({
        name: String(req.body.name).trim(),
        url: typeof req.body.url === 'string' ? req.body.url : '',
        login: String(req.body.login).trim(),
        password: String(req.body.password),
        category:
          typeof req.body.category === 'string' && (TOOL_CATEGORIES as readonly string[]).includes(req.body.category)
            ? req.body.category
            : 'AUTRE',
        notes: typeof req.body.notes === 'string' ? req.body.notes : '',
        addedBy: admin._id,
        addedByName: admin.name || admin.email || 'Agent',
      })
      res.locals.audit = {
        entityType: 'ToolAccess',
        entityId: String(t._id),
        entityRef: t.name,
        summary: `Création accès outil "${t.name}"`,
        after: { _id: t._id, name: t.name, category: t.category }, // pas de password
      }
      res.status(201).json(sanitizeToolAccess(t.toObject()))
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/tool-access/:id',
  requireScope('write:toolaccess'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const t = await ToolAccess.findById(req.params.id)
      if (!t) return respondError(res, 404, 'NOT_FOUND', 'Tool introuvable')
      const before = { ...t.toObject(), password: undefined } // pas dans audit
      const stringFields = ['name', 'url', 'login', 'notes']
      for (const f of stringFields) {
        if (typeof req.body[f] === 'string') {
          ;(t as unknown as Record<string, string>)[f] = req.body[f]
        }
      }
      if (typeof req.body.category === 'string' && (TOOL_CATEGORIES as readonly string[]).includes(req.body.category)) {
        t.category = req.body.category as typeof t.category
      }
      if (typeof req.body.password === 'string' && req.body.password.length > 0) {
        t.password = req.body.password
        t.lastRotatedAt = new Date()
      }
      await t.save()
      res.locals.audit = {
        entityType: 'ToolAccess',
        entityId: String(t._id),
        entityRef: t.name,
        summary: `Modification accès outil "${t.name}"${req.body.password ? ' (rotation password)' : ''}`,
        before,
        after: { ...t.toObject(), password: undefined },
      }
      res.json(sanitizeToolAccess(t.toObject()))
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/tool-access/:id',
  requireScope('write:toolaccess'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const t = await ToolAccess.findById(req.params.id)
      if (!t) return respondError(res, 404, 'NOT_FOUND', 'Tool introuvable')
      const before = { ...t.toObject(), password: undefined }
      await ToolAccess.deleteOne({ _id: t._id })
      res.locals.audit = { entityType: 'ToolAccess', entityId: String(t._id), entityRef: t.name, before }
      res.json({ ok: true, deletedId: String(t._id) })
    } catch (err) {
      next(err)
    }
  }
)

export default router
