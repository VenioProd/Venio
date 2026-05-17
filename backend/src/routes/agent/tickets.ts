import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { body, param, validationResult } from 'express-validator'
import InternalTicket from '../../models/InternalTicket.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour les InternalTicket (tickets internes : question/demande/
 * problème entre admins).
 *
 * Périmètre V1 : pas d'attachments (lot 5 / /documents). Les replies sont
 * en plain text uniquement.
 *
 * Scopes : read:tickets / write:tickets.
 */

const router = express.Router()

const CATEGORIES = ['QUESTION', 'DEMANDE', 'PROBLEME'] as const
const PRIORITIES = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'] as const
const STATUSES = ['OUVERT', 'EN_COURS', 'RESOLU', 'FERME'] as const

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

router.get('/tickets', requireScope('read:tickets'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    if (typeof req.query.category === 'string' && (CATEGORIES as readonly string[]).includes(req.query.category)) {
      filter.category = req.query.category
    }
    if (typeof req.query.priority === 'string' && (PRIORITIES as readonly string[]).includes(req.query.priority)) {
      filter.priority = req.query.priority
    }
    if (typeof req.query.status === 'string' && (STATUSES as readonly string[]).includes(req.query.status)) {
      filter.status = req.query.status
    }
    if (typeof req.query.authorId === 'string' && isValidObjectId(req.query.authorId)) {
      filter.authorId = req.query.authorId
    }
    if (req.query.archived === 'true') {
      filter.isArchived = true
    } else if (req.query.archived === 'false' || req.query.archived === undefined) {
      filter.$or = [{ isArchived: false }, { isArchived: { $exists: false } }]
    }
    const [items, total] = await Promise.all([
      InternalTicket.find(filter)
        .sort({ createdAt: -1 })
        .skip(pag.skip)
        .limit(pag.limit)
        .lean(),
      InternalTicket.countDocuments(filter),
    ])
    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get(
  '/tickets/:id',
  requireScope('read:tickets'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const t = await InternalTicket.findById(req.params.id).lean()
      if (!t) return respondError(res, 404, 'NOT_FOUND', 'Ticket introuvable')
      res.json(t)
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/tickets',
  requireScope('write:tickets'),
  body('title').isString().trim().isLength({ min: 1 }).withMessage('title requis'),
  body('message').isString().trim().isLength({ min: 1 }).withMessage('message requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id name email').lean()
      if (!admin) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour authorId')
      const ticket = await InternalTicket.create({
        title: String(req.body.title).trim(),
        message: String(req.body.message).trim(),
        category:
          typeof req.body.category === 'string' && (CATEGORIES as readonly string[]).includes(req.body.category)
            ? req.body.category
            : 'QUESTION',
        priority:
          typeof req.body.priority === 'string' && (PRIORITIES as readonly string[]).includes(req.body.priority)
            ? req.body.priority
            : 'NORMALE',
        status: 'OUVERT',
        authorId: admin._id,
        authorName: admin.name || admin.email || 'Agent',
      })
      res.locals.audit = {
        entityType: 'InternalTicket',
        entityId: String(ticket._id),
        entityRef: ticket.title,
        summary: `Création ticket "${ticket.title}"`,
        after: ticket.toObject(),
      }
      res.status(201).json(ticket.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/tickets/:id',
  requireScope('write:tickets'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const ticket = await InternalTicket.findById(req.params.id)
      if (!ticket) return respondError(res, 404, 'NOT_FOUND', 'Ticket introuvable')
      const before = ticket.toObject()
      const stringFields = ['title', 'message']
      for (const f of stringFields) {
        if (typeof req.body[f] === 'string') {
          ;(ticket as unknown as Record<string, string>)[f] = req.body[f]
        }
      }
      if (typeof req.body.category === 'string' && (CATEGORIES as readonly string[]).includes(req.body.category)) {
        ticket.category = req.body.category as typeof ticket.category
      }
      if (typeof req.body.priority === 'string' && (PRIORITIES as readonly string[]).includes(req.body.priority)) {
        ticket.priority = req.body.priority as typeof ticket.priority
      }
      if (typeof req.body.status === 'string' && (STATUSES as readonly string[]).includes(req.body.status)) {
        const newStatus = req.body.status as typeof ticket.status
        ticket.status = newStatus
        // Archivage automatique sur FERME (mais pas l'inverse — un ticket
        // archivé peut être réouvert via PATCH { isArchived: false } séparé)
        if (newStatus === 'FERME' && !ticket.isArchived) {
          ticket.isArchived = true
          ticket.archivedAt = new Date()
        }
      }
      if (typeof req.body.isArchived === 'boolean') {
        ticket.isArchived = req.body.isArchived
        ticket.archivedAt = req.body.isArchived ? new Date() : null
      }
      await ticket.save()
      res.locals.audit = {
        entityType: 'InternalTicket',
        entityId: String(ticket._id),
        entityRef: ticket.title,
        before,
        after: ticket.toObject(),
      }
      res.json(ticket.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/tickets/:id/replies',
  requireScope('write:tickets'),
  param('id').isMongoId(),
  body('message').isString().trim().isLength({ min: 1 }).withMessage('message requis'),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const ticket = await InternalTicket.findById(req.params.id)
      if (!ticket) return respondError(res, 404, 'NOT_FOUND', 'Ticket introuvable')
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id name email').lean()
      if (!admin) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour authorId')
      ticket.replies.push({
        authorId: admin._id as unknown as mongoose.Types.ObjectId,
        authorName: admin.name || admin.email || 'Agent',
        message: String(req.body.message).trim(),
        attachments: [],
      } as unknown as (typeof ticket.replies)[number])
      await ticket.save()
      const added = ticket.replies[ticket.replies.length - 1]
      res.locals.audit = {
        entityType: 'InternalTicket',
        entityId: String(ticket._id),
        entityRef: ticket.title,
        summary: `Réponse ajoutée au ticket "${ticket.title}"`,
        after: { replyId: added?._id, message: added?.message },
      }
      res.status(201).json({ ticket: ticket.toObject() })
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/tickets/:id',
  requireScope('write:tickets'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const ticket = await InternalTicket.findById(req.params.id)
      if (!ticket) return respondError(res, 404, 'NOT_FOUND', 'Ticket introuvable')
      const before = ticket.toObject()
      await InternalTicket.deleteOne({ _id: ticket._id })
      res.locals.audit = {
        entityType: 'InternalTicket',
        entityId: String(ticket._id),
        entityRef: ticket.title,
        before,
      }
      res.json({ ok: true, deletedId: String(ticket._id) })
    } catch (err) {
      next(err)
    }
  }
)

export default router
