import express, { type Request, type Response, type NextFunction } from 'express'
import {
  EducationAssignment,
  EducationSubmission,
  EducationStudent,
  EducationClass,
} from '../../../models/education/index.js'
import { logActivity, ownerFilter, parseListQuery, validId } from './helpers.js'

const router = express.Router()

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
  } catch (err) { next(err) }
})

// POST /
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      classId, sessionId, title, kind, instructions, deadline, maxGrade, weight,
      status, expectedDeliverables, groupMode, tags,
    } = req.body
    if (!validId(classId)) return res.status(400).json({ error: 'classId invalide' })
    if (!title?.trim()) return res.status(400).json({ error: 'Le titre est requis' })

    const klass = await EducationClass.findOne({ _id: classId, ...ownerFilter(req) })
    if (!klass) return res.status(404).json({ error: 'Classe introuvable' })

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
          { ordered: false }
        ).catch(() => {})
      }
    }

    await logActivity(req.user!.id, req.user!.id, 'assignment', created._id, 'CREATE', { classId })
    res.status(201).json({ assignment: created })
  } catch (err) { next(err) }
})

// GET /:id — détail + statistiques
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationAssignment.findOne({ _id: req.params.id, ...ownerFilter(req) })
      .populate('classId', 'name color')
    if (!item) return res.status(404).json({ error: 'Devoir introuvable' })

    const submissions = await EducationSubmission.find({
      assignmentId: item._id,
      ...ownerFilter(req),
    }).populate('studentId', 'firstName lastName email')

    const stats = {
      total: submissions.length,
      rendu: submissions.filter((s) => ['RENDU', 'EN_CORRECTION', 'CORRIGE'].includes(s.status)).length,
      corrige: submissions.filter((s) => s.status === 'CORRIGE').length,
      nonRendu: submissions.filter((s) => s.status === 'NON_RENDU').length,
      retard: submissions.filter((s) => s.status === 'EN_RETARD' || s.isLate).length,
      moyenne: (() => {
        const graded = submissions.filter((s) => typeof s.grade === 'number')
        if (graded.length === 0) return null
        return Number((graded.reduce((acc, s) => acc + (s.grade || 0), 0) / graded.length).toFixed(2))
      })(),
    }

    res.json({ assignment: item, submissions, stats })
  } catch (err) { next(err) }
})

// PATCH /:id
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationAssignment.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Devoir introuvable' })

    const wasDraft = item.status === 'DRAFT'

    const {
      title, kind, instructions, deadline, maxGrade, weight, status,
      expectedDeliverables, groupMode, tags, sessionId,
    } = req.body

    if (title !== undefined) item.title = title.trim()
    if (kind !== undefined) item.kind = kind
    if (instructions !== undefined) item.instructions = instructions
    if (deadline !== undefined) item.deadline = deadline ? new Date(deadline) : null
    if (maxGrade !== undefined) item.maxGrade = maxGrade
    if (weight !== undefined) item.weight = weight
    if (status !== undefined) item.status = status
    if (Array.isArray(expectedDeliverables)) item.expectedDeliverables = expectedDeliverables
    if (groupMode !== undefined) item.groupMode = !!groupMode
    if (Array.isArray(tags)) item.tags = tags
    if (sessionId !== undefined) item.sessionId = validId(sessionId) ? sessionId : null

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
  } catch (err) { next(err) }
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
      { deletedAt: now }
    )
    await logActivity(req.user!.id, req.user!.id, 'assignment', item._id, 'DELETE', {})
    res.json({ success: true })
  } catch (err) { next(err) }
})

// ─── Submissions ─────────────────────────────────────────────────────────────

// GET /:id/submissions
router.get('/:id/submissions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const submissions = await EducationSubmission.find({
      assignmentId: req.params.id,
      ...ownerFilter(req),
    }).populate('studentId', 'firstName lastName email')
    res.json({ submissions })
  } catch (err) { next(err) }
})

// PATCH /:id/submissions/:studentId — update soumission (grade, feedback, status, url, textBody)
router.patch('/:id/submissions/:studentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id) || !validId(req.params.studentId)) {
      return res.status(400).json({ error: 'Identifiant invalide' })
    }
    const assignment = await EducationAssignment.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!assignment) return res.status(404).json({ error: 'Devoir introuvable' })

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

    const { status, grade, feedback, url, textBody, submittedAt } = req.body
    if (status !== undefined) sub.status = status
    if (grade !== undefined) sub.grade = grade
    if (feedback !== undefined) sub.feedback = feedback
    if (url !== undefined) sub.url = url
    if (textBody !== undefined) sub.textBody = textBody
    if (submittedAt !== undefined) sub.submittedAt = submittedAt ? new Date(submittedAt) : null

    // Calcul isLate
    if (sub.submittedAt && assignment.deadline) {
      sub.isLate = sub.submittedAt.getTime() > assignment.deadline.getTime()
      if (sub.isLate && sub.status === 'RENDU') sub.status = 'EN_RETARD'
    }

    await sub.save()
    const action = typeof grade === 'number' ? 'GRADE' : status === 'RENDU' ? 'SUBMIT' : 'UPDATE'
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
        { _id: req.params.studentId, owner: req.user!.id },
        { averageGrade: Number(avg.toFixed(2)) }
      )
    }

    res.json({ submission: sub })
  } catch (err) { next(err) }
})

export default router
