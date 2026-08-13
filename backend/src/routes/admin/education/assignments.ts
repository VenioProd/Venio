import express, { type Request, type Response, type NextFunction } from 'express'
import {
  ASSIGNMENT_KINDS,
  ASSIGNMENT_STATUSES,
  SUBMISSION_STATUSES,
  EducationAssignment,
  EducationSubmission,
  EducationStudent,
  EducationClass,
  EducationSession,
  type EducationSubmissionStatus,
} from '../../../models/education/index.js'
import { invalidStudentIdsForClass, logActivity, ownerFilter, parseListQuery, validId } from './helpers.js'
import { sensitiveAction } from '../../../lib/security/sensitiveActions.js'

const router = express.Router()

type SubmissionPatch = {
  studentId?: unknown
  status?: unknown
  grade?: unknown
  feedback?: unknown
  url?: unknown
  textBody?: unknown
  submittedAt?: unknown
}

function normalizeSubmissionPatch(
  raw: SubmissionPatch,
  maxGrade: number,
): { value?: Omit<SubmissionPatch, 'studentId'> & { status?: EducationSubmissionStatus }; error?: string } {
  const value: Omit<SubmissionPatch, 'studentId'> & { status?: EducationSubmissionStatus } = {}
  if (raw.status !== undefined) {
    if (typeof raw.status !== 'string' || !(SUBMISSION_STATUSES as readonly string[]).includes(raw.status)) {
      return { error: 'Statut de soumission invalide' }
    }
    value.status = raw.status as EducationSubmissionStatus
  }
  if (raw.grade !== undefined) {
    if (
      raw.grade !== null &&
      (typeof raw.grade !== 'number' || !Number.isFinite(raw.grade) || raw.grade < 0 || raw.grade > maxGrade)
    ) {
      return { error: `La note doit être comprise entre 0 et ${maxGrade}` }
    }
    value.grade = raw.grade
  }
  if (raw.feedback !== undefined) {
    if (typeof raw.feedback !== 'string') return { error: 'Feedback invalide' }
    value.feedback = raw.feedback.trim().slice(0, 10000)
  }
  if (raw.url !== undefined) {
    if (typeof raw.url !== 'string') return { error: 'URL invalide' }
    value.url = raw.url.trim().slice(0, 2000)
  }
  if (raw.textBody !== undefined) {
    if (typeof raw.textBody !== 'string') return { error: 'Contenu de rendu invalide' }
    value.textBody = raw.textBody.slice(0, 20000)
  }
  if (raw.submittedAt !== undefined) {
    if (raw.submittedAt === null || raw.submittedAt === '') value.submittedAt = null
    else if (typeof raw.submittedAt === 'string' && !Number.isNaN(new Date(raw.submittedAt).getTime())) {
      value.submittedAt = raw.submittedAt
    } else return { error: 'Date de rendu invalide' }
  }
  return { value }
}

function applySubmissionPatch(
  submission: InstanceType<typeof EducationSubmission>,
  patch: Omit<SubmissionPatch, 'studentId'> & { status?: EducationSubmissionStatus },
): void {
  if (patch.status !== undefined) submission.status = patch.status
  if (patch.grade !== undefined) submission.grade = patch.grade as number | null
  if (patch.feedback !== undefined) submission.feedback = patch.feedback as string
  if (patch.url !== undefined) submission.url = patch.url as string
  if (patch.textBody !== undefined) submission.textBody = patch.textBody as string
  if (patch.submittedAt !== undefined) {
    submission.submittedAt = patch.submittedAt ? new Date(patch.submittedAt as string) : null
  }
}

// GET / — list
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, skip, sort } = parseListQuery(req, { defaultLimit: 100 })
    const filter: Record<string, unknown> = { ...ownerFilter(req) }
    if (req.query.classId && validId(req.query.classId)) filter.classId = req.query.classId
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status
    if (req.query.kind && req.query.kind !== 'all') filter.kind = req.query.kind
    if (req.query.search) filter.$text = { $search: String(req.query.search) }
    const [items, total] = await Promise.all([
      EducationAssignment.find(filter).sort(sort).skip(skip).limit(limit).populate('classId', 'name color'),
      EducationAssignment.countDocuments(filter),
    ])
    res.json({ assignments: items, total })
  } catch (err) {
    next(err)
  }
})

