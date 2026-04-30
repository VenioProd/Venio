import express, { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import ArrowSchool from '../../models/ArrowSchool.js'
import User from '../../models/User.js'
import { ADMIN_ROLES } from '../../lib/permissions.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

const STATUSES = ['A_PROSPECTER', 'CONTACTE', 'REPONSE', 'DEMO_PLANIFIEE', 'DEMO_FAITE', 'PROPOSITION', 'SIGNE', 'NON_INTERESSE']
const SCHOOL_TYPES = ['LYCEE', 'BTS_IUT', 'UNIVERSITE', 'ECOLE_SUP', 'CFA', 'AUTRE']
const TEMPERATURES = ['FROID', 'TIEDE', 'CHAUD', 'TRES_CHAUD']

function normalizePayload(body: Record<string, any> = {}) {
  const p: Record<string, any> = {}
  if (body.name !== undefined) p.name = String(body.name || '').trim()
  if (body.schoolType !== undefined && SCHOOL_TYPES.includes(body.schoolType)) p.schoolType = body.schoolType
  if (body.city !== undefined) p.city = String(body.city || '')
  if (body.region !== undefined) p.region = String(body.region || '')
  if (body.studentCount !== undefined) {
    const n = Number(body.studentCount)
    p.studentCount = Number.isNaN(n) ? null : n
  }
  if (body.emailGeneral !== undefined) p.emailGeneral = String(body.emailGeneral || '')
  if (body.contactName !== undefined) p.contactName = String(body.contactName || '')
  if (body.contactRole !== undefined) p.contactRole = String(body.contactRole || '')
  if (body.contactEmail !== undefined) p.contactEmail = String(body.contactEmail || '')
  if (body.contactPhone !== undefined) p.contactPhone = String(body.contactPhone || '')
  if (body.status !== undefined && STATUSES.includes(body.status)) p.status = body.status
  if (body.temperature !== undefined && TEMPERATURES.includes(body.temperature)) p.temperature = body.temperature
  if (body.source !== undefined) p.source = String(body.source || '')
  if (body.notes !== undefined) p.notes = String(body.notes || '')
  if (body.nextActionAt !== undefined) p.nextActionAt = body.nextActionAt ? new Date(body.nextActionAt) : null
  if (body.lastContactAt !== undefined) p.lastContactAt = body.lastContactAt ? new Date(body.lastContactAt) : null
  if (body.assignedTo !== undefined) p.assignedTo = body.assignedTo || null
  if (body.relances !== undefined && Array.isArray(body.relances)) {
    p.relances = body.relances.slice(0, 3).map((r: any) => ({
      date: r.date ? new Date(r.date) : null,
      done: Boolean(r.done),
      note: String(r.note || ''),
    }))
  }
  return p
}

// GET /api/admin/arrow-prospection — liste + pipeline
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, assignedTo, search, archived } = req.query as Record<string, string>
    const filter: Record<string, any> = { isArchived: archived === 'true' ? true : false }
    if (status) filter.status = status
    if (assignedTo) filter.assignedTo = assignedTo
    if (search) filter.name = { $regex: search, $options: 'i' }

    const schools = await ArrowSchool.find(filter)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .sort({ updatedAt: -1 })

    // Grouper par statut pour la vue kanban
    const pipeline: Record<string, any[]> = {}
    for (const s of STATUSES) pipeline[s] = []
    for (const school of schools) pipeline[(school as any).status].push(school)

    const admins = await User.find({ role: { $in: ADMIN_ROLES } }).select('_id name email')

    return res.json({ schools, pipeline, admins, total: schools.length })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/arrow-prospection
router.post(
  '/',
  body('name').trim().notEmpty().withMessage('Le nom de l\'école est requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg })

      const payload = normalizePayload(req.body)
      payload.createdBy = req.user!.id
      if (!payload.assignedTo) payload.assignedTo = req.user!.id
      payload.statusChangedAt = new Date()

      const school = await ArrowSchool.create(payload)
      const populated = await ArrowSchool.findById(school._id)
        .populate('assignedTo', 'name email')
        .populate('createdBy', 'name email')

      return res.status(201).json({ school: populated })
    } catch (err) {
      return next(err)
    }
  }
)

// GET /api/admin/arrow-prospection/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const school = await ArrowSchool.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
    if (!school) return res.status(404).json({ error: 'École introuvable' })
    return res.json({ school })
  } catch (err) {
    return next(err)
  }
})

// PATCH /api/admin/arrow-prospection/:id
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const school = await ArrowSchool.findById(req.params.id)
    if (!school) return res.status(404).json({ error: 'École introuvable' })

    const payload = normalizePayload(req.body)

    if (payload.status && payload.status !== (school as any).status) {
      payload.statusChangedAt = new Date()
    }

    Object.assign(school, payload)
    await school.save()

    const populated = await ArrowSchool.findById(school._id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')

    return res.json({ school: populated })
  } catch (err) {
    return next(err)
  }
})

// DELETE /api/admin/arrow-prospection/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const school = await ArrowSchool.findById(req.params.id)
    if (!school) return res.status(404).json({ error: 'École introuvable' })
    await school.deleteOne()
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

// PATCH /api/admin/arrow-prospection/:id/archive
router.patch('/:id/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const school = await ArrowSchool.findByIdAndUpdate(
      req.params.id,
      { isArchived: true },
      { new: true }
    )
    if (!school) return res.status(404).json({ error: 'École introuvable' })
    return res.json({ school })
  } catch (err) {
    return next(err)
  }
})

export default router
