import express from 'express'
import mongoose from 'mongoose'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import AuditLog from '../../../models/AuditLog.js'

/**
 * Endpoints de consultation des AuditLog.
 * AuditLog est append-only : aucun POST/PATCH/DELETE n'est exposé.
 *
 * Permission : VIEW_ACCOUNTING suffit en lecture (audit log = composant
 * intégral du dossier comptable, doit être consultable par toute personne
 * ayant accès à la compta).
 */

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const MAX_LIMIT = 200

function parseDateParam(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function buildListFilter(query) {
  const filter = {}
  if (query.entityType) filter.entityType = String(query.entityType)
  if (query.entityId && mongoose.isValidObjectId(query.entityId)) {
    filter.entityId = query.entityId
  }
  if (query.action) filter.action = String(query.action)
  if (query.userId && mongoose.isValidObjectId(query.userId)) {
    filter['actor.userId'] = query.userId
  }
  if (query.actorType) {
    filter['actor.type'] = String(query.actorType).toUpperCase()
  }
  if (query.from || query.to) {
    filter.createdAt = {}
    const from = parseDateParam(query.from)
    const to = parseDateParam(query.to)
    if (from) filter.createdAt.$gte = from
    if (to) filter.createdAt.$lte = to
  }
  return filter
}

// ----------------------------------------------------------------------------
// GET /
// Pagination sur AuditLog avec filtres optionnels.
// Query : entityType, entityId, action, from, to, userId, actorType, page, limit
// ----------------------------------------------------------------------------
router.get('/', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (req, res, next) => {
  try {
    const filter = buildListFilter(req.query)
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || 50))
    const skip = (page - 1) * limit

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ])

    res.json({ logs, total, page, limit })
  } catch (err) {
    next(err)
  }
})

// ----------------------------------------------------------------------------
// GET /entity/:entityType/:entityId
// Renvoie tous les logs d'une entité ciblée, triés createdAt desc.
// Pas de pagination — on plafonne à MAX_LIMIT pour éviter les explosions.
// ----------------------------------------------------------------------------
router.get(
  '/entity/:entityType/:entityId',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req, res, next) => {
    try {
      const { entityType, entityId } = req.params
      if (!entityType) {
        return res.status(400).json({ error: 'entityType requis' })
      }
      if (!mongoose.isValidObjectId(entityId)) {
        return res.status(400).json({ error: 'entityId invalide' })
      }
      const logs = await AuditLog.find({ entityType, entityId })
        .sort({ createdAt: -1 })
        .limit(MAX_LIMIT)
        .lean()
      res.json({ logs, total: logs.length, limit: MAX_LIMIT })
    } catch (err) {
      next(err)
    }
  }
)

export default router