// POST /
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      classId,
      sessionId,
      title,
      kind,
      instructions,
      deadline,
      maxGrade,
      weight,
      status,
      expectedDeliverables,
      groupMode,
      tags,
    } = req.body
    if (!validId(classId)) return res.status(400).json({ error: 'classId invalide' })
    if (!title?.trim()) return res.status(400).json({ error: 'Le titre est requis' })
    if (kind !== undefined && !(ASSIGNMENT_KINDS as readonly string[]).includes(kind)) {
      return res.status(400).json({ error: 'Type de devoir invalide' })
    }
    if (status !== undefined && !(ASSIGNMENT_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ error: 'Statut de devoir invalide' })
    }
    if (
      maxGrade !== undefined &&
      (typeof maxGrade !== 'number' || !Number.isFinite(maxGrade) || maxGrade <= 0 || maxGrade > 1000)
    ) {
      return res.status(400).json({ error: 'Barème invalide' })
    }
    if (
      weight !== undefined &&
      (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 1000)
    ) {
      return res.status(400).json({ error: 'Coefficient invalide' })
    }

    const klass = await EducationClass.findOne({ _id: classId, ...ownerFilter(req) })
    if (!klass) return res.status(404).json({ error: 'Classe introuvable' })
    if (sessionId !== undefined && sessionId !== null && sessionId !== '') {
      if (!validId(sessionId)) return res.status(400).json({ error: 'Séance invalide' })
      const linkedSession = await EducationSession.exists({ _id: sessionId, classId, ...ownerFilter(req) })
      if (!linkedSession) return res.status(400).json({ error: 'La séance doit appartenir à la même classe' })
    }

    const created = await EducationAssignment.create({
      owner: req.user!.id,
      classId,
      sessionId: validId(sessionId) ? sessionId : null,
      title: title.trim(),
      kind: kind || 'DEVOIR',
      instructions: instructions || '',
      deadline: deadline ? new Date(deadline) : null,
      maxGrade: maxGrade ?? 20,
      weight: weight ?? 1,
      status: status || 'DRAFT',
      expectedDeliverables: Array.isArray(expectedDeliverables) ? expectedDeliverables : [],
      groupMode: !!groupMode,
      tags: Array.isArray(tags) ? tags : [],
    })

    // Pré-créer les submissions NON_RENDU pour chaque étudiant actif
    if (created.status !== 'DRAFT') {
      const students = await EducationStudent.find({ classId, ...ownerFilter(req), status: 'ACTIVE' }).select('_id')
      if (students.length > 0) {
        await EducationSubmission.insertMany(
          students.map((s) => ({
            owner: req.user!.id,
            assignmentId: created._id,
            studentId: s._id,
            status: 'NON_RENDU',
          })),
          { ordered: false },
        ).catch(() => {})
      }
    }

    await logActivity(req.user!.id, req.user!.id, 'assignment', created._id, 'CREATE', { classId })
    res.status(201).json({ assignment: created })
  } catch (err) {
    next(err)
  }
})

// GET /:id — détail + statistiques
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationAssignment.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Devoir introuvable' })
    const classId = item.classId
    await item.populate('classId', 'name color')

    const submissions = await EducationSubmission.find({
      assignmentId: item._id,
      ...ownerFilter(req),
    }).populate({
      path: 'studentId',
      select: 'firstName lastName email',
      match: { owner: req.user!.id, classId, deletedAt: null },
    })
    const accessibleSubmissions = submissions.filter((submission) => submission.studentId)

    const stats = {
      total: accessibleSubmissions.length,
      rendu: accessibleSubmissions.filter((s) => ['RENDU', 'EN_CORRECTION', 'CORRIGE'].includes(s.status)).length,
      corrige: accessibleSubmissions.filter((s) => s.status === 'CORRIGE').length,
      nonRendu: accessibleSubmissions.filter((s) => s.status === 'NON_RENDU').length,
      retard: accessibleSubmissions.filter((s) => s.status === 'EN_RETARD' || s.isLate).length,
      moyenne: (() => {
        const graded = accessibleSubmissions.filter((s) => typeof s.grade === 'number')
        if (graded.length === 0) return null
        return Number((graded.reduce((acc, s) => acc + (s.grade || 0), 0) / graded.length).toFixed(2))
      })(),
    }

    res.json({ assignment: item, submissions: accessibleSubmissions, stats })
  } catch (err) {
    next(err)
  }
})

