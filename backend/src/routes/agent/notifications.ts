import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { body, param, validationResult } from 'express-validator'
import Notification from '../../models/Notification.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour les Notifications utilisateur.
 *
 * Scopes : read:notifications / write:notifications.
 *
 * V1 :
 *   - GET /notifications?recipient=&unreadOnly=true
 *   - POST /notifications (cible un user spécifique)
 *   - PATCH /notifications/:id { isRead }
 *   - POST /notifications/mark-all-read { recipient }
 *   - DELETE /notifications/:id
 */

const router = express.Router()

const NOTIFICATION_TYPES = [
  'TASK_ASSIGNED',
  'TASK_UPDATED',
  'PROJECT_UPDATE',
  'DOCUMENT_ADDED',
  'TICKET_CREATED',
  'TICKET_REPLY',
] as const

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
  '/notifications',
  requireScope('read:notifications'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pag = parsePagination(req)
      const filter: Record<string, unknown> = {}
      if (typeof req.query.recipient === 'string' && isValidObjectId(req.query.recipient)) {
        filter.recipient = req.query.recipient
      }
      if (typeof req.query.type === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(req.query.type)) {
        filter.type = req.query.type
      }
      if (req.query.unreadOnly === 'true') filter.isRead = false

      const [items, total] = await Promise.all([
        Notification.find(filter)
          .sort({ createdAt: -1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .populate('recipient', 'name email')
          .lean(),
        Notification.countDocuments(filter),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/notifications',
  requireScope('write:notifications'),
  body('recipient').custom((v) => isValidObjectId(v)).withMessage('recipient requis'),
  body('type').isIn(NOTIFICATION_TYPES as unknown as string[]).withMessage('type requis'),
  body('title').isString().trim().isLength({ min: 1 }).withMessage('title requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await User.exists({ _id: req.body.recipient })
      if (!user) return respondError(res, 422, 'INVALID_RECIPIENT', 'Recipient introuvable')
      const notif = await Notification.create({
        recipient: req.body.recipient,
        type: req.body.type,
        title: String(req.body.title).trim(),
        message: typeof req.body.message === 'string' ? req.body.message : '',
        link: typeof req.body.link === 'string' ? req.body.link : '',
        metadata: req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {},
        isRead: false,
      })
      res.locals.audit = {
        entityType: 'Notification',
        entityId: String(notif._id),
        summary: `Notif ${notif.type} → ${req.body.recipient} (${notif.title})`,
        after: notif.toObject(),
      }
      res.status(201).json(notif.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/notifications/:id',
  requireScope('write:notifications'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const notif = await Notification.findById(req.params.id)
      if (!notif) return respondError(res, 404, 'NOT_FOUND', 'Notification introuvable')
      const before = notif.toObject()
      if (typeof req.body.isRead === 'boolean') notif.isRead = req.body.isRead
      if (typeof req.body.title === 'string') notif.title = req.body.title
      if (typeof req.body.message === 'string') notif.message = req.body.message
      if (typeof req.body.link === 'string') notif.link = req.body.link
      await notif.save()
      res.locals.audit = {
        entityType: 'Notification',
        entityId: String(notif._id),
        before,
        after: notif.toObject(),
      }
      res.json(notif.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/notifications/mark-all-read',
  requireScope('write:notifications'),
  body('recipient').custom((v) => isValidObjectId(v)).withMessage('recipient requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const result = await Notification.updateMany(
        { recipient: req.body.recipient, isRead: false },
        { $set: { isRead: true } }
      )
      res.locals.audit = {
        entityType: 'Notification',
        summary: `mark-all-read → ${req.body.recipient} (${result.modifiedCount} notifs)`,
        after: { modifiedCount: result.modifiedCount, recipient: req.body.recipient },
      }
      res.json({ ok: true, modifiedCount: result.modifiedCount })
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/notifications/:id',
  requireScope('write:notifications'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const notif = await Notification.findById(req.params.id)
      if (!notif) return respondError(res, 404, 'NOT_FOUND', 'Notification introuvable')
      const before = notif.toObject()
      await Notification.deleteOne({ _id: notif._id })
      res.locals.audit = {
        entityType: 'Notification',
        entityId: String(notif._id),
        before,
      }
      res.json({ ok: true, deletedId: String(notif._id) })
    } catch (err) {
      next(err)
    }
  }
)

export default router
