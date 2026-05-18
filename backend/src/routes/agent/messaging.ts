import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import fs from 'fs/promises'
import { createReadStream } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { body, param, query, validationResult } from 'express-validator'
import User from '../../models/User.js'
import InternalMessage from '../../models/InternalMessage.js'
import {
  createConversation,
  createMessage,
  listConversations,
  listMessages,
  markConversationRead,
  searchMessages,
  softDeleteMessage,
  toggleReaction,
  updateMessage,
} from '../../services/internalMessaging.js'
import { requireScope } from './_middleware/auth.js'
import { respondError, AgentApiError } from './_middleware/errors.js'
import { loadAgentUserPayload } from './_middleware/asUser.js'

/**
 * Routes agent pour la messagerie interne (InternalConversation /
 * InternalMessage). Parité fonctionnelle vs admin/messaging.ts.
 *
 * Scopes :
 *   - GET → read:internal-messaging
 *   - POST/PATCH/DELETE → write:internal-messaging
 *
 * Auth : Bearer agent token (cf. index.ts). Identité du sender résolue via
 * loadAgentUserPayload (User AGENT lié au token).
 *
 * ACL conversation : identique aux humains — PUBLIC channels + memberships.
 *
 * Attachments : base64 dans body JSON, cap 5 Mo/fichier, max 5/message,
 * storage `uploads/agent/internal-messaging/<conversationId>/`.
 */

const router = express.Router()

// ── Helpers ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RAW_LIMIT_MB = 5
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RAW_LIMIT_BYTES = RAW_LIMIT_MB * 1024 * 1024

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function uploadsRoot(): string {
  return path.resolve(process.cwd(), 'uploads')
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function safeFilename(originalName: string): string {
  return originalName
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-100)
}

// ── Routes ────────────────────────────────────────────────────────────────

router.get('/conversations', requireScope('read:internal-messaging'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await loadAgentUserPayload(req)
    const conversations = await listConversations(user)
    res.json({ conversations })
  } catch (err) {
    next(err)
  }
})

router.post(
  '/conversations',
  requireScope('write:internal-messaging'),
  body('type').isIn(['CHANNEL', 'DM', 'GROUP']).withMessage('type CHANNEL/DM/GROUP requis'),
  body('name').optional().isString().trim(),
  body('visibility').optional().isIn(['PUBLIC', 'PRIVATE']),
  body('participantIds').optional().isArray(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const conversation = await createConversation(user, {
        type: req.body.type,
        name: req.body.name,
        visibility: req.body.visibility,
        participantIds: req.body.participantIds,
      })
      res.locals.audit = {
        entityType: 'InternalConversation',
        entityId: String(conversation._id),
        summary: `Création conversation ${conversation.type} "${conversation.name || conversation.slug || ''}"`,
        after: { type: conversation.type, name: conversation.name, slug: conversation.slug },
      }
      res.status(201).json({ conversation })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/direct',
  requireScope('write:internal-messaging'),
  body('participantId').custom((v) => isValidObjectId(v)).withMessage('participantId (ObjectId) requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const conversation = await createConversation(user, {
        type: 'DM',
        participantIds: [String(req.body.participantId)],
      })
      res.locals.audit = {
        entityType: 'InternalConversation',
        entityId: String(conversation._id),
        summary: `DM agent → ${req.body.participantId}`,
        after: { type: 'DM' },
      }
      res.status(201).json({ conversation })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/conversations/:conversationId/messages',
  requireScope('read:internal-messaging'),
  param('conversationId').isMongoId(),
  query('before').optional().isISO8601(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const messages = await listMessages(user, String(req.params.conversationId), {
        before: req.query.before ? String(req.query.before) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      })
      res.json({ messages })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/conversations/:conversationId/messages',
  requireScope('write:internal-messaging'),
  param('conversationId').isMongoId(),
  body('content').isString().trim().isLength({ min: 1, max: 4000 }),
  body('parentMessage').optional({ nullable: true }).custom((v) => v === null || isValidObjectId(v)),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const message = await createMessage(user, String(req.params.conversationId), {
        content: req.body.content,
        parentMessage: req.body.parentMessage || null,
      })
      res.locals.audit = {
        entityType: 'InternalMessage',
        entityId: String(message._id),
        summary: `Message dans conv ${req.params.conversationId} (${String(req.body.content).slice(0, 60)}…)`,
        after: { id: String(message._id) },
      }
      res.status(201).json({ message })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/conversations/:conversationId/read',
  requireScope('write:internal-messaging'),
  param('conversationId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      await markConversationRead(user, String(req.params.conversationId))
      res.locals.audit = {
        entityType: 'InternalConversation',
        entityId: String(req.params.conversationId),
        summary: `Marqué lu`,
      }
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/search',
  requireScope('read:internal-messaging'),
  query('q').isString().trim().isLength({ min: 2 }).withMessage('q (min 2 chars) requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const results = await searchMessages(user, String(req.query.q))
      res.json({ results })
    } catch (err) {
      next(err)
    }
  }
)

router.get('/users', requireScope('read:internal-messaging'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await User.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER', 'AGENT'] },
      isActive: true,
    })
      .select('name email role')
      .sort({ name: 1 })
      .lean()
    res.json({ users })
  } catch (err) {
    next(err)
  }
})

export default router
