import express, { type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import mongoose from 'mongoose'
import { parse as parseCsv } from 'csv-parse/sync'
import {
  EducationStudent,
  EducationClass,
  EducationAssignment,
  EducationSubmission,
  EducationSession,
  FOLLOW_UP_TYPES,
  STUDENT_STATUSES,
  type EducationFollowUpType,
  type EducationStudentStatus,
} from '../../../models/education/index.js'
import { logActivity, ownerFilter, parseListQuery, validId } from './helpers.js'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } })
const MAX_IMPORT_ROWS = 5000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type StudentInput = {
  firstName?: unknown
  lastName?: unknown
  email?: unknown
  phone?: unknown
  externalId?: unknown
  status?: unknown
  tags?: unknown
  notes?: unknown
}

function boundedString(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return null
  return value.trim().slice(0, max)
}

function normalizeStudentInput(
  input: StudentInput,
  options: { partial?: boolean } = {},
): { value?: Record<string, unknown>; error?: string } {
  const value: Record<string, unknown> = {}
  const strings: Array<[keyof StudentInput, number]> = [
    ['firstName', 120],
    ['lastName', 120],
    ['email', 254],
    ['phone', 64],
    ['externalId', 120],
    ['notes', 10000],
  ]
  for (const [key, max] of strings) {
    if (options.partial && input[key] === undefined) continue
    const normalized = boundedString(input[key], max)
    if (normalized === null) return { error: `Champ ${key} invalide` }
    value[key] = key === 'email' ? normalized.toLowerCase() : normalized
  }
  if ((!options.partial || input.lastName !== undefined) && !String(value.lastName || '').trim()) {
    return { error: 'Le nom est requis' }
  }
  if (value.email && !EMAIL_RE.test(String(value.email))) return { error: 'Adresse email invalide' }

  if (!options.partial || input.status !== undefined) {
    const status = input.status ?? 'ACTIVE'
    if (typeof status !== 'string' || !(STUDENT_STATUSES as readonly string[]).includes(status)) {
      return { error: 'Statut étudiant invalide' }
    }
    value.status = status as EducationStudentStatus
  }
  if (!options.partial || input.tags !== undefined) {
    if (input.tags !== undefined && !Array.isArray(input.tags)) return { error: 'Tags invalides' }
    const tags = Array.isArray(input.tags)
      ? Array.from(
          new Set(
            input.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        )
          .slice(0, 25)
          .map((tag) => tag.slice(0, 60))
      : []
    value.tags = tags
  }
  return { value }
}

async function currentFollowUpCount(
  req: Request,
  studentId: mongoose.Types.ObjectId,
  type: EducationFollowUpType,
  absenceCount: number,
  lateCount: number,
): Promise<number> {
  if (type === 'ABSENCES_REPETEES') return absenceCount >= 2 ? absenceCount : 0
  if (type === 'RETARDS_REPETES') return lateCount >= 3 ? lateCount : 0

  const overdue = await EducationSubmission.aggregate<{ count: number }>([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(req.user!.id),
        studentId,
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
        'assignment.deadline': { $lt: new Date() },
      },
    },
    { $count: 'count' },
  ])
  return overdue[0]?.count || 0
}

// GET / — list ; query: classId, status, search
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, skip, sort } = parseListQuery(req, { defaultLimit: 100 })
    const filter: Record<string, unknown> = { ...ownerFilter(req) }
    if (req.query.classId && validId(req.query.classId)) filter.classId = req.query.classId
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status
    if (req.query.search) filter.$text = { $search: String(req.query.search) }
    const [items, total] = await Promise.all([
      EducationStudent.find(filter).sort(sort).skip(skip).limit(limit),
      EducationStudent.countDocuments(filter),
    ])
    res.json({ students: items, total })
  } catch (err) {
    next(err)
  }
})

// POST / — create
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classId } = req.body
    if (!validId(classId)) return res.status(400).json({ error: 'classId invalide' })
    const normalized = normalizeStudentInput(req.body as StudentInput)
    if (normalized.error) return res.status(400).json({ error: normalized.error })

    const klass = await EducationClass.findOne({ _id: classId, ...ownerFilter(req) })
    if (!klass) return res.status(404).json({ error: 'Classe introuvable' })

    const created = await EducationStudent.create({
      owner: req.user!.id,
      classId,
      ...normalized.value,
    })
    await logActivity(req.user!.id, req.user!.id, 'student', created._id, 'CREATE', { classId })
    res.status(201).json({ student: created })
  } catch (err) {
    next(err)
  }
})

