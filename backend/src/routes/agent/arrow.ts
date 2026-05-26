import express, { type Request, type Response, type NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import ArrowPilotage from '../../models/ArrowPilotage.js'
import ArrowSchool from '../../models/ArrowSchool.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour Arrow (initiative de prospection des écoles).
 *
 * Scopes : read:arrow / write:arrow.
 *
 * - /arrow/pilotage : singleton (goals, scorecard, decisions, cadence)
 * - /arrow/schools  : pipeline de prospection des établissements
 */

const router = express.Router()

const SCHOOL_TYPES = ['LYCEE', 'BTS_IUT', 'UNIVERSITE', 'ECOLE_SUP', 'CFA', 'AUTRE'] as const
const SCHOOL_STATUSES = [
  'A_PROSPECTER',
  'CONTACTE',
  'REPONSE',
  'DEMO_PLANIFIEE',
  'DEMO_FAITE',
  'PROPOSITION',
  'SIGNE',
  'NON_INTERESSE',
] as const

function emit(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, { errors: errors.array() })
    return true
  }
  return false
}

// ═════════════════════════════════════════════════════════════════════════
// Pilotage (singleton)
// ═════════════════════════════════════════════════════════════════════════

router.get('/arrow/pilotage', requireScope('read:arrow'), async (_req, res, next) => {
  try {
    const doc = (await ArrowPilotage.findOne({ key: 'arrow' }).lean()) || {
      key: 'arrow',
      goals: [],
      scorecard: [],
      decisions: [],
      cadence: [],
    }
    res.json(doc)
  } catch (err) {
    next(err)
  }
})

router.put(
  '/arrow/pilotage',
  requireScope('write:arrow'),
  body('goals').optional().isArray(),
  body('scorecard').optional().isArray(),
  body('decisions').optional().isArray(),
  body('cadence').optional().isArray(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      const payload: Record<string, unknown> = { key: 'arrow', updatedBy: admin?._id }
      for (const f of ['goals', 'scorecard', 'decisions', 'cadence'] as const) {
        if (Array.isArray(req.body[f])) {
          payload[f] = req.body[f].map((s: unknown) => String(s))
        }
      }
      const doc = await ArrowPilotage.findOneAndUpdate({ key: 'arrow' }, { $set: payload }, {
        new: true,
        upsert: true,
      })
      res.locals.audit = {
        entityType: 'ArrowPilotage',
        entityId: String(doc?._id),
        summary: 'Mise à jour du pilotage Arrow',
        after: doc?.toObject(),
      }
      res.json(doc?.toObject())
    } catch (err) {
      next(err)
    }
  }
)

// ═════════════════════════════════════════════════════════════════════════
// Schools (pipeline de prospection)
// ═════════════════════════════════════════════════════════════════════════

router.get('/arrow/schools', requireScope('read:arrow'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    if (typeof req.query.status === 'string' && (SCHOOL_STATUSES as readonly string[]).includes(req.query.status)) {
      filter.status = req.query.status
    }
    if (typeof req.query.schoolType === 'string' && (SCHOOL_TYPES as readonly string[]).includes(req.query.schoolType)) {
      filter.schoolType = req.query.schoolType
    }
    if (typeof req.query.region === 'string') filter.region = req.query.region
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ name: regex }, { city: regex }, { contactName: regex }]
    }
    const [items, total] = await Promise.all([
      ArrowSchool.find(filter)
        .sort({ updatedAt: -1 })
        .skip(pag.skip)
        .limit(pag.limit)
        .lean(),
      ArrowSchool.countDocuments(filter),
    ])
    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get('/arrow/schools/:id', requireScope('read:arrow'), param('id').isMongoId(), async (req, res, next) => {
  if (emit(req, res)) return
  try {
    const s = await ArrowSchool.findById(req.params.id).lean()
    if (!s) return respondError(res, 404, 'NOT_FOUND', 'École introuvable')
    res.json(s)
  } catch (err) {
    next(err)
  }
})

router.post(
  '/arrow/schools',
  requireScope('write:arrow'),
  body('name').isString().trim().isLength({ min: 1 }),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      if (!admin) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour createdBy')
      const s = await ArrowSchool.create({
        name: String(req.body.name).trim(),
        createdBy: admin._id,
        schoolType:
          typeof req.body.schoolType === 'string' && (SCHOOL_TYPES as readonly string[]).includes(req.body.schoolType)
            ? req.body.schoolType
            : 'AUTRE',
        city: typeof req.body.city === 'string' ? req.body.city : '',
        region: typeof req.body.region === 'string' ? req.body.region : '',
        studentCount: typeof req.body.studentCount === 'number' ? req.body.studentCount : null,
        emailGeneral: typeof req.body.emailGeneral === 'string' ? req.body.emailGeneral : '',
        contactName: typeof req.body.contactName === 'string' ? req.body.contactName : '',
        contactRole: typeof req.body.contactRole === 'string' ? req.body.contactRole : '',
        contactEmail: typeof req.body.contactEmail === 'string' ? req.body.contactEmail : '',
        contactPhone: typeof req.body.contactPhone === 'string' ? req.body.contactPhone : '',
        status:
          typeof req.body.status === 'string' && (SCHOOL_STATUSES as readonly string[]).includes(req.body.status)
            ? req.body.status
            : 'A_PROSPECTER',
      })
      res.locals.audit = {
        entityType: 'ArrowSchool',
        entityId: String(s._id),
        entityRef: s.name,
        summary: `Création école "${s.name}"`,
        after: s.toObject(),
      }
      res.status(201).json(s.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/arrow/schools/:id',
  requireScope('write:arrow'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const s = await ArrowSchool.findById(req.params.id)
      if (!s) return respondError(res, 404, 'NOT_FOUND', 'École introuvable')
      const before = s.toObject()
      const stringFields = ['name', 'city', 'region', 'emailGeneral', 'contactName', 'contactRole', 'contactEmail', 'contactPhone']
      for (const f of stringFields) {
        if (typeof req.body[f] === 'string') {
          ;(s as unknown as Record<string, string>)[f] = req.body[f]
        }
      }
      if (typeof req.body.schoolType === 'string' && (SCHOOL_TYPES as readonly string[]).includes(req.body.schoolType)) {
        s.schoolType = req.body.schoolType as typeof s.schoolType
      }
      if (typeof req.body.status === 'string' && (SCHOOL_STATUSES as readonly string[]).includes(req.body.status)) {
        s.status = req.body.status as typeof s.status
      }
      if (typeof req.body.studentCount === 'number' || req.body.studentCount === null) {
        s.studentCount = req.body.studentCount
      }
      await s.save()
      res.locals.audit = {
        entityType: 'ArrowSchool',
        entityId: String(s._id),
        entityRef: s.name,
        before,
        after: s.toObject(),
      }
      res.json(s.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/arrow/schools/:id',
  requireScope('write:arrow'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const s = await ArrowSchool.findById(req.params.id)
      if (!s) return respondError(res, 404, 'NOT_FOUND', 'École introuvable')
      const before = s.toObject()
      await ArrowSchool.deleteOne({ _id: s._id })
      res.locals.audit = { entityType: 'ArrowSchool', entityId: String(s._id), entityRef: s.name, before }
      res.json({ ok: true, deletedId: String(s._id) })
    } catch (err) {
      next(err)
    }
  }
)

export default router
