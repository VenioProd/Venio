import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin } from '../../../middleware/role.js'
import projectsRouter from './projects.js'
import issuesRouter from './issues.js'
import statsRouter from './stats.js'
import roadmapRouter from './roadmap.js'
import agentRunsRouter from './agentRuns.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

router.use(projectsRouter)
router.use(issuesRouter)
router.use(statsRouter)
router.use(roadmapRouter)
router.use(agentRunsRouter)

export default router
