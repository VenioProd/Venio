import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireSuperAdmin } from '../../../middleware/role.js'

import classes from './classes.js'
import students from './students.js'
import sessions from './sessions.js'
import assignments from './assignments.js'
import notes from './notes.js'
import documents from './documents.js'
import templates from './templates.js'
import dashboard from './dashboard.js'
import search from './search.js'
import calendar from './calendar.js'
import ai from './ai.js'

const router = express.Router()

router.use(auth)
router.use(requireSuperAdmin)

router.use('/dashboard', dashboard)
router.use('/search', search)
router.use('/calendar', calendar)
router.use('/classes', classes)
router.use('/students', students)
router.use('/sessions', sessions)
router.use('/assignments', assignments)
router.use('/notes', notes)
router.use('/documents', documents)
router.use('/templates', templates)
router.use('/ai', ai)

export default router
