import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { body, param, validationResult } from 'express-validator'
import Message from '../../models/Message.js'
import Project from '../../models/Project.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour les Messages (fils de discussion par projet entre admin
 * et client).
 *
 * Scopes : read:messages / write:messages.
 *
 * Note : il n'y a pas de "channel" en V1 — un projet a un thread unique.
 * Les readBy peuvent être marqués via PATCH /:projectId/messages/:id/read.
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

router.get(
  '/projects/:id/messages',
  requireScope('read:messages'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const pag = parsePagination(req)
      const filter = { project: req.params.id }
      const [items, total] = await Promise.all([
        Message.find(filter)
          .sort({ createdAt: -1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .populate('sender', 'name email role')
          .lean(),
        Message.countDocuments(filter),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/projects/:id/messages',
  requireScope('write:messages'),
  param('id').isMongoId(),
  body('content').isString().trim().isLength({ min: 1 }).withMessage('content requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const project = await Project.exists({ _id: req.params.id })
      if (!project) return respondError(res, 404, 'NOT_FOUND', 'Projet introuvable')
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      if (!admin) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour sender')

      // sender override : on autorise un admin spécifique si l'agent le
      // précise et qu'il existe (utile pour Kuro qui agit "pour" un admin).
      let sender = admin._id as unknown as mongoose.Types.ObjectId
      if (typeof req.body.sender === 'string' && isValidObjectId(req.body.sender)) {
        const exists = await User.exists({ _id: req.body.sender })
        if (!exists) return respondError(res, 422, 'INVALID_SENDER', 'Sender introuvable')
        sender = new mongoose.Types.ObjectId(req.body.sender)
      }

      const message = await Message.create({
        project: req.params.id,
        sender,
        content: String(req.body.content).trim(),
        readBy: [sender],
      })
      res.locals.audit = {
        entityType: 'Message',
        entityId: String(message._id),
        summary: `Message dans projet (${message.content.slice(0, 60)}…)`,
        after: message.toObject(),
      }
      res.status(201).json(message.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/projects/:id/messages/:messageId/read',
  requireScope('write:messages'),
  param('id').isMongoId(),
  param('messageId').isMongoId(),
  body('userId').custom((v) => isValidObjectId(v)).withMessage('userId requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const message = await Message.findOne({
        _id: req.params.messageId,
        project: req.params.id,
      })
      if (!message) return respondError(res, 404, 'NOT_FOUND', 'Message introuvable')
      const userId = req.body.userId as string
      const exists = await User.exists({ _id: userId })
      if (!exists) return respondError(res, 422, 'INVALID_USER', 'User introuvable')
      const userObjId = new mongoose.Types.ObjectId(userId)
      const already = message.readBy.some((u) => String(u) === userId)
      if (!already) {
        message.readBy.push(userObjId)
        await message.save()
      }
      res.locals.audit = {
        entityType: 'Message',
        entityId: String(message._id),
        summary: `Message marqué lu par ${userId}`,
        after: { readBy: message.readBy },
      }
      res.json(message.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/projects/:id/messages/:messageId',
  requireScope('write:messages'),
  param('id').isMongoId(),
  param('messageId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const message = await Message.findOne({
        _id: req.params.messageId,
        project: req.params.id,
      })
      if (!message) return respondError(res, 404, 'NOT_FOUND', 'Message introuvable')
      const before = message.toObject()
      await Message.deleteOne({ _id: message._id })
      res.locals.audit = {
        entityType: 'Message',
        entityId: String(message._id),
        before,
      }
      res.json({ ok: true, deletedId: String(message._id) })
    } catch (err) {
      next(err)
    }
  }
)

export default router
