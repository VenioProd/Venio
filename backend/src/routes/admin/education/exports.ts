import express, { type NextFunction, type Request, type Response } from 'express'
import { EducationAssignment, EducationClass, EducationSession, EducationStudent } from '../../../models/education/index.js'
import { buildCsv } from '../../../lib/accounting/csvExport.js'
import { sensitiveAction } from '../../../lib/security/sensitiveActions.js'
import { ownerFilter, validId } from './helpers.js'

const router = express.Router()

interface ExportStudent {
  reference: string
  firstName: string
  lastName: string
  email: string
  externalId: string
  status: string
  tags: string[]
  attendanceCount: number
  absenceCount: number
  lateCount: number
  averageGrade: number | null
}

function asIso(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null
}

function slugify(value: string): string {
  return (
    String(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'classe'
  )
}

function stringList(values: string[] | null | undefined): string[] {
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : []
}

function setSensitiveDownloadHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

/**
 * GET /classes/:id?format=csv|json
 *
 * The CSV intentionally contains one row per course/session. The JSON is a
 * versioned class snapshot for operations, with an explicit allow-list: no
 * document URLs, attachment paths, submission bodies, private notes or owner
 * identifiers are serialised.
 */
router.get(
  '/classes/:id',
  sensitiveAction('EDUCATION_CLASS_EXPORT'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })

      const format = req.query.format === 'csv' ? 'csv' : req.query.format === 'json' ? 'json' : null
      if (!format) return res.status(400).json({ error: 'Format d’export invalide. Formats acceptés : csv, json.' })

      const klass = await EducationClass.findOne({ _id: req.params.id, ...ownerFilter(req) }).lean()
      if (!klass) return res.status(404).json({ error: 'Classe introuvable' })

      const [students, sessions, assignments] = await Promise.all([
        EducationStudent.find({ classId: klass._id, ...ownerFilter(req) })
          .sort({ lastName: 1, firstName: 1, _id: 1 })
          .lean(),
        EducationSession.find({ classId: klass._id, ...ownerFilter(req) })
          .sort({ date: 1, _id: 1 })
          .lean(),
        EducationAssignment.find({ classId: klass._id, ...ownerFilter(req) })
          .sort({ deadline: 1, title: 1, _id: 1 })
          .lean(),
      ])

      const exportedStudents: ExportStudent[] = students.map((student, index) => ({
        // A snapshot-local reference keeps attendance relationships without
        // leaking Mongo identifiers. externalId remains available when present.
        reference: `student-${index + 1}`,
        firstName: student.firstName || '',
        lastName: student.lastName || '',
        email: student.email || '',
        externalId: student.externalId || '',
        status: student.status,
        tags: stringList(student.tags),
        attendanceCount: student.attendanceCount,
        absenceCount: student.absenceCount,
        lateCount: student.lateCount,
        averageGrade: student.averageGrade ?? null,
      }))
      const studentReferences = new Map(students.map((student, index) => [student._id.toString(), `student-${index + 1}`]))
      const sessionLabels = new Map(
        sessions.map((session) => [session._id.toString(), { title: session.title, date: asIso(session.date) }]),
      )

      const safeClass = {
        name: klass.name,
        school: klass.school,
        level: klass.level,
        program: klass.program,
        period: { start: asIso(klass.period?.start), end: asIso(klass.period?.end) },
        weeklyHours: klass.weeklyHours,
        totalHours: klass.totalHours,
        status: klass.status,
        tags: stringList(klass.tags),
      }

      const safeSessions = sessions.map((session) => ({
        title: session.title,
        theme: session.theme,
        objectives: stringList(session.objectives),
        agenda: session.agenda,
        date: asIso(session.date),
        durationMin: session.durationMin,
        location: session.location,
        status: session.status,
        recap: session.recap,
        tags: stringList(session.tags),
        attendance: session.attendance
          .map((entry) => ({ studentReference: studentReferences.get(entry.studentId.toString()) || null, state: entry.state }))
          .filter((entry) => entry.studentReference !== null),
      }))
      const safeAssignments = assignments.map((assignment) => ({
        title: assignment.title,
        kind: assignment.kind,
        instructions: assignment.instructions,
        deadline: asIso(assignment.deadline),
        maxGrade: assignment.maxGrade,
        weight: assignment.weight,
        status: assignment.status,
        expectedDeliverables: stringList(assignment.expectedDeliverables),
        rubric: assignment.rubric.map((criterion) => ({ label: criterion.label, max: criterion.max })),
        groupMode: assignment.groupMode,
        tags: stringList(assignment.tags),
        session: assignment.sessionId ? sessionLabels.get(assignment.sessionId.toString()) || null : null,
      }))

      const filenameStem = `classe-${slugify(klass.name)}`
      if (format === 'csv') {
        const headers = [
          'Classe',
          'École',
          'Niveau',
          'Programme',
          'Statut classe',
          'Cours',
          'Thème',
          'Date',
          'Durée (min)',
          'Lieu',
          'Statut cours',
          'Objectifs',
          'Agenda',
          'Récapitulatif',
          'Tags',
        ]
        const rows = safeSessions.map((session) => [
          safeClass.name,
          safeClass.school,
          safeClass.level,
          safeClass.program,
          safeClass.status,
          session.title,
          session.theme,
          session.date ?? '',
          session.durationMin,
          session.location,
          session.status,
          session.objectives.join(' | '),
          session.agenda,
          session.recap,
          session.tags.join(' | '),
        ])
        setSensitiveDownloadHeaders(res)
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="${filenameStem}-cours.csv"`)
        res.send(buildCsv(headers, rows))
        return
      }

      const payload = {
        schema: 'venio.education.class-export',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        class: safeClass,
        students: exportedStudents,
        sessions: safeSessions,
        assignments: safeAssignments,
      }
      setSensitiveDownloadHeaders(res)
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${filenameStem}-workspace.json"`)
      res.send(`${JSON.stringify(payload, null, 2)}\n`)
    } catch (err) {
      next(err)
    }
  },
)

export default router
