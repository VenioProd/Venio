import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin } from '../../../middleware/role.js'
import crudRouter from './crud.js'
import attachmentsRouter from './attachments.js'
import commentsRouter from './comments.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

router.use(crudRouter)
router.use(attachmentsRouter)
router.use(commentsRouter)

export default router
