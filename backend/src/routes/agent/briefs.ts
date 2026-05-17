import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { body, param, validationResult } from 'express-validator'
import MissionBrief from '../../models/MissionBrief.js'
import Project from '../../models/Project.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour les MissionBrief — fiches de mission détaillées
 * rattachées à un projet (et optionnellement à une tâche).
 *
 * Scopes : read:projects / write:projects (les briefs sont dans le
 * périmètre projets).
 */

const router = express.Router()

const BRIEF_ENTITIES = ['VENIO', 'CREATIO', 'DECISIO', 'FORMATIO'] as const
const BRIEF_PRIORITIES = ['P1', 'P2', 'P3'] as const
const BRIEF_STATUSES = [
  'A_FAIRE',
  'EN_COURS',
  'EN_REVIEW',
  'VALIDE',
  'LIVRE',
  'NON_VALIDE',
  'A_AMELIORER',
] as const
const FORMATS = ['PDF', 'PPT', 'FIGMA', 'VIDEO', 'WEB', 'AUTRE'] as const

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

router.get('/briefs', requireScope('read:projects'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    if (typeof req.query.project === 'string' && isValidObjectId(req.query.project)) {
      filter.project = req.query.project
    }
    if (typeof req.query.destinataire === 'string' && isValidObjectId(req.query.destinataire)) {
      filter.destinataire = req.query.destinataire
    }
    if (typeof req.query.entity === 'string' && (BRIEF_ENTITIES as readonly string[]).includes(req.query.entity)) {
      filter.entity = req.query.entity
    }
    if (
      typeof req.query.statut === 'string' &&
      (BRIEF_STATUSES as readonly string[]).includes(req.query.statut)
    ) {
      filter.statut = req.query.statut
    }
    const [items, total] = await Promise.all([
      MissionBrief.find(filter)
        .sort({ deadline: 1, createdAt: -1 })
        .skip(pag.skip)
        .limit(pag.limit)
        .populate('project', 'name')
        .populate('destinataire', 'name email')
        .lean(),
      MissionBrief.countDocuments(filter),
    ])
    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get(
  '/briefs/:id',
  requireScope('read:projects'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const brief = await MissionBrief.findById(req.params.id)
        .populate('project', 'name')
        .populate('destinataire', 'name email')
        .populate('validationPar', 'name email')
        .lean()
      if (!brief) return respondError(res, 404, 'NOT_FOUND', 'Brief introuvable')
      res.json(brief)
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/briefs',
  requireScope('write:projects'),
  body('project').custom((v) => isValidObjectId(v)).withMessage('project (ObjectId) requis'),
  body('destinataire').custom((v) => isValidObjectId(v)).withMessage('destinataire (ObjectId) requis'),
  body('intitule').isString().trim().isLength({ min: 1 }).withMessage('intitule requis'),
  body('deadline').custom((v) => !Number.isNaN(Date.parse(v))).withMessage('deadline ISO requise'),
  body('entity').optional().isIn(BRIEF_ENTITIES as unknown as string[]),
  body('briefPriority').optional().isIn(BRIEF_PRIORITIES as unknown as string[]),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const project = await Project.exists({ _id: req.body.project })
      if (!project) return respondError(res, 422, 'INVALID_PROJECT', 'Projet introuvable')
      const dest = await User.exists({ _id: req.body.destinataire })
      if (!dest) return respondError(res, 422, 'INVALID_DESTINATAIRE', 'Destinataire introuvable')
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      if (!admin) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour createdBy')

      const formatLivrable = Array.isArray(req.body.formatLivrable)
        ? req.body.formatLivrable.filter((f: string) => (FORMATS as readonly string[]).includes(f))
        : []

      const brief = await MissionBrief.create({
        project: req.body.project,
        task: req.body.task && isValidObjectId(req.body.task) ? req.body.task : null,
        destinataire: req.body.destinataire,
        entity:
          typeof req.body.entity === 'string' && (BRIEF_ENTITIES as readonly string[]).includes(req.body.entity)
            ? req.body.entity
            : 'VENIO',
        briefPriority:
          typeof req.body.briefPriority === 'string' &&
          (BRIEF_PRIORITIES as readonly string[]).includes(req.body.briefPriority)
            ? req.body.briefPriority
            : 'P2',
        deadline: new Date(req.body.deadline),
        intitule: String(req.body.intitule).trim(),
        contexte: typeof req.body.contexte === 'string' ? req.body.contexte : '',
        livrablesAttendus: typeof req.body.livrablesAttendus === 'string' ? req.body.livrablesAttendus : '',
        formatLivrable,
        ressources: typeof req.body.ressources === 'string' ? req.body.ressources : '',
        pointsVigilance: typeof req.body.pointsVigilance === 'string' ? req.body.pointsVigilance : '',
        pointIntermediaire: req.body.pointIntermediaire ? new Date(req.body.pointIntermediaire) : null,
        validationPar:
          typeof req.body.validationPar === 'string' && isValidObjectId(req.body.validationPar)
            ? req.body.validationPar
            : null,
        statut:
          typeof req.body.statut === 'string' && (BRIEF_STATUSES as readonly string[]).includes(req.body.statut)
            ? req.body.statut
            : 'A_FAIRE',
        datesCles: Array.isArray(req.body.datesCles) ? req.body.datesCles : [],
        commentaires: typeof req.body.commentaires === 'string' ? req.body.commentaires : '',
        createdBy: admin._id,
      })
      res.locals.audit = {
        entityType: 'MissionBrief',
        entityId: String(brief._id),
        entityRef: brief.intitule,
        summary: `Création du brief "${brief.intitule}"`,
        after: brief.toObject(),
      }
      res.status(201).json(brief.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/briefs/:id',
  requireScope('write:projects'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const brief = await MissionBrief.findById(req.params.id)
      if (!brief) return respondError(res, 404, 'NOT_FOUND', 'Brief introuvable')
      const before = brief.toObject()
      const stringFields = [
        'intitule',
        'contexte',
        'livrablesAttendus',
        'ressources',
        'pointsVigilance',
        'commentaires',
      ]
      for (const f of stringFields) {
        if (typeof req.body[f] === 'string') {
          ;(brief as unknown as Record<string, string>)[f] = req.body[f]
        }
      }
      if (typeof req.body.entity === 'string' && (BRIEF_ENTITIES as readonly string[]).includes(req.body.entity)) {
        brief.entity = req.body.entity as typeof brief.entity
      }
      if (
        typeof req.body.briefPriority === 'string' &&
        (BRIEF_PRIORITIES as readonly string[]).includes(req.body.briefPriority)
      ) {
        brief.briefPriority = req.body.briefPriority as typeof brief.briefPriority
      }
      if (typeof req.body.statut === 'string' && (BRIEF_STATUSES as readonly string[]).includes(req.body.statut)) {
        brief.statut = req.body.statut as typeof brief.statut
      }
      if (Array.isArray(req.body.formatLivrable)) {
        brief.formatLivrable = req.body.formatLivrable.filter((f: string) =>
          (FORMATS as readonly string[]).includes(f)
        ) as typeof brief.formatLivrable
      }
      if (req.body.deadline !== undefined && !Number.isNaN(Date.parse(req.body.deadline))) {
        brief.deadline = new Date(req.body.deadline)
      }
      if (req.body.pointIntermediaire !== undefined) {
        brief.pointIntermediaire = req.body.pointIntermediaire
          ? new Date(req.body.pointIntermediaire)
          : null
      }
      if (req.body.destinataire !== undefined && isValidObjectId(req.body.destinataire)) {
        brief.destinataire = req.body.destinataire
      }
      if (req.body.validationPar !== undefined) {
        brief.validationPar = isValidObjectId(req.body.validationPar)
          ? (req.body.validationPar as unknown as typeof brief.validationPar)
          : (null as unknown as typeof brief.validationPar)
      }
      if (Array.isArray(req.body.datesCles)) {
        brief.datesCles = req.body.datesCles as typeof brief.datesCles
      }
      await brief.save()
      res.locals.audit = {
        entityType: 'MissionBrief',
        entityId: String(brief._id),
        before,
        after: brief.toObject(),
      }
      res.json(brief.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/briefs/:id',
  requireScope('write:projects'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const brief = await MissionBrief.findById(req.params.id)
      if (!brief) return respondError(res, 404, 'NOT_FOUND', 'Brief introuvable')
      const before = brief.toObject()
      await MissionBrief.deleteOne({ _id: brief._id })
      res.locals.audit = {
        entityType: 'MissionBrief',
        entityId: String(brief._id),
        entityRef: brief.intitule,
        before,
      }
      res.json({ ok: true, deletedId: String(brief._id) })
    } catch (err) {
      next(err)
    }
  }
)

export default router