// PATCH /:id
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationAssignment.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Devoir introuvable' })

    const wasDraft = item.status === 'DRAFT'

    const {
      title,
      kind,
      instructions,
      deadline,
      maxGrade,
      weight,
      status,
      expectedDeliverables,
      groupMode,
      tags,
      sessionId,
    } = req.body

    const { rubric, feedbackSnippets } = req.body

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Titre invalide' })
      item.title = title.trim()
    }
    if (kind !== undefined) {
      if (!(ASSIGNMENT_KINDS as readonly string[]).includes(kind)) {
        return res.status(400).json({ error: 'Type de devoir invalide' })
      }
      item.kind = kind
    }
    if (instructions !== undefined) item.instructions = instructions
    if (deadline !== undefined) item.deadline = deadline ? new Date(deadline) : null
    if (maxGrade !== undefined) {
      if (typeof maxGrade !== 'number' || !Number.isFinite(maxGrade) || maxGrade <= 0 || maxGrade > 1000) {
        return res.status(400).json({ error: 'Barème invalide' })
      }
      item.maxGrade = maxGrade
    }
    if (weight !== undefined) {
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 1000) {
        return res.status(400).json({ error: 'Coefficient invalide' })
      }
      item.weight = weight
    }
    if (status !== undefined) {
      if (!(ASSIGNMENT_STATUSES as readonly string[]).includes(status)) {
        return res.status(400).json({ error: 'Statut de devoir invalide' })
      }
      item.status = status
    }
    if (Array.isArray(expectedDeliverables)) item.expectedDeliverables = expectedDeliverables
    if (Array.isArray(rubric)) {
      item.rubric = rubric
        .filter((r: { label?: unknown; max?: unknown }) => typeof r?.label === 'string' && r.label.trim())
        .map((r: { label: string; max: unknown }) => ({
          label: r.label.trim(),
          max: Number(r.max) || 0,
        }))
    }
    if (Array.isArray(feedbackSnippets)) {
      item.feedbackSnippets = feedbackSnippets.filter((s) => typeof s === 'string' && s.trim()).map((s) => String(s))
    }
    if (groupMode !== undefined) item.groupMode = !!groupMode
    if (Array.isArray(tags)) item.tags = tags
    if (sessionId !== undefined) {
      if (sessionId === null || sessionId === '') item.sessionId = null
      else {
        if (!validId(sessionId)) return res.status(400).json({ error: 'Séance invalide' })
        const linkedSession = await EducationSession.exists({
          _id: sessionId,
          classId: item.classId,
          ...ownerFilter(req),
        })
        if (!linkedSession) return res.status(400).json({ error: 'La séance doit appartenir à la même classe' })
        item.sessionId = sessionId
      }
    }

    await item.save()

    // Si on passe de DRAFT à OUVERT, créer les submissions manquantes
    if (wasDraft && item.status !== 'DRAFT') {
      const [students, existing] = await Promise.all([
        EducationStudent.find({ classId: item.classId, ...ownerFilter(req), status: 'ACTIVE' }).select('_id'),
        EducationSubmission.find({ assignmentId: item._id, ...ownerFilter(req) }).select('studentId'),
      ])
      const existingIds = new Set(existing.map((s) => s.studentId.toString()))
      const toCreate = students
        .filter((s) => !existingIds.has(s._id.toString()))
        .map((s) => ({
          owner: req.user!.id,
          assignmentId: item._id,
          studentId: s._id,
          status: 'NON_RENDU' as const,
        }))
      if (toCreate.length > 0) {
        await EducationSubmission.insertMany(toCreate, { ordered: false }).catch(() => {})
      }
    }

    await logActivity(req.user!.id, req.user!.id, 'assignment', item._id, 'UPDATE', {})
    res.json({ assignment: item })
  } catch (err) {
    next(err)
  }
})

// DELETE /:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationAssignment.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Devoir introuvable' })
    const now = new Date()
    item.deletedAt = now
    await item.save()
    await EducationSubmission.updateMany(
      { assignmentId: item._id, owner: req.user!.id, deletedAt: null },
      { deletedAt: now },
    )
    await logActivity(req.user!.id, req.user!.id, 'assignment', item._id, 'DELETE', {})
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ─── Submissions ─────────────────────────────────────────────────────────────

