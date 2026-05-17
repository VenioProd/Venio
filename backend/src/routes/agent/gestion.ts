import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { body, param, validationResult } from 'express-validator'
import InternalProject, { ENTITIES, POLES } from '../../models/InternalProject.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour les InternalProject (projets internes de l'entreprise,
 * différents des projets clients).
 *
 * Scope : read:gestion / write:gestion (le module admin s'appelle Gestion).
 */

const router = express.Router()

const STATUSES = ['EN_COURS', 'EN_ATTENTE', 'TERMINE', 'ARCHIVE'] as const
const PRIORITIES = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'] as const

function isValidObjectId(id: unknown): boolean {
  return typeof id === 'string' && mongoose.isValidObjectId(id)
}

function emit(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, { errors: errors.array() })
    return true
  }
  return false
}

router.get(
  '/internal-projects',
  requireScope('read:gestion'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pag = parsePagination(req)
      const filter: Record<string, unknown> = {}
      if (typeof req.query.entity === 'string' && (ENTITIES as readonly string[]).includes(req.query.entity)) {
        filter.entity = req.query.entity
      }
      if (typeof req.query.status === 'string' && (STATUSES as readonly string[]).includes(req.query.status)) {
        filter.status = req.query.status
      }
      if (typeof req.query.priority === 'string' && (PRIORITIES as readonly string[]).includes(req.query.priority)) {
        filter.priority = req.query.priority
      }
      if (typeof req.query.q === 'string' && req.query.q.trim()) {
        const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        filter.$or = [{ name: regex }, { description: regex }]
      }
      const [items, total] = await Promise.all([
        InternalProject.find(filter)
          .sort({ updatedAt: -1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .populate('members', 'name email')
          .lean(),
        InternalProject.countDocuments(filter),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/internal-projects/:id',
  requireScope('read:gestion'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const p = await InternalProject.findById(req.params.id)
        .populate('members', 'name email')
        .populate('createdBy', 'name email')
        .lean()
      if (!p) return respondError(res, 404, 'NOT_FOUND', 'Projet interne introuvable')
      res.json(p)
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/internal-projects',
  requireScope('write:gestion'),
  body('name').isString().trim().isLength({ min: 1 }),
  body('entity').isIn(ENTITIES as unknown as string[]).withMessage(`entity ∈ ${ENTITIES.join('|')}`),
  body('poles').optional().isArray(),
  body('members').optional().isArray(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      if (!admin) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour createdBy')

      const validPoles = Array.isArray(req.body.poles)
        ? req.body.poles.filter((p: unknown) => typeof p === 'string' && (POLES as readonly string[]).includes(p))
        : []
      const validMembers = Array.isArray(req.body.members)
        ? req.body.members.filter((m: unknown) => isValidObjectId(m))
        : []

      const p = await InternalProject.create({
        name: String(req.body.name).trim(),
        description: typeof req.body.description === 'string' ? req.body.description : '',
        entity: req.body.entity,
        poles: validPoles,
        members: validMembers,
        status:
          typeof req.body.status === 'string' && (STATUSES as readonly string[]).includes(req.body.status)
            ? req.body.status
            : 'EN_COURS',
        priority:
          typeof req.body.priority === 'string' && (PRIORITIES as readonly string[]).includes(req.body.priority)
            ? req.body.priority
            : 'NORMALE',
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
        tags: Array.isArray(req.body.tags) ? req.body.tags.map((t: unknown) => String(t)) : [],
        createdBy: admin._id,
      })
      res.locals.audit = {
        entityType: 'InternalProject',
        entityId: String(p._id),
        entityRef: p.name,
        summary: `Création projet interne "${p.name}"`,
        after: p.toObject(),
      }
      res.status(201).json(p.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/internal-projects/:id',
  requireScope('write:gestion'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const p = await InternalProject.findById(req.params.id)
      if (!p) return respondError(res, 404, 'NOT_FOUND', 'Projet interne introuvable')
      const before = p.toObject()
      if (typeof req.body.name === 'string') p.name = req.body.name.trim()
      if (typeof req.body.description === 'string') p.description = req.body.description
      if (typeof req.body.entity === 'string' && (ENTITIES as readonly string[]).includes(req.body.entity)) {
        p.entity = req.body.entity
      }
      if (typeof req.body.status === 'string' && (STATUSES as readonly string[]).includes(req.body.status)) {
        p.status = req.body.status as typeof p.status
      }
      if (typeof req.body.priority === 'string' && (PRIORITIES as readonly string[]).includes(req.body.priority)) {
        p.priority = req.body.priority as typeof p.priority
      }
      if (Array.isArray(req.body.poles)) {
        p.poles = req.body.poles.filter(
          (x: unknown) => typeof x === 'string' && (POLES as readonly string[]).includes(x)
        )
      }
      if (Array.isArray(req.body.members)) {
        p.members = req.body.members.filter(isValidObjectId)
      }
      if (Array.isArray(req.body.tags)) {
        p.tags = req.body.tags.map((t: unknown) => String(t))
      }
      if (req.body.startDate !== undefined) p.startDate = req.body.startDate ? new Date(req.body.startDate) : null
      if (req.body.endDate !== undefined) p.endDate = req.body.endDate ? new Date(req.body.endDate) : null
      await p.save()
      res.locals.audit = {
        entityType: 'InternalProject',
        entityId: String(p._id),
        entityRef: p.name,
        before,
        after: p.toObject(),
      }
      res.json(p.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/internal-projects/:id',
  requireScope('write:gestion'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const p = await InternalProject.findById(req.params.id)
      if (!p) return respondError(res, 404, 'NOT_FOUND', 'Projet interne introuvable')
      const before = p.toObject()
      await InternalProject.deleteOne({ _id: p._id })
      res.locals.audit = { entityType: 'InternalProject', entityId: String(p._id), entityRef: p.name, before }
      res.json({ ok: true, deletedId: String(p._id) })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/internal-projects/_meta/options',
  requireScope('read:gestion'),
  (_req: Request, res: Response) => {
    res.json({ entities: ENTITIES, poles: POLES, statuses: STATUSES, priorities: PRIORITIES })
  }
)

export default router
