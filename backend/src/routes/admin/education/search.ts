import express, { type Request, type Response, type NextFunction } from 'express'
import {
  EducationClass,
  EducationStudent,
  EducationSession,
  EducationAssignment,
  EducationNote,
  EducationDocument,
} from '../../../models/education/index.js'
import { ownerFilter } from './helpers.js'

const router = express.Router()

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q || '').trim()
    if (!q) return res.json({ results: { classes: [], students: [], sessions: [], assignments: [], notes: [], documents: [] } })

    const filter = { ...ownerFilter(req), $text: { $search: q } }
    const limit = 8

    const [classes, students, sessions, assignments, notes, documents] = await Promise.all([
      EducationClass.find(filter).limit(limit),
      EducationStudent.find(filter).limit(limit).populate('classId', 'name color'),
      EducationSession.find(filter).limit(limit).populate('classId', 'name color'),
      EducationAssignment.find(filter).limit(limit).populate('classId', 'name color'),
      EducationNote.find(filter).limit(limit),
      EducationDocument.find(filter).limit(limit),
    ])

    res.json({ results: { classes, students, sessions, assignments, notes, documents } })
  } catch (err) { next(err) }
})

export default router
