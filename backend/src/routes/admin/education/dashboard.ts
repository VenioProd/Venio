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
    const todayEnd = new Date(todayStart.getTime() + 86400000)
    const weekEnd = new Date(todayStart)
    weekEnd.setDate(weekEnd.getDate() + 7)
    // "À préparer" = séance planifiée dans les 72h, statut PLANIFIEE, sans recap.
    const prepHorizon = new Date(now.getTime() + 72 * 3600 * 1000)
    // Filtre école optionnel (cockpit multi-écoles).
    const schoolFilter = typeof req.query.school === 'string' && req.query.school.trim()
      ? String(req.query.school).trim()
      : null

    const classFilter: Record<string, unknown> = { ...ownerFilter(req) }
    if (schoolFilter) classFilter.school = schoolFilter

    // Si filtre école : restreindre les ids de classes.
    let classIds: string[] | null = null
    if (schoolFilter) {
      const ids = await EducationClass.find(classFilter).select('_id')
      classIds = ids.map((c) => String(c._id))
    }
    const sessionAssignFilter = classIds
      ? { ...ownerFilter(req), classId: { $in: classIds } }
      : { ...ownerFilter(req) }

    const [
      activeClasses,
      totalStudents,
      todaySessions,
      weekSessions,
      toPrepareSessions,
      openAssignments,
      lateSubmissions,
      toGrade,
      toCorrectAssignments,
      activeClassDocs,
      recentActivity,
      schools,
    ] = await Promise.all([
      EducationClass.countDocuments({ ...classFilter, status: 'ACTIVE' }),
      EducationStudent.countDocuments({
        ...ownerFilter(req),
        status: 'ACTIVE',
        ...(classIds ? { classId: { $in: classIds } } : {}),
      }),
      EducationSession.find({
        ...sessionAssignFilter,
        date: { $gte: todayStart, $lt: todayEnd },
      }).populate('classId', 'name color school').sort({ date: 1 }),
      EducationSession.find({
        ...sessionAssignFilter,
        date: { $gte: todayStart, $lt: weekEnd },
      }).populate('classId', 'name color school').sort({ date: 1 }).limit(20),
      // À préparer : prochaines séances dans 72h, statut PLANIFIEE.
      EducationSession.find({
        ...sessionAssignFilter,
        date: { $gte: now, $lt: prepHorizon },
        status: 'PLANIFIEE',
      }).populate('classId', 'name color school').sort({ date: 1 }).limit(20),
      EducationAssignment.find({
        ...sessionAssignFilter,
        status: { $in: ['OUVERT', 'EN_CORRECTION'] },
      }).populate('classId', 'name color school').sort({ deadline: 1 }).limit(20),
      EducationSubmission.countDocuments({
        ...ownerFilter(req),
        $or: [{ status: 'EN_RETARD' }, { isLate: true, status: { $ne: 'CORRIGE' } }],
      }),
      EducationSubmission.countDocuments({
        ...ownerFilter(req),
        status: { $in: ['RENDU', 'EN_RETARD', 'EN_CORRECTION'] },
        grade: null,
      }),
      // À corriger : devoirs avec au moins une soumission non corrigée.
      EducationAssignment.find({
        ...sessionAssignFilter,
        status: { $in: ['OUVERT', 'EN_CORRECTION'] },
      }).populate('classId', 'name color school').sort({ deadline: 1 }).limit(20),
      EducationClass.find({ ...classFilter, status: { $ne: 'ARCHIVE' } })
        .select('_id name color school')
        .sort({ name: 1 }),
      EducationActivityLog.find({ ...ownerFilter(req) }).sort({ createdAt: -1 }).limit(20),
      // Liste distincte des écoles connues (multi-écoles).
      EducationClass.distinct('school', { ...ownerFilter(req), deletedAt: null }),
    ])

    // Dernière séance par classe : on requête en parallèle pour chaque classe active.
    const lastSessionByClass = await Promise.all(
      activeClassDocs.map(async (klass) => {
        const last = await EducationSession.findOne({
          ...ownerFilter(req),
          classId: klass._id,
          date: { $lte: now },
        }).sort({ date: -1 })
        return {
          class: { _id: klass._id, name: klass.name, color: klass.color, school: klass.school },
          lastSession: last,
        }
      })
    )

    res.json({
      counters: {
        activeClasses,
        totalStudents,
        todaySessions: todaySessions.length,
        weekSessions: weekSessions.length,
        openAssignments: openAssignments.length,
        lateSubmissions,
        toGrade,
        toPrepare: toPrepareSessions.length,
      },
      today: todaySessions,
      week: weekSessions,
      toPrepare: toPrepareSessions,
      openAssignments,
      toCorrect: toCorrectAssignments,
      lastSessionByClass,
      activity: recentActivity,
      schools: (schools as unknown[]).filter((s): s is string => typeof s === 'string' && !!s).sort(),
      filter: { school: schoolFilter },
    })
  } catch (err) { next(err) }
})

export default router
