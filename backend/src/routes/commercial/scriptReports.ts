import express, { type NextFunction, type Request, type Response } from 'express'
import { listReports, readReport } from '../../lib/callScriptReport/read.js'

/** Rapports de scripts du commercial externe : les siens seulement (le routeur parent exige le rôle). */
const router = express.Router()

router.get('/script-reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = req.user!.id
    return res.json({ reports: await listReports({ author: me, authorKind: 'rep' }, me) })
  } catch (err) {
    return next(err)
  }
})

router.get('/script-reports/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = req.user!.id
    const report = await readReport({ author: me, authorKind: 'rep' }, req.params.id, me)
    if (!report) return res.status(404).json({ error: 'Rapport introuvable' })
    return res.json({ report })
  } catch (err) {
    return next(err)
  }
})

export default router
