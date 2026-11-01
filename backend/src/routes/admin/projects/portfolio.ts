import express, { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { accessibleProjectIds, readableProjectIds } from '../../../lib/adminProjectAccess.js'
import { buildPortfolioOverview } from '../../../lib/projectPortfolio.js'
import { applyBulk, parseBulkRequest } from '../../../lib/projectBulk.js'
import { sanitizeViewFilters, sanitizeViewName } from '../../../lib/projectViews.js'
import { sensitiveAction } from '../../../lib/security/sensitiveActions.js'
import ProjectView from '../../../models/ProjectView.js'

/**
 * Page Projets (onglet Clients) : vue d'ensemble, actions groupées et vues
 * sauvegardées. Monté avant le router `core` : `/overview`, `/bulk` et
 * `/views` ne doivent pas être pris pour un `/:id`.
 */
const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const requireDeleteConfirmation = (req: Request, res: Response, next: NextFunction) =>
  req.body?.action === 'delete' ? sensitiveAction('PROJECT_DELETE')(req, res, next) : next()

router.get('/overview', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req, res, next) => {
  try {
    const ids = await (req.user!.role === 'COMMERCIAL' ? readableProjectIds(req.user!) : accessibleProjectIds(req.user!))
    res.json(await buildPortfolioOverview(ids))
  } catch (err) {
    next(err)
  }
})

router.post('/bulk', requirePermission(PERMISSIONS.EDIT_PROJECTS), requireDeleteConfirmation, async (req, res, next) => {
  try {
    const parsed = parseBulkRequest(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })
    const results = await applyBulk(parsed.request, await accessibleProjectIds(req.user!))
    return res.json({
      results,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    })
  } catch (err) {
    return next(err)
  }
})

router.get('/views', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req, res, next) => {
  try {
    const views = await ProjectView.find({ $or: [{ owner: req.user!.id }, { shared: true }] })
      .sort({ createdAt: 1 })
      .lean()
    res.json({ views: views.map((v) => ({ ...v, mine: String(v.owner) === req.user!.id })) })
  } catch (err) {
    next(err)
  }
})

router.post('/views', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req, res, next) => {
  try {
    const name = sanitizeViewName(req.body?.name)
    if (!name) return res.status(400).json({ error: 'Nom de vue requis (60 caractères max)' })
    const view = await ProjectView.create({
      owner: req.user!.id,
      name,
      shared: req.body?.shared === true,
      filters: sanitizeViewFilters(req.body?.filters),
    })
    return res.status(201).json({ view })
  } catch (err) {
    return next(err)
  }
})

router.patch('/views/:id', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Vue introuvable' })
    const set: Record<string, unknown> = {}
    if (req.body?.name !== undefined) {
      const name = sanitizeViewName(req.body.name)
      if (!name) return res.status(400).json({ error: 'Nom de vue invalide' })
      set.name = name
    }
    if (req.body?.shared !== undefined) set.shared = req.body.shared === true
    if (req.body?.filters !== undefined) set.filters = sanitizeViewFilters(req.body.filters)
    const view = await ProjectView.findOneAndUpdate({ _id: req.params.id, owner: req.user!.id }, set, { new: true })
    if (!view) return res.status(404).json({ error: 'Vue introuvable' })
    return res.json({ view })
  } catch (err) {
    return next(err)
  }
})

router.delete('/views/:id', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Vue introuvable' })
    const view = await ProjectView.findOneAndDelete({ _id: req.params.id, owner: req.user!.id })
    if (!view) return res.status(404).json({ error: 'Vue introuvable' })
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

export default router
