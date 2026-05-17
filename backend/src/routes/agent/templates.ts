import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { body, param, validationResult } from 'express-validator'
import ProjectTemplate from '../../models/ProjectTemplate.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour les ProjectTemplate (modèles de projets réutilisables).
 *
 * Scopes : read:projects / write:projects (les templates appartiennent au
 * périmètre Projets — pas de scope dédié pour éviter la prolifération).
 */

const router = express.Router()
const PRIORITIES = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'] as const

function emit(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, { errors: errors.array() })
    return true
  }
  return false
}

router.get('/templates', requireScope('read:projects'), async (req, res, next) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ name: regex }, { description: regex }]
    }
    const [items, total] = await Promise.all([
      ProjectTemplate.find(filter)
        .sort({ updatedAt: -1 })
        .skip(pag.skip)
        .limit(pag.limit)
        .populate('createdBy', 'name email')
        .lean(),
      ProjectTemplate.countDocuments(filter),
    ])
    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get(
  '/templates/:id',
  requireScope('read:projects'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const tpl = await ProjectTemplate.findById(req.params.id)
        .populate('createdBy', 'name email')
        .lean()
      if (!tpl) return respondError(res, 404, 'NOT_FOUND', 'Template introuvable')
      res.json(tpl)
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/templates',
  requireScope('write:projects'),
  body('name').isString().trim().isLength({ min: 1 }).withMessage('name requis'),
  body('priority').optional().isIn(PRIORITIES as unknown as string[]),
  body('defaultSections').optional().isArray(),
  body('defaultTasks').optional().isArray(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      const tpl = await ProjectTemplate.create({
        name: String(req.body.name).trim(),
        description: typeof req.body.description === 'string' ? req.body.description : '',
        serviceTypes: Array.isArray(req.body.serviceTypes) ? req.body.serviceTypes : [],
        deliverableTypes: Array.isArray(req.body.deliverableTypes) ? req.body.deliverableTypes : [],
        tags: Array.isArray(req.body.tags) ? req.body.tags : [],
        priority:
          typeof req.body.priority === 'string' && (PRIORITIES as readonly string[]).includes(req.body.priority)
            ? req.body.priority
            : 'NORMALE',
        defaultSections: Array.isArray(req.body.defaultSections) ? req.body.defaultSections : [],
        defaultTasks: Array.isArray(req.body.defaultTasks) ? req.body.defaultTasks : [],
        budget: req.body.budget && typeof req.body.budget === 'object' ? req.body.budget : undefined,
        createdBy: admin?._id,
      })
      res.locals.audit = {
        entityType: 'ProjectTemplate',
        entityId: String(tpl._id),
        entityRef: tpl.name,
        summary: `Création du template "${tpl.name}"`,
        after: tpl.toObject(),
      }
      res.status(201).json(tpl.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/templates/:id',
  requireScope('write:projects'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const tpl = await ProjectTemplate.findById(req.params.id)
      if (!tpl) return respondError(res, 404, 'NOT_FOUND', 'Template introuvable')
      const before = tpl.toObject()
      const stringFields = ['name', 'description']
      for (const f of stringFields) {
        if (typeof req.body[f] === 'string') {
          ;(tpl as unknown as Record<string, string>)[f] = req.body[f]
        }
      }
      if (Array.isArray(req.body.serviceTypes)) tpl.serviceTypes = req.body.serviceTypes
      if (Array.isArray(req.body.deliverableTypes)) tpl.deliverableTypes = req.body.deliverableTypes
      if (Array.isArray(req.body.tags)) tpl.tags = req.body.tags
      if (Array.isArray(req.body.defaultSections)) {
        tpl.defaultSections = req.body.defaultSections as unknown as typeof tpl.defaultSections
      }
      if (Array.isArray(req.body.defaultTasks)) {
        tpl.defaultTasks = req.body.defaultTasks as unknown as typeof tpl.defaultTasks
      }
      if (typeof req.body.priority === 'string' && (PRIORITIES as readonly string[]).includes(req.body.priority)) {
        tpl.priority = req.body.priority as typeof tpl.priority
      }
      if (req.body.budget && typeof req.body.budget === 'object') {
        tpl.budget = req.body.budget as unknown as typeof tpl.budget
      }
      await tpl.save()
      res.locals.audit = {
        entityType: 'ProjectTemplate',
        entityId: String(tpl._id),
        before,
        after: tpl.toObject(),
      }
      res.json(tpl.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/templates/:id',
  requireScope('write:projects'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const tpl = await ProjectTemplate.findById(req.params.id)
      if (!tpl) return respondError(res, 404, 'NOT_FOUND', 'Template introuvable')
      const before = tpl.toObject()
      await ProjectTemplate.deleteOne({ _id: tpl._id })
      res.locals.audit = {
        entityType: 'ProjectTemplate',
        entityId: String(tpl._id),
        entityRef: tpl.name,
        before,
      }
      res.json({ ok: true, deletedId: String(tpl._id) })
    } catch (err) {
      next(err)
    }
  }
)

export default router
