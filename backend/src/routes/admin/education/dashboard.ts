import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
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

const MAX_FOLLOW_UP_CANDIDATES = 100
const MAX_PEDAGOGICAL_ALERTS = 20

type AlertClass = { _id: unknown; name?: string; color?: string; school?: string }

type PedagogicalAlert = {
  type: 'ABSENCES_REPETEES' | 'RETARDS_REPETES' | 'DEVOIRS_NON_RENDUS'
  severity: 'high' | 'medium'
  count: number
  student: { _id: unknown; firstName: string; lastName: string }
  class: AlertClass
  message: string
}

function classSummary(klass: AlertClass | null | undefined): AlertClass | null {
  if (!klass?._id) return null
  return {
    _id: klass._id,
    name: klass.name || 'Classe sans nom',
    color: klass.color || '#22C55E',
    school: klass.school || '',
  }
}

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
    const schoolFilter =
      typeof req.query.school === 'string' && req.query.school.trim() ? String(req.query.school).trim() : null

    const classFilter: Record<string, unknown> = { ...ownerFilter(req) }
    if (schoolFilter) classFilter.school = schoolFilter

    // Si filtre école : restreindre les ids de classes.
    let classIds: string[] | null = null
    if (schoolFilter) {
      const ids = await EducationClass.find(classFilter).select('_id')
      classIds = ids.map((c) => String(c._id))
    }
    const sessionAssignFilter = classIds ? { ...ownerFilter(req), classId: { $in: classIds } } : { ...ownerFilter(req) }

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
      followUpStudents,
      overdueWorkByStudent,
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
      })
        .populate('classId', 'name color school')
        .sort({ date: 1 }),
      EducationSession.find({
        ...sessionAssignFilter,
        date: { $gte: todayStart, $lt: weekEnd },
      })
        .populate('classId', 'name color school')
        .sort({ date: 1 })
        .limit(20),
      // À préparer : prochaines séances dans 72h, statut PLANIFIEE.
      EducationSession.find({
        ...sessionAssignFilter,
        date: { $gte: now, $lt: prepHorizon },
        status: 'PLANIFIEE',
      })
        .populate('classId', 'name color school')
        .sort({ date: 1 })
        .limit(20),
      EducationAssignment.find({
        ...sessionAssignFilter,
        status: { $in: ['OUVERT', 'EN_CORRECTION'] },
      })
        .populate('classId', 'name color school')
        .sort({ deadline: 1 })
        .limit(20),
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
      })
        .populate('classId', 'name color school')
        .sort({ deadline: 1 })
        .limit(20),
      EducationClass.find({ ...classFilter, status: { $ne: 'ARCHIVE' } })
        .select('_id name color school')
        .sort({ name: 1 }),
      EducationActivityLog.find({ ...ownerFilter(req) })
        .sort({ createdAt: -1 })
        .limit(20),
      // Liste distincte des écoles connues (multi-écoles).
      EducationClass.distinct('school', { ...ownerFilter(req), deletedAt: null }),
      // Signaux de suivi déjà maintenus lors de la saisie des présences. La
      // requête est délibérément bornée : le cockpit ne doit pas devenir une
      // recherche exhaustive sur l'historique d'une grande promotion.
      EducationStudent.find({
        ...ownerFilter(req),
        status: 'ACTIVE',
        ...(classIds ? { classId: { $in: classIds } } : {}),
        $or: [{ absenceCount: { $gte: 2 } }, { lateCount: { $gte: 3 } }],
      })
        .select('_id firstName lastName absenceCount lateCount classId')
        .populate('classId', 'name color school')
        .sort({ absenceCount: -1, lateCount: -1, updatedAt: -1 })
        .limit(MAX_FOLLOW_UP_CANDIDATES),
      // Travaux échus mais non rendus : on joint le devoir afin de respecter
      // le filtre d'école sans dupliquer classId sur une soumission.
      EducationSubmission.aggregate<{
        _id: mongoose.Types.ObjectId
        count: number
        class: AlertClass
      }>([
        {
          $match: {
            owner: new mongoose.Types.ObjectId(req.user!.id),
            deletedAt: null,
            $or: [{ status: { $in: ['NON_RENDU', 'EN_RETARD'] } }, { isLate: true, grade: null }],
          },
        },
        {
          $lookup: {
            from: EducationAssignment.collection.name,
            localField: 'assignmentId',
            foreignField: '_id',
            as: 'assignment',
          },
        },
        { $unwind: '$assignment' },
        {
          $match: {
            'assignment.owner': new mongoose.Types.ObjectId(req.user!.id),
            'assignment.deletedAt': null,
            'assignment.status': { $in: ['OUVERT', 'EN_CORRECTION'] },
            'assignment.deadline': { $lt: now },
            ...(classIds
              ? { 'assignment.classId': { $in: classIds.map((id) => new mongoose.Types.ObjectId(id)) } }
              : {}),
          },
        },
        { $sort: { updatedAt: -1 } },
        { $limit: MAX_FOLLOW_UP_CANDIDATES },
        {
          $group: {
            _id: '$studentId',
            count: { $sum: 1 },
            class: {
              $first: {
                _id: '$assignment.classId',
              },
            },
          },
        },
        { $sort: { count: -1 } },
        { $limit: MAX_PEDAGOGICAL_ALERTS },
      ]),
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
      }),
    )

    const classDetails = await EducationClass.find({
      ...ownerFilter(req),
      _id: { $in: overdueWorkByStudent.map((item) => item.class._id) },
    }).select('_id name color school')
    const classById = new Map(classDetails.map((klass) => [String(klass._id), classSummary(klass)]))

    const alerts: PedagogicalAlert[] = []
    for (const student of followUpStudents) {
      const klass = classSummary(student.classId as unknown as AlertClass)
      if (!klass) continue
      if (student.absenceCount >= 2) {
        alerts.push({
          type: 'ABSENCES_REPETEES',
          severity: student.absenceCount >= 3 ? 'high' : 'medium',
          count: student.absenceCount,
          student: { _id: student._id, firstName: student.firstName, lastName: student.lastName },
          class: klass,
          message: `${student.absenceCount} absence${student.absenceCount > 1 ? 's' : ''} enregistrée${student.absenceCount > 1 ? 's' : ''}`,
        })
      }
      if (student.lateCount >= 3) {
        alerts.push({
          type: 'RETARDS_REPETES',
          severity: student.lateCount >= 5 ? 'high' : 'medium',
          count: student.lateCount,
          student: { _id: student._id, firstName: student.firstName, lastName: student.lastName },
          class: klass,
          message: `${student.lateCount} retard${student.lateCount > 1 ? 's' : ''} enregistré${student.lateCount > 1 ? 's' : ''}`,
        })
      }
    }

    const overdueStudentIds = overdueWorkByStudent.map((item) => item._id)
    const overdueStudents = await EducationStudent.find({
      ...ownerFilter(req),
      _id: { $in: overdueStudentIds },
      status: 'ACTIVE',
    }).select('_id firstName lastName')
    const overdueStudentById = new Map(overdueStudents.map((student) => [String(student._id), student]))
    for (const item of overdueWorkByStudent) {
      const student = overdueStudentById.get(String(item._id))
      const klass = classById.get(String(item.class._id))
      if (!student || !klass) continue
      alerts.push({
        type: 'DEVOIRS_NON_RENDUS',
        severity: 'high',
        count: item.count,
        student: { _id: student._id, firstName: student.firstName, lastName: student.lastName },
        class: klass,
        message: `${item.count} devoir${item.count > 1 ? 's' : ''} échu${item.count > 1 ? 's' : ''} non rendu${item.count > 1 ? 's' : ''}`,
      })
    }

    const severityRank = { high: 0, medium: 1 }
    alerts.sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        b.count - a.count ||
        a.student.lastName.localeCompare(b.student.lastName, 'fr'),
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
      alerts: alerts.slice(0, MAX_PEDAGOGICAL_ALERTS),
      lastSessionByClass,
      activity: recentActivity,
      schools: (schools as unknown[]).filter((s): s is string => typeof s === 'string' && !!s).sort(),
      filter: { school: schoolFilter },
    })
  } catch (err) {
    next(err)
  }
})

export default router
