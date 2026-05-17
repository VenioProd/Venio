import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { body, param, validationResult } from 'express-validator'
import Intern from '../../models/Intern.js'
import InternalMission from '../../models/InternalMission.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour les Interns (stagiaires/alternants) et leurs missions
 * internes.
 *
 * Scopes : read:interns / write:interns.
 *
 * Périmètre V1 : CRUD basique. Pas de gestion Nextcloud (provisioning
 * automatique reste pilotée par l'UI admin).
 */

const router = express.Router()

const INTERN_TYPES = ['STAGIAIRE', 'ALTERNANT'] as const
const STATUSES = ['ACTIF', 'TERMINE', 'ANNULE'] as const
const MISSION_STATUSES = ['A_FAIRE', 'EN_COURS', 'TERMINE'] as const

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
// Interns
// ═════════════════════════════════════════════════════════════════════════

router.get('/interns', requireScope('read:interns'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    if (typeof req.query.status === 'string' && (STATUSES as readonly string[]).includes(req.query.status)) {
      filter.status = req.query.status
    }
    if (typeof req.query.type === 'string' && (INTERN_TYPES as readonly string[]).includes(req.query.type)) {
      filter.type = req.query.type
    }
    const [items, total] = await Promise.all([
      Intern.find(filter)
        .sort({ dateDebut: -1 })
        .skip(pag.skip)
        .limit(pag.limit)
        .populate('userId', 'name email')
        .populate('tuteur', 'name email')
        .select('-nextcloudPassword') // ne pas exposer
        .lean(),
      Intern.countDocuments(filter),
    ])
    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get(
  '/interns/:id',
  requireScope('read:interns'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const i = await Intern.findById(req.params.id)
        .populate('userId', 'name email')
        .populate('tuteur', 'name email')
        .select('-nextcloudPassword')
        .lean()
      if (!i) return respondError(res, 404, 'NOT_FOUND', 'Stagiaire introuvable')
      res.json(i)
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/interns',
  requireScope('write:interns'),
  body('userId').custom((v) => isValidObjectId(v)).withMessage('userId requis'),
  body('type').isIn(INTERN_TYPES as unknown as string[]),
  body('poste').isString().trim().isLength({ min: 1 }),
  body('dateDebut').custom((v) => !Number.isNaN(Date.parse(v))),
  body('dateFin').custom((v) => !Number.isNaN(Date.parse(v))),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await User.exists({ _id: req.body.userId })
      if (!user) return respondError(res, 422, 'INVALID_USER', 'User introuvable')
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      if (!admin) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour createdBy')
      const intern = await Intern.create({
        userId: req.body.userId,
        type: req.body.type,
        poste: String(req.body.poste).trim(),
        departement: typeof req.body.departement === 'string' ? req.body.departement : '',
        dateDebut: new Date(req.body.dateDebut),
        dateFin: new Date(req.body.dateFin),
        tuteur: req.body.tuteur && isValidObjectId(req.body.tuteur) ? req.body.tuteur : null,
        ecole: typeof req.body.ecole === 'string' ? req.body.ecole : '',
        formation: typeof req.body.formation === 'string' ? req.body.formation : '',
        notes: typeof req.body.notes === 'string' ? req.body.notes : '',
        joursPresence: Array.isArray(req.body.joursPresence) ? req.body.joursPresence : [],
        inclureEquipe: req.body.inclureEquipe !== false,
        status: 'ACTIF',
        createdBy: admin._id,
      })
      res.locals.audit = {
        entityType: 'Intern',
        entityId: String(intern._id),
        entityRef: intern.poste,
        summary: `Création stagiaire/alternant pour ${req.body.userId}`,
        after: { _id: intern._id, type: intern.type, poste: intern.poste },
      }
      res.status(201).json(intern.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/interns/:id',
  requireScope('write:interns'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const intern = await Intern.findById(req.params.id)
      if (!intern) return respondError(res, 404, 'NOT_FOUND', 'Stagiaire introuvable')
      const before = intern.toObject()
      const stringFields = ['poste', 'departement', 'ecole', 'formation', 'notes']
      for (const f of stringFields) {
        if (typeof req.body[f] === 'string') {
          ;(intern as unknown as Record<string, string>)[f] = req.body[f]
        }
      }
      if (typeof req.body.status === 'string' && (STATUSES as readonly string[]).includes(req.body.status)) {
        intern.status = req.body.status as typeof intern.status
      }
      if (req.body.dateDebut !== undefined) intern.dateDebut = new Date(req.body.dateDebut)
      if (req.body.dateFin !== undefined) intern.dateFin = new Date(req.body.dateFin)
      if (req.body.tuteur !== undefined) {
        intern.tuteur = isValidObjectId(req.body.tuteur)
          ? (req.body.tuteur as unknown as typeof intern.tuteur)
          : (null as unknown as typeof intern.tuteur)
      }
      if (Array.isArray(req.body.joursPresence)) intern.joursPresence = req.body.joursPresence
      if (typeof req.body.inclureEquipe === 'boolean') intern.inclureEquipe = req.body.inclureEquipe
      await intern.save()
      res.locals.audit = {
        entityType: 'Intern',
        entityId: String(intern._id),
        before,
        after: intern.toObject(),
      }
      res.json(intern.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/interns/:id',
  requireScope('write:interns'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const intern = await Intern.findById(req.params.id)
      if (!intern) return respondError(res, 404, 'NOT_FOUND', 'Stagiaire introuvable')
      const before = intern.toObject()
      await Intern.deleteOne({ _id: intern._id })
      res.locals.audit = { entityType: 'Intern', entityId: String(intern._id), before }
      res.json({ ok: true, deletedId: String(intern._id) })
    } catch (err) {
      next(err)
    }
  }
)

// ═════════════════════════════════════════════════════════════════════════
// Internal missions (rattachées à un InternalProject)
// ═════════════════════════════════════════════════════════════════════════

router.get(
  '/internal-missions',
  requireScope('read:interns'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pag = parsePagination(req)
      const filter: Record<string, unknown> = {}
      if (typeof req.query.internalProject === 'string' && isValidObjectId(req.query.internalProject)) {
        filter.internalProject = req.query.internalProject
      }
      if (typeof req.query.status === 'string' && (MISSION_STATUSES as readonly string[]).includes(req.query.status)) {
        filter.status = req.query.status
      }
      if (typeof req.query.assignedTo === 'string' && isValidObjectId(req.query.assignedTo)) {
        filter.assignedTo = req.query.assignedTo
      }
      const [items, total] = await Promise.all([
        InternalMission.find(filter)
          .sort({ dueDate: 1, createdAt: -1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .populate('assignedTo', 'name email')
          .lean(),
        InternalMission.countDocuments(filter),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/internal-missions',
  requireScope('write:interns'),
  body('title').isString().trim().isLength({ min: 1 }),
  body('internalProject').custom((v) => isValidObjectId(v)),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      if (!admin) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour createdBy')
      const m = await InternalMission.create({
        title: String(req.body.title).trim(),
        description: typeof req.body.description === 'string' ? req.body.description : '',
        assignedTo: Array.isArray(req.body.assignedTo) ? req.body.assignedTo.filter(isValidObjectId) : [],
        participants: Array.isArray(req.body.participants) ? req.body.participants : [],
        internalProject: req.body.internalProject,
        status:
          typeof req.body.status === 'string' && (MISSION_STATUSES as readonly string[]).includes(req.body.status)
            ? req.body.status
            : 'A_FAIRE',
        progress: typeof req.body.progress === 'number' ? Math.max(0, Math.min(100, req.body.progress)) : 0,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
        steps: Array.isArray(req.body.steps) ? req.body.steps : [],
        deliverables: Array.isArray(req.body.deliverables) ? req.body.deliverables : [],
        createdBy: admin._id,
      })
      res.locals.audit = {
        entityType: 'InternalMission',
        entityId: String(m._id),
        entityRef: m.title,
        summary: `Création mission interne "${m.title}"`,
        after: m.toObject(),
      }
      res.status(201).json(m.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/internal-missions/:id',
  requireScope('write:interns'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const m = await InternalMission.findById(req.params.id)
      if (!m) return respondError(res, 404, 'NOT_FOUND', 'Mission introuvable')
      const before = m.toObject()
      if (typeof req.body.title === 'string') m.title = req.body.title
      if (typeof req.body.description === 'string') m.description = req.body.description
      if (typeof req.body.status === 'string' && (MISSION_STATUSES as readonly string[]).includes(req.body.status)) {
        m.status = req.body.status as typeof m.status
      }
      if (typeof req.body.progress === 'number') {
        m.progress = Math.max(0, Math.min(100, req.body.progress))
      }
      if (req.body.dueDate !== undefined) m.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null
      if (Array.isArray(req.body.assignedTo)) m.assignedTo = req.body.assignedTo.filter(isValidObjectId)
      if (Array.isArray(req.body.steps)) m.steps = req.body.steps as typeof m.steps
      if (Array.isArray(req.body.deliverables)) m.deliverables = req.body.deliverables as typeof m.deliverables
      await m.save()
      res.locals.audit = { entityType: 'InternalMission', entityId: String(m._id), before, after: m.toObject() }
      res.json(m.toObject())
    } catch (err) {
      next(err)
    }
  }
)

export default router
