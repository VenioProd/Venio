import express, { type Request, type Response, type NextFunction } from 'express'
import {
  EducationClass,
  EducationStudent,
  EducationSession,
  EducationAssignment,
  EducationSubmission,
  EducationActivityLog,
} from '../../../models/education/index.js'
import { ownerFilter } from './helpers.js'

const router = express.Router()

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekEnd = new Date(todayStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const [
      activeClasses,
      totalStudents,
      todaySessions,
      weekSessions,
      openAssignments,
      lateSubmissions,
      toGrade,
      recentActivity,
    ] = await Promise.all([
      EducationClass.countDocuments({ ...ownerFilter(req), status: 'ACTIVE' }),
      EducationStudent.countDocuments({ ...ownerFilter(req), status: 'ACTIVE' }),
      EducationSession.find({
        ...ownerFilter(req),
        date: { $gte: todayStart, $lt: new Date(todayStart.getTime() + 86400000) },
      }).populate('classId', 'name color').sort({ date: 1 }),
      EducationSession.find({
        ...ownerFilter(req),
        date: { $gte: todayStart, $lt: weekEnd },
      }).populate('classId', 'name color').sort({ date: 1 }).limit(20),
      EducationAssignment.find({
        ...ownerFilter(req),
        status: { $in: ['OUVERT', 'EN_CORRECTION'] },
      }).populate('classId', 'name color').sort({ deadline: 1 }).limit(20),
      EducationSubmission.countDocuments({
        ...ownerFilter(req),
        $or: [{ status: 'EN_RETARD' }, { isLate: true, status: { $ne: 'CORRIGE' } }],
      }),
      EducationSubmission.countDocuments({
        ...ownerFilter(req),
        status: { $in: ['RENDU', 'EN_RETARD', 'EN_CORRECTION'] },
        grade: null,
      }),
      EducationActivityLog.find({ ...ownerFilter(req) }).sort({ createdAt: -1 }).limit(20),
    ])

    res.json({
      counters: {
        activeClasses,
        totalStudents,
        todaySessions: todaySessions.length,
        weekSessions: weekSessions.length,
        openAssignments: openAssignments.length,
        lateSubmissions,
        toGrade,
      },
      today: todaySessions,
      week: weekSessions,
      openAssignments,
      activity: recentActivity,
    })
  } catch (err) { next(err) }
})

export default router
