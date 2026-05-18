import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin } from '../../../middleware/role.js'
import projectsRouter from './projects.js'
import issuesRouter from './issues.js'
import statsRouter from './stats.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

router.use(projectsRouter)
router.use(issuesRouter)
router.use(statsRouter)

export default router
