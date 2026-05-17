import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { body, param, validationResult } from 'express-validator'
import QualiopiQuestionnaire from '../../models/QualiopiQuestionnaire.js'
import QualiopiCriterion from '../../models/QualiopiCriterion.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour Qualiopi (formation) — questionnaires + critères.
 *
 * Périmètre V1 : CRUD basique. Les uploads de fichiers de preuve (files
 * dans criteria) passent par /documents au lot 5.
 *
 * Scopes : read:qualiopi / write:qualiopi.
 */

const router = express.Router()

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

// ═════════════════════════════════════════════════════════════════════════
// Questionnaires
// ═════════════════════════════════════════════════════════════════════════

router.get(
  '/qualiopi/questionnaires',
  requireScope('read:qualiopi'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pag = parsePagination(req)
      const filter: Record<string, unknown> = {}
      if (typeof req.query.q === 'string' && req.query.q.trim()) {
        const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        filter.title = regex
      }
      const [items, total] = await Promise.all([
        QualiopiQuestionnaire.find(filter)
          .sort({ updatedAt: -1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .select('-responses') // détail uniquement
          .lean(),
        QualiopiQuestionnaire.countDocuments(filter),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/qualiopi/questionnaires/:id',
  requireScope('read:qualiopi'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const q = await QualiopiQuestionnaire.findById(req.params.id).lean()
      if (!q) return respondError(res, 404, 'NOT_FOUND', 'Questionnaire introuvable')
      res.json(q)
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/qualiopi/questionnaires',
  requireScope('write:qualiopi'),
  body('title').isString().trim().isLength({ min: 1 }),
  body('questions').optional().isArray(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      const q = await QualiopiQuestionnaire.create({
        title: String(req.body.title).trim(),
        description: typeof req.body.description === 'string' ? req.body.description : '',
        questions: Array.isArray(req.body.questions) ? req.body.questions : [],
        createdBy: admin?._id,
      } as Record<string, unknown>)
      res.locals.audit = {
        entityType: 'QualiopiQuestionnaire',
        entityId: String(q._id),
        entityRef: q.title,
        summary: `Création questionnaire "${q.title}"`,
        after: q.toObject(),
      }
      res.status(201).json(q.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/qualiopi/questionnaires/:id',
  requireScope('write:qualiopi'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const q = await QualiopiQuestionnaire.findById(req.params.id)
      if (!q) return respondError(res, 404, 'NOT_FOUND', 'Questionnaire introuvable')
      const before = q.toObject()
      if (typeof req.body.title === 'string') q.title = req.body.title.trim()
      if (typeof req.body.description === 'string') q.description = req.body.description
      if (Array.isArray(req.body.questions)) {
        q.questions = req.body.questions as typeof q.questions
      }
      await q.save()
      res.locals.audit = {
        entityType: 'QualiopiQuestionnaire',
        entityId: String(q._id),
        before,
        after: q.toObject(),
      }
      res.json(q.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/qualiopi/questionnaires/:id',
  requireScope('write:qualiopi'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const q = await QualiopiQuestionnaire.findById(req.params.id)
      if (!q) return respondError(res, 404, 'NOT_FOUND', 'Questionnaire introuvable')
      const before = q.toObject()
      await QualiopiQuestionnaire.deleteOne({ _id: q._id })
      res.locals.audit = { entityType: 'QualiopiQuestionnaire', entityId: String(q._id), entityRef: q.title, before }
      res.json({ ok: true, deletedId: String(q._id) })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/qualiopi/questionnaires/:id/responses',
  requireScope('read:qualiopi'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const q = await QualiopiQuestionnaire.findById(req.params.id).select('responses title').lean()
      if (!q) return respondError(res, 404, 'NOT_FOUND', 'Questionnaire introuvable')
      res.json({ items: q.responses || [], total: (q.responses || []).length })
    } catch (err) {
      next(err)
    }
  }
)

// ═════════════════════════════════════════════════════════════════════════
// Criteria
// ═════════════════════════════════════════════════════════════════════════

router.get(
  '/qualiopi/criteria',
  requireScope('read:qualiopi'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pag = parsePagination(req)
      const [items, total] = await Promise.all([
        QualiopiCriterion.find()
          .sort({ number: 1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .lean(),
        QualiopiCriterion.countDocuments(),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/qualiopi/criteria/:id',
  requireScope('read:qualiopi'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const c = await QualiopiCriterion.findById(req.params.id).lean()
      if (!c) return respondError(res, 404, 'NOT_FOUND', 'Critère introuvable')
      res.json(c)
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/qualiopi/criteria/:id',
  requireScope('write:qualiopi'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const c = await QualiopiCriterion.findById(req.params.id)
      if (!c) return respondError(res, 404, 'NOT_FOUND', 'Critère introuvable')
      const before = c.toObject()
      if (typeof req.body.title === 'string') c.title = req.body.title
      if (typeof req.body.description === 'string') c.description = req.body.description
      // Le modèle a des sous-éléments structurés (indicators) qu'on autorise
      // à modifier en bloc. La validation des sous-champs est laissée à mongoose.
      if (Array.isArray(req.body.indicators)) c.indicators = req.body.indicators as typeof c.indicators
      await c.save()
      res.locals.audit = {
        entityType: 'QualiopiCriterion',
        entityId: String(c._id),
        before,
        after: c.toObject(),
      }
      res.json(c.toObject())
    } catch (err) {
      next(err)
    }
  }
)

export default router
