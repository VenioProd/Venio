import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { administersCrm } from '../../lib/crmScope.js'
import { listReports, readReport } from '../../lib/callScriptReport/read.js'

/**
 * Rapports de scripts de l'équipe. Chacun lit les siens ; un administrateur du
 * CRM lit ceux de toute l'équipe. Jamais ceux d'un commercial externe.
 */
const router = express.Router()
router.use(auth)
router.use(requireAdmin)
router.use(requirePermission(PERMISSIONS.VIEW_CRM))

function teamFilter(req: Request): Record<string, unknown> {
  const filter: Record<string, unknown> = { authorKind: 'team' }
  if (!administersCrm(req)) filter.author = req.user!.id
  else if (typeof req.query.author === 'string' && mongoose.isObjectIdOrHexString(req.query.author))
    filter.author = req.query.author
  return filter
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    return res.json({ reports: await listReports(teamFilter(req), req.user!.id), canSeeTeam: administersCrm(req) })
  } catch (err) {
    return next(err)
  }
})

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter = administersCrm(req) ? { authorKind: 'team' } : { authorKind: 'team', author: req.user!.id }
    const report = await readReport(filter, req.params.id, req.user!.id)
    if (!report) return res.status(404).json({ error: 'Rapport introuvable' })
    return res.json({ report })
  } catch (err) {
    return next(err)
  }
})

export default router
