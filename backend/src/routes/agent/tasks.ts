import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { body, param, validationResult } from 'express-validator'
import Task from '../../models/Task.js'
import TaskComment from '../../models/TaskComment.js'
import Project from '../../models/Project.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour les Tasks et leurs commentaires.
 *
 * Périmètre V1 : pas d'attachments via cet endpoint (les fichiers passent
 * par /documents, lot 5). Les commentaires sont en plain text uniquement
 * (les mentions sont acceptées en POST mais pas notifiées).
 *
 * Scopes : read:tasks / write:tasks.
 */

const router = express.Router()

const TASK_STATUSES = ['A_FAIRE', 'EN_COURS', 'EN_REVIEW', 'TERMINE', 'VALIDE', 'NON_VALIDE', 'A_MODIFIER'] as const
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

async function getDefaultAdminId(res: Response): Promise<string | null> {
  const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
  if (!admin) {
    respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour attribuer la ressource')
    return null
  }
  return String(admin._id)
}

// ───────────────────────────────────────────────────────────────────────────
// Tasks
// ───────────────────────────────────────────────────────────────────────────

router.get('/tasks', requireScope('read:tasks'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    const andFilters: Record<string, unknown>[] = []
    if (typeof req.query.project === 'string' && isValidObjectId(req.query.project)) {
      filter.project = req.query.project
    }
    if (typeof req.query.assignee === 'string' && isValidObjectId(req.query.assignee)) {
      filter.assignee = req.query.assignee
    }
    if (typeof req.query.status === 'string' && (TASK_STATUSES as readonly string[]).includes(req.query.status)) {
      filter.status = req.query.status
    }
    if (typeof req.query.priority === 'string' && (PRIORITIES as readonly string[]).includes(req.query.priority)) {
      filter.priority = req.query.priority
    }
    if (req.query.archived === 'true') {
      filter.isArchived = true
    } else if (req.query.archived === 'false' || req.query.archived === undefined) {
      andFilters.push({ $or: [{ isArchived: false }, { isArchived: { $exists: false } }] })
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      andFilters.push({ $or: [{ title: regex }, { description: regex }] })
    }
    if (andFilters.length > 0) filter.$and = andFilters

    const [items, total] = await Promise.all([
      Task.find(filter)
        .sort({ dueDate: 1, createdAt: -1 })
        .skip(pag.skip)
        .limit(pag.limit)
        .populate('assignee', 'name email')
        .populate('project', 'name')
        .lean(),
      Task.countDocuments(filter),
    ])

    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get(
  '/tasks/:id',
  requireScope('read:tasks'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const t = await Task.findById(req.params.id).populate('assignee', 'name email').populate('project', 'name').lean()
      if (!t) return respondError(res, 404, 'NOT_FOUND', 'Task introuvable')
      res.json(t)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/tasks',
  requireScope('write:tasks'),
  body('project')
    .custom((v) => isValidObjectId(v))
    .withMessage('project (ObjectId) requis'),
  body('title').isString().trim().isLength({ min: 1 }).withMessage('title requis'),
  body('priority')
    .optional()
    .isIn(PRIORITIES as unknown as string[]),
  body('status')
    .optional()
    .isIn(TASK_STATUSES as unknown as string[]),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const project = await Project.exists({ _id: req.body.project })
      if (!project) return respondError(res, 422, 'INVALID_PROJECT', 'Projet introuvable')
      const createdBy = await getDefaultAdminId(res)
      if (!createdBy) return
      const assignee =
        typeof req.body.assignee === 'string' && isValidObjectId(req.body.assignee) ? req.body.assignee : null
      const task = await Task.create({
        project: req.body.project,
        title: String(req.body.title).trim(),
        description: typeof req.body.description === 'string' ? req.body.description : '',
        status:
          typeof req.body.status === 'string' && (TASK_STATUSES as readonly string[]).includes(req.body.status)
            ? req.body.status
            : 'A_FAIRE',
        priority:
          typeof req.body.priority === 'string' && (PRIORITIES as readonly string[]).includes(req.body.priority)
            ? req.body.priority
            : 'NORMALE',
        assignee,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        estimatedDuration: typeof req.body.estimatedDuration === 'number' ? req.body.estimatedDuration : null,
        progress: typeof req.body.progress === 'number' ? Math.max(0, Math.min(100, req.body.progress)) : 0,
        tags: Array.isArray(req.body.tags) ? req.body.tags.map((t: unknown) => String(t)) : [],
        order: typeof req.body.order === 'number' ? req.body.order : 0,
        createdBy,
      })
      res.locals.audit = {
        entityType: 'Task',
        entityId: String(task._id),
        entityRef: task.title,
        summary: `Création de la tâche "${task.title}"`,
        after: task.toObject(),
      }
      res.status(201).json(task.toObject())
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  '/tasks/:id',
  requireScope('write:tasks'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const task = await Task.findById(req.params.id)
      if (!task) return respondError(res, 404, 'NOT_FOUND', 'Task introuvable')
      const before = task.toObject()

      const stringFields = ['title', 'description']
      for (const f of stringFields) {
        if (typeof req.body[f] === 'string') {
          ;(task as unknown as Record<string, string>)[f] = req.body[f]
        }
      }
      if (typeof req.body.status === 'string' && (TASK_STATUSES as readonly string[]).includes(req.body.status)) {
        task.status = req.body.status as typeof task.status
      }
      if (typeof req.body.priority === 'string' && (PRIORITIES as readonly string[]).includes(req.body.priority)) {
        task.priority = req.body.priority as typeof task.priority
      }
      if (req.body.assignee !== undefined) {
        task.assignee = isValidObjectId(req.body.assignee)
          ? (req.body.assignee as unknown as typeof task.assignee)
          : (null as unknown as typeof task.assignee)
      }
      if (req.body.dueDate !== undefined) {
        task.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null
      }
      if (req.body.startDate !== undefined) {
        task.startDate = req.body.startDate ? new Date(req.body.startDate) : null
      }
      if (typeof req.body.progress === 'number') {
        task.progress = Math.max(0, Math.min(100, req.body.progress))
      }
      if (typeof req.body.estimatedDuration === 'number') {
        task.estimatedDuration = req.body.estimatedDuration
      }
      if (Array.isArray(req.body.tags)) {
        task.tags = req.body.tags.map((t: unknown) => String(t))
      }
      if (typeof req.body.order === 'number') task.order = req.body.order
      if (typeof req.body.isArchived === 'boolean') task.isArchived = req.body.isArchived

      await task.save()
      res.locals.audit = {
        entityType: 'Task',
        entityId: String(task._id),
        entityRef: task.title,
        before,
        after: task.toObject(),
      }
      res.json(task.toObject())
    } catch (err) {
      next(err)
    }
  },
)

router.delete(
  '/tasks/:id',
  requireScope('write:tasks'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const task = await Task.findById(req.params.id)
      if (!task) return respondError(res, 404, 'NOT_FOUND', 'Task introuvable')
      const before = task.toObject()
      await TaskComment.deleteMany({ task: task._id })
      await Task.deleteOne({ _id: task._id })
      res.locals.audit = {
        entityType: 'Task',
        entityId: String(task._id),
        entityRef: task.title,
        before,
      }
      res.json({ ok: true, deletedId: String(task._id) })
    } catch (err) {
      next(err)
    }
  },
)

// ───────────────────────────────────────────────────────────────────────────
// Task comments
// ───────────────────────────────────────────────────────────────────────────

router.get(
  '/tasks/:id/comments',
  requireScope('read:tasks'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const items = await TaskComment.find({ task: req.params.id })
        .sort({ createdAt: 1 })
        .populate('author', 'name email')
        .lean()
      res.json({ items })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/tasks/:id/comments',
  requireScope('write:tasks'),
  param('id').isMongoId(),
  body('content').isString().trim().isLength({ min: 1 }).withMessage('content requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const task = await Task.exists({ _id: req.params.id })
      if (!task) return respondError(res, 404, 'NOT_FOUND', 'Task introuvable')
      const author = await getDefaultAdminId(res)
      if (!author) return
      const mentions = Array.isArray(req.body.mentions)
        ? req.body.mentions.filter((m: unknown) => isValidObjectId(m))
        : []
      const comment = await TaskComment.create({
        task: req.params.id,
        author,
        content: String(req.body.content).trim(),
        mentions,
      })
      res.locals.audit = {
        entityType: 'TaskComment',
        entityId: String(comment._id),
        summary: `Commentaire sur la tâche (${comment.content.slice(0, 60)}…)`,
        after: comment.toObject(),
      }
      res.status(201).json(comment.toObject())
    } catch (err) {
      next(err)
    }
  },
)

router.delete(
  '/tasks/:id/comments/:commentId',
  requireScope('write:tasks'),
  param('id').isMongoId(),
  param('commentId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const comment = await TaskComment.findOne({
        _id: req.params.commentId,
        task: req.params.id,
      })
      if (!comment) return respondError(res, 404, 'NOT_FOUND', 'Commentaire introuvable')
      const before = comment.toObject()
      await TaskComment.deleteOne({ _id: comment._id })
      res.locals.audit = {
        entityType: 'TaskComment',
        entityId: String(comment._id),
        before,
      }
      res.json({ ok: true, deletedId: String(comment._id) })
    } catch (err) {
      next(err)
    }
  },
)

export default router
