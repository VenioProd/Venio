import express, { type Request, type Response, type NextFunction } from 'express'
import { EducationClass, EducationStudent, EducationSession, EducationAssignment } from '../../../models/education/index.js'
import { logActivity, ownerFilter, parseListQuery, validId } from './helpers.js'

const router = express.Router()

// GET / — liste des classes
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, skip, sort } = parseListQuery(req, { defaultLimit: 100 })
    const filter: Record<string, unknown> = { ...ownerFilter(req) }
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status
    if (req.query.search) {
      filter.$text = { $search: String(req.query.search) }
    }
    const [items, total] = await Promise.all([
      EducationClass.find(filter).sort(sort).skip(skip).limit(limit),
      EducationClass.countDocuments(filter),
    ])
    res.json({ classes: items, total })
  } catch (err) { next(err) }
})

// POST / — create
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, school, level, program, period, weeklyHours, totalHours, status, color, tags, notes } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Le nom est requis' })
    const created = await EducationClass.create({
      owner: req.user!.id,
      name: name.trim(),
      school: school || '',
      level: level || '',
      program: program || '',
      period: {
        start: period?.start ? new Date(period.start) : null,
        end: period?.end ? new Date(period.end) : null,
      },
      weeklyHours: weeklyHours ?? null,
      totalHours: totalHours ?? null,
      status: status || 'ACTIVE',
      color: color || '#22C55E',
      tags: Array.isArray(tags) ? tags : [],
      notes: notes || '',
    })
    await logActivity(req.user!.id, req.user!.id, 'class', created._id, 'CREATE', { name: created.name })
    res.status(201).json({ class: created })
  } catch (err) { next(err) }
})

// GET /:id — détail + agrégats
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationClass.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Classe introuvable' })

    const [studentCount, sessionCount, assignmentCount, nextSession, openAssignments] = await Promise.all([
      EducationStudent.countDocuments({ classId: item._id, ...ownerFilter(req) }),
      EducationSession.countDocuments({ classId: item._id, ...ownerFilter(req) }),
      EducationAssignment.countDocuments({ classId: item._id, ...ownerFilter(req) }),
      EducationSession.findOne({
        classId: item._id,
        ...ownerFilter(req),
        date: { $gte: new Date() },
        status: { $in: ['PLANIFIEE', 'EN_COURS'] },
      }).sort({ date: 1 }),
      EducationAssignment.countDocuments({
        classId: item._id,
        ...ownerFilter(req),
        status: { $in: ['OUVERT', 'EN_CORRECTION'] },
      }),
    ])

    res.json({
      class: item,
      stats: { studentCount, sessionCount, assignmentCount, openAssignments },
      nextSession,
    })
  } catch (err) { next(err) }
})

// PATCH /:id — update
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationClass.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Classe introuvable' })

    const { name, school, level, program, period, weeklyHours, totalHours, status, color, tags, notes } = req.body
    if (name !== undefined) item.name = name.trim()
    if (school !== undefined) item.school = school
    if (level !== undefined) item.level = level
    if (program !== undefined) item.program = program
    if (period !== undefined) {
      item.period = {
        start: period?.start ? new Date(period.start) : null,
        end: period?.end ? new Date(period.end) : null,
      }
    }
    if (weeklyHours !== undefined) item.weeklyHours = weeklyHours
    if (totalHours !== undefined) item.totalHours = totalHours
    if (status !== undefined) item.status = status
    if (color !== undefined) item.color = color
    if (Array.isArray(tags)) item.tags = tags
    if (notes !== undefined) item.notes = notes
    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'class', item._id, 'UPDATE', {})
    res.json({ class: item })
  } catch (err) { next(err) }
})

// DELETE /:id — soft delete (cascade soft sur enfants)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationClass.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Classe introuvable' })
    const now = new Date()
    item.deletedAt = now
    await item.save()
    await Promise.all([
      EducationStudent.updateMany({ classId: item._id, owner: req.user!.id, deletedAt: null }, { deletedAt: now }),
      EducationSession.updateMany({ classId: item._id, owner: req.user!.id, deletedAt: null }, { deletedAt: now }),
      EducationAssignment.updateMany({ classId: item._id, owner: req.user!.id, deletedAt: null }, { deletedAt: now }),
    ])
    await logActivity(req.user!.id, req.user!.id, 'class', item._id, 'DELETE', {})
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