// GET /:id/submissions
router.get('/:id/submissions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const assignment = await EducationAssignment.findOne({ _id: req.params.id, ...ownerFilter(req) }).select('classId')
    if (!assignment) return res.status(404).json({ error: 'Devoir introuvable' })
    const submissions = await EducationSubmission.find({
      assignmentId: req.params.id,
      ...ownerFilter(req),
    }).populate({
      path: 'studentId',
      select: 'firstName lastName email',
      match: { owner: req.user!.id, classId: assignment.classId, deletedAt: null },
    })
    res.json({ submissions: submissions.filter((submission) => submission.studentId) })
  } catch (err) {
    next(err)
  }
})

// PATCH /:id/submissions/bulk — mise à jour groupée (correction par lot)
// IMPORTANT : doit être déclarée AVANT /:id/submissions/:studentId pour ne pas
// être interprétée comme un studentId 'bulk'.
router.patch('/:id/submissions/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const assignment = await EducationAssignment.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!assignment) return res.status(404).json({ error: 'Devoir introuvable' })

    const updates = Array.isArray(req.body?.updates) ? (req.body.updates as SubmissionPatch[]) : []
    if (updates.length === 0) return res.json({ updated: 0, submissions: [] })
    if (updates.length > 500) return res.status(400).json({ error: 'Maximum 500 corrections par lot' })
    if (updates.some((update) => !update || typeof update !== 'object')) {
      return res.status(400).json({ error: 'Format de correction invalide' })
    }

    const studentIds = updates.map((update) => update.studentId)
    const normalizedStudentIds = studentIds.map((id) => (typeof id === 'string' ? id : String(id ?? '')))
    if (new Set(normalizedStudentIds).size !== normalizedStudentIds.length) {
      return res.status(400).json({ error: 'Un étudiant ne peut apparaître qu’une fois par lot' })
    }
    const invalidStudentIds = await invalidStudentIdsForClass(req, assignment.classId, studentIds)
    if (invalidStudentIds.length > 0) {
      return res.status(400).json({ error: 'Étudiant absent de la classe', invalidStudentIds })
    }
    const normalizedUpdates = updates.map((update) => {
      const normalized = normalizeSubmissionPatch(update, assignment.maxGrade)
      return { studentId: String(update.studentId), ...normalized }
    })
    const invalidUpdate = normalizedUpdates.find((update) => update.error)
    if (invalidUpdate?.error) return res.status(400).json({ error: invalidUpdate.error })

    const updated: unknown[] = []
    for (const update of normalizedUpdates) {
      const studentId = update.studentId
      let sub = await EducationSubmission.findOne({
        assignmentId: req.params.id,
        studentId,
        ...ownerFilter(req),
      })
      if (!sub) {
        sub = await EducationSubmission.create({
          owner: req.user!.id,
          assignmentId: req.params.id,
          studentId,
          status: 'NON_RENDU',
        })
      }
      applySubmissionPatch(sub, update.value!)

      if (sub.submittedAt && assignment.deadline) {
        sub.isLate = sub.submittedAt.getTime() > assignment.deadline.getTime()
        if (sub.isLate && sub.status === 'RENDU') sub.status = 'EN_RETARD'
      }
      await sub.save()
      updated.push(sub)
    }

    const impactedStudents = normalizedStudentIds
    for (const studentId of impactedStudents) {
      const graded = await EducationSubmission.find({
        studentId,
        ...ownerFilter(req),
        grade: { $ne: null },
      }).select('grade')
      if (graded.length > 0) {
        const avg = graded.reduce((acc, s) => acc + (s.grade || 0), 0) / graded.length
        await EducationStudent.updateOne(
          { _id: studentId, classId: assignment.classId, owner: req.user!.id, deletedAt: null },
          { averageGrade: Number(avg.toFixed(2)) },
        )
      }
    }

    await logActivity(req.user!.id, req.user!.id, 'submission', assignment._id, 'GRADE', {
      bulk: true,
      count: updated.length,
      assignmentId: req.params.id,
    })

    res.json({ updated: updated.length, submissions: updated })
  } catch (err) {
    next(err)
  }
})