// POST /import — import CSV (text body: csv ou form-data file)
router.post('/import', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classId } = req.body
    if (!validId(classId)) return res.status(400).json({ error: 'classId invalide' })
    const klass = await EducationClass.findOne({ _id: classId, ...ownerFilter(req) })
    if (!klass) return res.status(404).json({ error: 'Classe introuvable' })

    const raw = req.file?.buffer?.toString('utf-8') ?? req.body?.csv ?? ''
    if (!raw || typeof raw !== 'string') return res.status(400).json({ error: 'CSV vide' })
    if (Buffer.byteLength(raw, 'utf8') > 4 * 1024 * 1024) return res.status(413).json({ error: 'CSV trop volumineux' })

    let rows: string[][]
    try {
      rows = parseCsv(raw, {
        bom: true,
        delimiter: [',', ';', '\t'],
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
        max_record_size: 100_000,
      }) as string[][]
    } catch {
      return res.status(400).json({ error: 'CSV illisible ou mal formé' })
    }
    if (rows.length === 0) return res.status(400).json({ error: 'CSV vide' })
    if (rows.length - 1 > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `Maximum ${MAX_IMPORT_ROWS} étudiants par import` })
    }

    const header = rows[0].map((h) => h.trim().toLowerCase())
    const idx = {
      firstName: header.findIndex((h) => ['prenom', 'prénom', 'firstname', 'first_name', 'first'].includes(h)),
      lastName: header.findIndex((h) => ['nom', 'lastname', 'last_name', 'last', 'name'].includes(h)),
      email: header.findIndex((h) => h === 'email' || h === 'e-mail' || h === 'mail'),
      phone: header.findIndex((h) => ['telephone', 'téléphone', 'phone', 'tel'].includes(h)),
      externalId: header.findIndex((h) => ['id', 'identifiant', 'externalid', 'external_id'].includes(h)),
    }
    if (idx.lastName === -1) {
      return res.status(400).json({ error: "Colonne 'nom' introuvable dans le CSV" })
    }

    const candidates: Array<Record<string, unknown> & { email: string; externalId: string; importRow: number }> = []
    const errors: Array<{ row: number; error: string }> = []
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i]
      const normalized = normalizeStudentInput({
        firstName: idx.firstName >= 0 ? cells[idx.firstName] || '' : '',
        lastName: cells[idx.lastName] || '',
        email: idx.email >= 0 ? cells[idx.email] || '' : '',
        phone: idx.phone >= 0 ? cells[idx.phone] || '' : '',
        externalId: idx.externalId >= 0 ? cells[idx.externalId] || '' : '',
        status: 'ACTIVE',
        tags: [],
        notes: '',
      })
      if (normalized.error) {
        errors.push({ row: i + 1, error: normalized.error })
        continue
      }
      candidates.push({
        owner: req.user!.id,
        classId,
        ...(normalized.value as Record<string, unknown>),
        email: String(normalized.value?.email || ''),
        externalId: String(normalized.value?.externalId || ''),
        importRow: i + 1,
      })
    }

    const emails = Array.from(new Set(candidates.map((doc) => doc.email).filter(Boolean)))
    const externalIds = Array.from(new Set(candidates.map((doc) => doc.externalId).filter(Boolean)))
    const duplicateFilter: Record<string, unknown>[] = []
    if (emails.length) duplicateFilter.push({ email: { $in: emails } })
    if (externalIds.length) duplicateFilter.push({ externalId: { $in: externalIds } })
    const existing = duplicateFilter.length
      ? await EducationStudent.find({ classId, ...ownerFilter(req), $or: duplicateFilter })
          .select('email externalId')
          .lean()
      : []
    const seenEmails = new Set(existing.map((student) => student.email).filter(Boolean))
    const seenExternalIds = new Set(existing.map((student) => student.externalId).filter(Boolean))
    const docs: Array<Record<string, unknown>> = []
    for (const candidate of candidates) {
      if (
        (candidate.email && seenEmails.has(candidate.email)) ||
        (candidate.externalId && seenExternalIds.has(candidate.externalId))
      ) {
        errors.push({ row: candidate.importRow, error: 'Étudiant déjà présent' })
        continue
      }
      if (candidate.email) seenEmails.add(candidate.email)
      if (candidate.externalId) seenExternalIds.add(candidate.externalId)
      const { importRow: _importRow, ...doc } = candidate
      docs.push(doc)
    }

    const preview = docs.slice(0, 20).map(({ firstName, lastName, email, externalId }) => ({
      firstName,
      lastName,
      email,
      externalId,
    }))
    if (req.body?.dryRun === true || req.body?.dryRun === 'true') {
      return res.json({
        dryRun: true,
        totalRows: rows.length - 1,
        valid: docs.length,
        skipped: errors.length,
        errors: errors.slice(0, 100),
        preview,
      })
    }
    if (docs.length === 0) return res.status(400).json({ error: 'Aucune ligne valide', errors: errors.slice(0, 100) })

    const inserted = await EducationStudent.insertMany(docs)
    await logActivity(req.user!.id, req.user!.id, 'student', classId, 'CREATE', {
      imported: inserted.length,
      kind: 'csv',
    })
    res.status(201).json({
      inserted: inserted.length,
      skipped: errors.length,
      errors: errors.slice(0, 100),
    })
  } catch (err) {
    next(err)
  }
})

