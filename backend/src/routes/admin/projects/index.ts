/**
 * Router parent pour `/api/admin/projects`.
 *
 * Consolide les sous-routers qui exposent des routes sous le même préfixe
 * (avant ce refactor, ils étaient montés 5× dans backend/src/index.ts).
 * Chaque sous-router conserve ses middlewares auth + requireAdmin :
 * Express les empile sans effet de bord.
 */
import express from 'express'
import mongoose from 'mongoose'
import auth from '../../../middleware/auth.js'
import { requireAdmin } from '../../../middleware/role.js'
import { canReadProject } from '../../../lib/adminProjectAccess.js'
import coreRouter from './core.js'
import sectionsRouter from './sections.js'
import phasesRouter from './phases.js'
import itemsRouter from './items.js'
import clientFilesRouter from './clientFiles.js'
import tasksRouter from '../tasks/index.js'
import messagesRouter from '../messages.js'

const router = express.Router()

router.use(auth, requireAdmin)
router.use(async (req, res, next) => {
  try {
    const projectId = decodeURIComponent(req.path.split('/')[1] ?? '')
    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      mongoose.isObjectIdOrHexString(projectId) &&
      !(await canReadProject(req.user!, projectId))
    ) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }
    next()
  } catch (err) {
    next(err)
  }
})

router.use(coreRouter)
router.use(sectionsRouter)
router.use(phasesRouter)
router.use(itemsRouter)
router.use(clientFilesRouter)
router.use(tasksRouter)
router.use(messagesRouter)

export default router
