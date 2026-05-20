import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requireAnyPermission, requirePermission } from '../../../middleware/role.js'

import classes from './classes.js'
import students from './students.js'
import sessions from './sessions.js'
import assignments from './assignments.js'
import notes from './notes.js'
import documents from './documents.js'
import templates from './templates.js'
import dashboard from './dashboard.js'
import search from './search.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)
// Lecture : view_education OU manage_education.
router.use(requireAnyPermission(['view_education', 'manage_education']))

// Écriture : toute méthode non-GET doit avoir manage_education.
// On laisse passer les GET (lecture seule), les autres méthodes traversent
// requirePermission('manage_education') qui répond 403 si l'utilisateur
// n'a que view_education.
const requireWrite = requirePermission('manage_education')
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next()
    return
  }
  requireWrite(req, res, next)
})

router.use('/dashboard', dashboard)
router.use('/search', search)
router.use('/classes', classes)
router.use('/students', students)
router.use('/sessions', sessions)
router.use('/assignments', assignments)
router.use('/notes', notes)
router.use('/documents', documents)
router.use('/templates', templates)

export default router