// PATCH /:id/submissions/:studentId — update soumission (grade, feedback, status, url, textBody)
router.patch('/:id/submissions/:studentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id) || !validId(req.params.studentId)) {
      return res.status(400).json({ error: 'Identifiant invalide' })
    }
    const assignment = await EducationAssignment.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!assignment) return res.status(404).json({ error: 'Devoir introuvable' })
    const invalidStudentIds = await invalidStudentIdsForClass(req, assignment.classId, [req.params.studentId])
    if (invalidStudentIds.length > 0) return res.status(400).json({ error: 'Étudiant absent de la classe' })

    const normalized = normalizeSubmissionPatch(req.body as SubmissionPatch, assignment.maxGrade)
    if (normalized.error) return res.status(400).json({ error: normalized.error })

    let sub = await EducationSubmission.findOne({
      assignmentId: req.params.id,
      studentId: req.params.studentId,
      ...ownerFilter(req),
    })
    if (!sub) {
      sub = await EducationSubmission.create({
        owner: req.user!.id,
        assignmentId: req.params.id,
        studentId: req.params.studentId,
        status: 'NON_RENDU',
      })
    }

    applySubmissionPatch(sub, normalized.value!)

    // Calcul isLate
    if (sub.submittedAt && assignment.deadline) {
      sub.isLate = sub.submittedAt.getTime() > assignment.deadline.getTime()
      if (sub.isLate && sub.status === 'RENDU') sub.status = 'EN_RETARD'
    }

    await sub.save()
    const action =
      typeof normalized.value?.grade === 'number' ? 'GRADE' : normalized.value?.status === 'RENDU' ? 'SUBMIT' : 'UPDATE'
    await logActivity(req.user!.id, req.user!.id, 'submission', sub._id, action, { assignmentId: req.params.id })

    // Refresh student average grade
    const allGraded = await EducationSubmission.find({
      studentId: req.params.studentId,
      ...ownerFilter(req),
      grade: { $ne: null },
    }).select('grade')
    if (allGraded.length > 0) {
      const avg = allGraded.reduce((acc, s) => acc + (s.grade || 0), 0) / allGraded.length
      await EducationStudent.updateOne(
        { _id: req.params.studentId, classId: assignment.classId, owner: req.user!.id, deletedAt: null },
        { averageGrade: Number(avg.toFixed(2)) },
      )
    }

    res.json({ submission: sub })
  } catch (err) {
    next(err)
  }
})

// GET /:id/export.csv — export CSV des corrections par étudiant
router.get(
  '/:id/export.csv',
  sensitiveAction('EDUCATION_ASSIGNMENT_EXPORT'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
      const assignment = await EducationAssignment.findOne({ _id: req.params.id, ...ownerFilter(req) })
      if (!assignment) return res.status(404).json({ error: 'Devoir introuvable' })
      const classId = assignment.classId
      await assignment.populate('classId', 'name school level')

      const submissions = await EducationSubmission.find({
        assignmentId: req.params.id,
        ...ownerFilter(req),
      }).populate({
        path: 'studentId',
        select: 'firstName lastName email externalId',
        match: { owner: req.user!.id, classId, deletedAt: null },
      })

      const headers = [
        'Etudiant',
        'Email',
        'Identifiant',
        'Statut',
        'Rendu le',
        'Note',
        'Note max',
        'En retard',
        'Feedback',
      ]
      const rows = submissions
        .filter((submission) => submission.studentId)
        .map((s) => {
          const stu = s.studentId as unknown as {
            firstName?: string
            lastName?: string
            email?: string
            externalId?: string
          } | null
          const name = stu ? [stu.firstName || '', (stu.lastName || '').toUpperCase()].filter(Boolean).join(' ') : ''
          return [
            name,
            stu?.email || '',
            stu?.externalId || '',
            s.status,
            s.submittedAt ? new Date(s.submittedAt).toISOString() : '',
            s.grade != null ? String(s.grade) : '',
            String(assignment.maxGrade),
            s.isLate ? 'oui' : 'non',
            s.feedback || '',
          ]
        })

      const csv = toCsv([headers, ...rows])
      const klassName =
        assignment.classId && typeof assignment.classId === 'object'
          ? (assignment.classId as unknown as { name?: string }).name || 'classe'
          : 'classe'
      const fname = `corrections-${slugify(klassName)}-${slugify(assignment.title)}.csv`
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"`)
      res.send('﻿' + csv)
    } catch (err) {
      next(err)
    }
  },
)

function escapeCsvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes(';')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n')
}

function slugify(s: string): string {
  return (
    String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'export'
  )
}

export default router
