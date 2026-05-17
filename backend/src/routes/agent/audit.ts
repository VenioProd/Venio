import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { param, validationResult } from 'express-validator'
import AuditLog from '../../models/AuditLog.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour AuditLog — LECTURE SEULE par nature.
 *
 * Scope : read:audit. Aucune route d'écriture exposée.
 *
 * Filtres :
 *   - action : un code AuditAction (ex 'AGENT_API_MUTATION')
 *   - userId : ObjectId
 *   - actorType : USER / SYSTEM / EXTERNAL / AGENT (via metadata.actorType)
 *   - agentTokenId : (via metadata.agentTokenId)
 *   - from / to : plage de createdAt
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

router.get('/audit/log', requireScope('read:audit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    if (typeof req.query.action === 'string') filter.action = req.query.action
    if (typeof req.query.userId === 'string' && isValidObjectId(req.query.userId)) {
      filter.userId = req.query.userId
    }
    if (typeof req.query.actorType === 'string') {
      filter['metadata.actorType'] = req.query.actorType
    }
    if (typeof req.query.agentTokenId === 'string') {
      filter['metadata.agentTokenId'] = req.query.agentTokenId
    }
    if (typeof req.query.entityType === 'string') {
      filter['metadata.entityType'] = req.query.entityType
    }
    if (typeof req.query.from === 'string' || typeof req.query.to === 'string') {
      const range: Record<string, Date> = {}
      if (typeof req.query.from === 'string' && !Number.isNaN(Date.parse(req.query.from))) {
        range.$gte = new Date(req.query.from)
      }
      if (typeof req.query.to === 'string' && !Number.isNaN(Date.parse(req.query.to))) {
        range.$lte = new Date(req.query.to)
      }
      if (Object.keys(range).length > 0) filter.createdAt = range
    }
    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(pag.skip).limit(pag.limit).lean(),
      AuditLog.countDocuments(filter),
    ])
    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get(
  '/audit/log/:id',
  requireScope('read:audit'),
  param('id').isMongoId(),
  async (req, res, next) => {
    if (emit(req, res)) return
    try {
      const log = await AuditLog.findById(req.params.id).lean()
      if (!log) return respondError(res, 404, 'NOT_FOUND', 'Entrée audit introuvable')
      res.json(log)
    } catch (err) {
      next(err)
    }
  }
)

export default router
