import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin } from '../../../middleware/role.js'
import crudRouter from './crud.js'
import contactsRouter from './contacts.js'
import notesRouter from './notes.js'
import projectsRouter from './projects.js'
import billingRouter from './billing.js'
import filesRouter from './files.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

router.use(crudRouter)
router.use(contactsRouter)
router.use(notesRouter)
router.use(projectsRouter)
router.use(billingRouter)
router.use(filesRouter)

export default router
