import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { body, param, validationResult } from 'express-validator'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'
import DevProject, { DEV_PROJECT_STATUSES } from '../../models/DevProject.js'
import DevIssue, {
  DEV_ISSUE_STATUSES,
  DEV_ISSUE_PRIORITIES,
  DEV_ISSUE_TYPES,
} from '../../models/DevIssue.js'
import DevIssueComment from '../../models/DevIssueComment.js'
import User from '../../models/User.js'
import { computeStats, computeOverview } from '../../lib/dev/stats.js'

/**
 * Routes agent pour le suivi des développements (DevProject + DevIssue +
 * DevIssueComment) — inspiré de Linear. Scopes : read:dev / write:dev.
 *
 * authorId / reporter / author : par défaut on utilise un SUPER_ADMIN comme
 * compte de système (le token agent n'a pas de User associé).
 */

const router = express.Router()

const isObjectId = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v)

function emit(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, { errors: errors.array() })
    return true
  }
  return false
}

async function resolveSystemUserId(): Promise<mongoose.Types.ObjectId | null> {
  const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
  return admin?._id ? (admin._id as mongoose.Types.ObjectId) : null
}

function sanitizeKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(trimmed)) return null
  return trimmed
}

// ─── Stats & overview (read:dev) ─────────────────────────────────────────────

router.get(
  '/dev/stats',
  requireScope('read:dev'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const match: Record<string, unknown> = {}
      const { project } = req.query
      if (isObjectId(project)) {
        match.project = new mongoose.Types.ObjectId(project)
      }
      const stats = await computeStats(match)
      res.json(stats)
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/dev/overview',
  requireScope('read:dev'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const overview = await computeOverview()
      res.json(overview)
    } catch (err) {
      next(err)
    }
  }
)

// ─── Projects ────────────────────────────────────────────────────────────────

