/**
 * Router parent pour `/api/admin/projects`.
 *
 * Consolide les sous-routers qui exposent des routes sous le même préfixe
 * (avant ce refactor, ils étaient montés 5× dans backend/src/index.ts).
 * Chaque sous-router conserve ses middlewares auth + requireAdmin :
 * Express les empile sans effet de bord.
 */
import express from 'express'
import coreRouter from './core.js'
import sectionsRouter from './sections.js'
import itemsRouter from './items.js'
import clientFilesRouter from './clientFiles.js'
import tasksRouter from '../tasks/index.js'
import messagesRouter from '../messages.js'

const router = express.Router()

router.use(coreRouter)
router.use(sectionsRouter)
router.use(itemsRouter)
router.use(clientFilesRouter)
router.use(tasksRouter)
router.use(messagesRouter)

export default router
