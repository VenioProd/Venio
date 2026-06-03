import express, { type Request, type Response, type NextFunction } from 'express'
import {
  EducationClass,
  EducationStudent,
  EducationSession,
  EducationAssignment,
  EducationNote,
  CLASS_PROPERTY_TYPES,
} from '../../../models/education/index.js'
import type { IClassProperty, ClassPropertyType } from '../../../models/education/index.js'
import { logActivity, ownerFilter, parseListQuery, validId } from './helpers.js'

const router = express.Router()

/** Normalise une liste de propriétés flexibles venue du client. */
function sanitizeProperties(input: unknown): IClassProperty[] | undefined {
  if (!Array.isArray(input)) return undefined
  return input
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p, i) => {
      const t =
        typeof p.type === 'string' && (CLASS_PROPERTY_TYPES as readonly string[]).includes(p.type)
          ? (p.type as ClassPropertyType)
          : 'text'
      return {
        id: typeof p.id === 'string' && p.id ? p.id : `prop-${Date.now()}-${i}`,
        label: typeof p.label === 'string' ? p.label : '',
        type: t,
        value: typeof p.value === 'string' ? p.value : '',
      }
    })
}

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
  } catch (err) {
    next(err)
  }
})

// POST / — create
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      emoji,
      cover,
      school,
      level,
      program,
      period,
      weeklyHours,
      totalHours,
      status,
      color,
      tags,
      properties,
      notes,
    } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Le nom est requis' })
    const created = await EducationClass.create({
      owner: req.user!.id,
      name: name.trim(),
      emoji: emoji || '',
      cover: cover || '',
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
      properties: sanitizeProperties(properties) ?? [],
      notes: notes || '',
    })
    await logActivity(req.user!.id, req.user!.id, 'class', created._id, 'CREATE', { name: created.name })
    res.status(201).json({ class: created })
  } catch (err) {
    next(err)
  }
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
  } catch (err) {
    next(err)
  }
})

// GET /:id/home — page racine de la classe (canvas de blocs), créée à la volée.
// Centralise le contenu libre de la classe façon page Notion.
router.get('/:id/home', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const klass = await EducationClass.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!klass) return res.status(404).json({ error: 'Classe introuvable' })

    // Page existante encore valide ?
    if (klass.homeNote) {
      const existing = await EducationNote.findOne({ _id: klass.homeNote, ...ownerFilter(req), deletedAt: null })
      if (existing) return res.json({ note: existing })
    }

    // Sinon on crée la page racine, liée à la classe. Si la classe avait des
    // « notes internes » en texte brut, on les reprend pour ne rien perdre.
    const seedBlocks = (klass.notes || '').split('\n').map((line, i) => ({
      id: `b-${Date.now().toString(36)}-${i}`,
      type: 'paragraph' as const,
      text: line,
      checked: false,
      level: 1,
      meta: {},
    }))
    if (seedBlocks.length === 0) {
      seedBlocks.push({
        id: `b-${Date.now().toString(36)}-0`,
        type: 'paragraph' as const,
        text: '',
        checked: false,
        level: 1,
        meta: {},
      })
    }
    const created = await EducationNote.create({
      owner: req.user!.id,
      title: klass.name,
      emoji: klass.emoji || '',
      blocks: seedBlocks,
      markdown: klass.notes || '',
      links: [{ type: 'class', refId: klass._id }],
      parentNote: null,
    })
    klass.homeNote = created._id
    await klass.save()
    res.json({ note: created })
  } catch (err) {
    next(err)
  }
})

// PATCH /:id — update
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationClass.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Classe introuvable' })

    const {
      name,
      emoji,
      cover,
      school,
      level,
      program,
      period,
      weeklyHours,
      totalHours,
      status,
      color,
      tags,
      properties,
      notes,
    } = req.body
    if (name !== undefined) item.name = name.trim()
    if (emoji !== undefined) item.emoji = emoji
    if (cover !== undefined) item.cover = cover
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
    {
      const sp = sanitizeProperties(properties)
      if (sp) item.properties = sp
    }
    if (notes !== undefined) item.notes = notes
    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'class', item._id, 'UPDATE', {})
    res.json({ class: item })
  } catch (err) {
    next(err)
  }
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
      // Page racine + sous-pages (toutes liées à la classe) → soft-delete.
      EducationNote.updateMany(
        { owner: req.user!.id, deletedAt: null, 'links.type': 'class', 'links.refId': item._id },
        { deletedAt: now },
      ),
    ])
    await logActivity(req.user!.id, req.user!.id, 'class', item._id, 'DELETE', {})
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
