import express, { type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import mongoose from 'mongoose'
import {
  EducationStudent,
  EducationClass,
  EducationAssignment,
  EducationSubmission,
  FOLLOW_UP_TYPES,
  type EducationFollowUpType,
} from '../../../models/education/index.js'
import { logActivity, ownerFilter, parseListQuery, validId } from './helpers.js'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } })

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
    const { classId, firstName, lastName, email, phone, externalId, status, tags, notes } = req.body
    if (!validId(classId)) return res.status(400).json({ error: 'classId invalide' })
    if (!lastName?.trim()) return res.status(400).json({ error: 'Le nom est requis' })

    const klass = await EducationClass.findOne({ _id: classId, ...ownerFilter(req) })
    if (!klass) return res.status(404).json({ error: 'Classe introuvable' })

    const created = await EducationStudent.create({
      owner: req.user!.id,
      classId,
      firstName: firstName || '',
      lastName: lastName.trim(),
      email: (email || '').toLowerCase(),
      phone: phone || '',
      externalId: externalId || '',
      status: status || 'ACTIVE',
      tags: Array.isArray(tags) ? tags : [],
      notes: notes || '',
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

    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) return res.status(400).json({ error: 'CSV vide' })

    const header = lines[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase())
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

    const docs: Array<Record<string, unknown>> = []
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(/[,;\t]/).map((c) => c.trim())
      const lastName = cells[idx.lastName] || ''
      if (!lastName) continue
      docs.push({
        owner: req.user!.id,
        classId,
        firstName: idx.firstName >= 0 ? cells[idx.firstName] || '' : '',
        lastName,
        email: idx.email >= 0 ? (cells[idx.email] || '').toLowerCase() : '',
        phone: idx.phone >= 0 ? cells[idx.phone] || '' : '',
        externalId: idx.externalId >= 0 ? cells[idx.externalId] || '' : '',
        status: 'ACTIVE',
        tags: [],
        notes: '',
      })
    }
    if (docs.length === 0) return res.status(400).json({ error: 'Aucune ligne valide' })

    const inserted = await EducationStudent.insertMany(docs)
    await logActivity(req.user!.id, req.user!.id, 'student', classId, 'CREATE', {
      imported: inserted.length,
      kind: 'csv',
    })
    res.status(201).json({ inserted: inserted.length, students: inserted })
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

    const { firstName, lastName, email, phone, externalId, status, tags, notes, averageGrade } = req.body
    if (firstName !== undefined) item.firstName = firstName
    if (lastName !== undefined) item.lastName = lastName.trim()
    if (email !== undefined) item.email = (email || '').toLowerCase()
    if (phone !== undefined) item.phone = phone
    if (externalId !== undefined) item.externalId = externalId
    if (status !== undefined) item.status = status
    if (Array.isArray(tags)) item.tags = tags
    if (notes !== undefined) item.notes = notes
    if (averageGrade !== undefined) item.averageGrade = averageGrade
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
