import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin } from '../../../middleware/role.js'
import campaignsRouter from './campaigns.js'
import scenariosRouter from './scenarios.js'
import testersRouter from './testers.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

router.use(campaignsRouter)
router.use(scenariosRouter)
router.use(testersRouter)

export default router