router.get('/dev/projects', requireScope('read:dev'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    if (typeof req.query.status === 'string' && (DEV_PROJECT_STATUSES as readonly string[]).includes(req.query.status)) {
      filter.status = req.query.status
    }
    const [items, total] = await Promise.all([
      DevProject.find(filter).sort({ updatedAt: -1 }).skip(pag.skip).limit(pag.limit).lean(),
      DevProject.countDocuments(filter),
    ])
    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.post(
  '/dev/projects',
  requireScope('write:dev'),
  body('key').isString().withMessage('key requis'),
  body('name').isString().trim().isLength({ min: 1 }).withMessage('name requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const key = sanitizeKey(req.body?.key)
      if (!key) return respondError(res, 400, 'VALIDATION_ERROR', 'Clé invalide (2-8 majuscules)')
      const systemId = await resolveSystemUserId()
      if (!systemId) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour createdBy')

      const existing = await DevProject.findOne({ key })
      if (existing) return respondError(res, 409, 'DUPLICATE_KEY', `La clé "${key}" existe déjà`)

      const project = await DevProject.create({
        key,
        name: String(req.body.name).trim().slice(0, 120),
        description: typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 2000) : '',
        color:
          typeof req.body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.color)
            ? req.body.color
            : '#7c5cff',
        createdBy: systemId,
      })
      res.locals.audit = {
        entityType: 'DevProject',
        entityId: String(project._id),
        entityRef: project.key,
        summary: `Création projet dev "${project.key}"`,
        after: project.toObject(),
      }
      res.status(201).json(project.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.get('/dev/projects/:id', requireScope('read:dev'), param('id').isMongoId(), async (req, res, next) => {
  if (emit(req, res)) return
  try {
    const project = await DevProject.findById(req.params.id).lean()
    if (!project) return respondError(res, 404, 'NOT_FOUND', 'Projet introuvable')
    res.json(project)
  } catch (err) {
    next(err)
  }
})

// ─── Issues ──────────────────────────────────────────────────────────────────

router.get('/dev/issues', requireScope('read:dev'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    if (typeof req.query.project === 'string' && isObjectId(req.query.project)) {
      filter.project = req.query.project
    }
    if (typeof req.query.status === 'string') {
      if (req.query.status === 'open') filter.status = { $nin: ['DONE', 'CANCELLED'] }
      else if ((DEV_ISSUE_STATUSES as readonly string[]).includes(req.query.status)) filter.status = req.query.status
    }
    if (typeof req.query.priority === 'string' && (DEV_ISSUE_PRIORITIES as readonly string[]).includes(req.query.priority)) {
      filter.priority = req.query.priority
    }
    if (typeof req.query.type === 'string' && (DEV_ISSUE_TYPES as readonly string[]).includes(req.query.type)) {
      filter.type = req.query.type
    }
    if (typeof req.query.assignee === 'string' && isObjectId(req.query.assignee)) {
      filter.assignee = req.query.assignee
    }
    const [items, total] = await Promise.all([
      DevIssue.find(filter).sort({ updatedAt: -1 }).skip(pag.skip).limit(pag.limit).lean(),
      DevIssue.countDocuments(filter),
    ])
    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.post(
  '/dev/issues',
  requireScope('write:dev'),
  body('project').isMongoId().withMessage('project requis'),
  body('title').isString().trim().isLength({ min: 1 }).withMessage('title requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const projectDoc = await DevProject.findById(req.body.project)
      if (!projectDoc) return respondError(res, 404, 'NOT_FOUND', 'Projet introuvable')

      const systemId = await resolveSystemUserId()
      if (!systemId) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour reporter')

      const last = await DevIssue.findOne({ project: projectDoc._id }).sort({ number: -1 }).select('number').lean()
      const number = (last?.number ?? 0) + 1
      const identifier = `${projectDoc.key}-${number}`

      const status =
        typeof req.body?.status === 'string' && (DEV_ISSUE_STATUSES as readonly string[]).includes(req.body.status)
          ? req.body.status
          : 'BACKLOG'

      const issue = await DevIssue.create({
        project: projectDoc._id,
        number,
        identifier,
        title: String(req.body.title).trim().slice(0, 200),
        description:
          typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 20000) : '',
        type:
          typeof req.body?.type === 'string' && (DEV_ISSUE_TYPES as readonly string[]).includes(req.body.type)
            ? req.body.type
            : 'TASK',
        status,
        priority:
          typeof req.body?.priority === 'string' && (DEV_ISSUE_PRIORITIES as readonly string[]).includes(req.body.priority)
            ? req.body.priority
            : 'NO_PRIORITY',
        reporter: systemId,
        labels: Array.isArray(req.body?.labels)
          ? Array.from(new Set(req.body.labels.filter((l: unknown) => typeof l === 'string').map((l: string) => l.trim().toLowerCase()))).slice(0, 16)
          : [],
        startedAt: status === 'IN_PROGRESS' || status === 'IN_REVIEW' ? new Date() : null,
        completedAt: status === 'DONE' ? new Date() : null,
      })

      res.locals.audit = {
        entityType: 'DevIssue',
        entityId: String(issue._id),
        entityRef: issue.identifier,
        summary: `Création issue ${issue.identifier} "${issue.title}"`,
        after: issue.toObject(),
      }
      res.status(201).json(issue.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/dev/issues/:id',
  requireScope('write:dev'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const issue = await DevIssue.findById(req.params.id)
      if (!issue) return respondError(res, 404, 'NOT_FOUND', 'Issue introuvable')
      const before = issue.toObject()

      if (typeof req.body?.title === 'string' && req.body.title.trim()) issue.title = req.body.title.trim().slice(0, 200)
      if (typeof req.body?.description === 'string') issue.description = req.body.description.slice(0, 20000)
      if (typeof req.body?.type === 'string' && (DEV_ISSUE_TYPES as readonly string[]).includes(req.body.type)) {
        issue.type = req.body.type as typeof issue.type
      }
      if (typeof req.body?.status === 'string' && (DEV_ISSUE_STATUSES as readonly string[]).includes(req.body.status)) {
        const next = req.body.status as typeof issue.status
        if (next !== issue.status) {
          if ((next === 'IN_PROGRESS' || next === 'IN_REVIEW') && !issue.startedAt) issue.startedAt = new Date()
          if (next === 'DONE' && !issue.completedAt) issue.completedAt = new Date()
          if (next !== 'DONE') issue.completedAt = null
        }
        issue.status = next
      }
      if (typeof req.body?.priority === 'string' && (DEV_ISSUE_PRIORITIES as readonly string[]).includes(req.body.priority)) {
        issue.priority = req.body.priority as typeof issue.priority
      }
      if (req.body?.assignee === null) issue.assignee = null
      else if (isObjectId(req.body?.assignee)) issue.assignee = new mongoose.Types.ObjectId(req.body.assignee)

      await issue.save()
      res.locals.audit = {
        entityType: 'DevIssue',
        entityId: String(issue._id),
        entityRef: issue.identifier,
        before,
        after: issue.toObject(),
      }
      res.json(issue.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/dev/issues/:id/comments',
  requireScope('write:dev'),
  param('id').isMongoId(),
  body('body').isString().trim().isLength({ min: 1 }).withMessage('body requis'),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const issue = await DevIssue.findById(req.params.id).select('_id project identifier')
      if (!issue) return respondError(res, 404, 'NOT_FOUND', 'Issue introuvable')
      const systemId = await resolveSystemUserId()
      if (!systemId) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour author')

      const comment = await DevIssueComment.create({
        issue: issue._id,
        project: issue.project,
        author: systemId,
        body: String(req.body.body).trim().slice(0, 10000),
      })
      await DevIssue.updateOne({ _id: issue._id }, { $set: { updatedAt: new Date() } })

      res.locals.audit = {
        entityType: 'DevIssueComment',
        entityId: String(comment._id),
        entityRef: issue.identifier,
        summary: `Commentaire ajouté sur ${issue.identifier}`,
        after: comment.toObject(),
      }
      res.status(201).json(comment.toObject())
    } catch (err) {
      next(err)
    }
  }
)

export default router