// GET /:id/overview — fiche étudiant agrégée sans N+1 ni exposition des autres étudiants.
router.get('/:id/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const student = await EducationStudent.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!student) return res.status(404).json({ error: 'Étudiant introuvable' })

    const assignmentFilter = { classId: student.classId, ...ownerFilter(req) }
    const sessionFilter = {
      classId: student.classId,
      'attendance.studentId': student._id,
      ...ownerFilter(req),
    }
    const [sessions, attendanceTotal, assignments, assignmentsTotal] = await Promise.all([
      EducationSession.find(sessionFilter).select('_id title date attendance').sort({ date: -1 }).limit(30).lean(),
      EducationSession.countDocuments(sessionFilter),
      EducationAssignment.find(assignmentFilter)
        .select('_id title deadline maxGrade status')
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean(),
      EducationAssignment.countDocuments(assignmentFilter),
    ])

    const assignmentIds = assignments.map((assignment) => assignment._id)
    const submissions = assignmentIds.length
      ? await EducationSubmission.find({
          owner: req.user!.id,
          studentId: student._id,
          assignmentId: { $in: assignmentIds },
          deletedAt: null,
        }).lean()
      : []
    const submissionsByAssignment = new Map(
      submissions.map((submission) => [String(submission.assignmentId), submission]),
    )

    res.json({
      attendanceTotal,
      assignmentsTotal,
      attendance: sessions.map((session) => ({
        session: { _id: session._id, title: session.title, date: session.date },
        state:
          session.attendance.find((entry) => String(entry.studentId) === String(student._id))?.state || 'NON_RENSEIGNE',
      })),
      grades: assignments.map((assignment) => ({
        assignment,
        submission: submissionsByAssignment.get(String(assignment._id)) || null,
      })),
    })
  } catch (err) {
    next(err)
  }
})

// GET /:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationStudent.findOne({ _id: req.params.id, ...ownerFilter(req) }).populate(
      'classId',
      'name color',
    )
    if (!item) return res.status(404).json({ error: 'Étudiant introuvable' })
    res.json({ student: item })
  } catch (err) {
    next(err)
  }
})

// PATCH /:id/follow-up/:type — acknowledge a concrete pedagogical signal.
// The reviewed count is persisted so a later deterioration is surfaced again.
router.patch('/:id/follow-up/:type', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const type = req.params.type as EducationFollowUpType
    if (!FOLLOW_UP_TYPES.includes(type)) return res.status(400).json({ error: 'Type de suivi invalide' })

    const item = await EducationStudent.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Étudiant introuvable' })

    const acknowledged = req.body?.acknowledged !== false
    const count = Number(req.body?.count)
    if (acknowledged && (!Number.isInteger(count) || count < 1)) {
      return res.status(400).json({ error: 'Le nombre de signaux traités est invalide' })
    }
    if (acknowledged) {
      const currentCount = await currentFollowUpCount(req, item._id, type, item.absenceCount, item.lateCount)
      if (count > currentCount) {
        return res.status(409).json({ error: 'Le signal a évolué, actualise la fiche avant de le traiter' })
      }
    }

    const acknowledgements = item.followUpAcknowledgements.filter((entry) => entry.type !== type)
    if (acknowledged) acknowledgements.push({ type, count, acknowledgedAt: new Date() })
    item.followUpAcknowledgements = acknowledgements
    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'student', item._id, 'UPDATE', {
      kind: 'follow-up',
      type,
      acknowledged,
      count: acknowledged ? count : null,
    })
    res.json({ student: item })
  } catch (err) {
    next(err)
  }
})

// PATCH /:id
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationStudent.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Étudiant introuvable' })

    const normalized = normalizeStudentInput(req.body as StudentInput, { partial: true })
    if (normalized.error) return res.status(400).json({ error: normalized.error })
    Object.assign(item, normalized.value)
    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'student', item._id, 'UPDATE', {})
    res.json({ student: item })
  } catch (err) {
    next(err)
  }
})

// DELETE /:id — soft
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationStudent.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Étudiant introuvable' })
    item.deletedAt = new Date()
    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'student', item._id, 'DELETE', {})
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
