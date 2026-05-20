import express, { type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import { EducationStudent, EducationClass } from '../../../models/education/index.js'
import { logActivity, ownerFilter, parseListQuery, validId } from './helpers.js'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } })

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
  } catch (err) { next(err) }
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
  } catch (err) { next(err) }
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

    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
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
    await logActivity(req.user!.id, req.user!.id, 'student', classId, 'CREATE', { imported: inserted.length, kind: 'csv' })
    res.status(201).json({ inserted: inserted.length, students: inserted })
  } catch (err) { next(err) }
})

// GET /:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationStudent.findOne({ _id: req.params.id, ...ownerFilter(req) }).populate('classId', 'name color')
    if (!item) return res.status(404).json({ error: 'Étudiant introuvable' })
    res.json({ student: item })
  } catch (err) { next(err) }
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
  } catch (err) { next(err) }
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
  } catch (err) { next(err) }
})

export default router
