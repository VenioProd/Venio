import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import DevProject, { DEV_PROJECT_STATUSES } from '../../../models/DevProject.js'
import DevIssue from '../../../models/DevIssue.js'
import DevIssueComment from '../../../models/DevIssueComment.js'

const router = express.Router()

const isObjectId = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v)

function sanitizeKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(trimmed)) return null
  return trimmed
}

// GET /api/admin/dev/projects
router.get('/projects', requirePermission(PERMISSIONS.VIEW_DEV), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {}
    const { status } = req.query
    if (typeof status === 'string' && (DEV_PROJECT_STATUSES as readonly string[]).includes(status)) {
      filter.status = status
    }
    const projects = await DevProject.find(filter)
      .populate('lead', 'name email avatarUrl')
      .populate('members', 'name email avatarUrl')
      .populate('createdBy', 'name email')
      .sort({ updatedAt: -1 })
      .lean()

    // Compute open-issue counts per project for the list view
    const ids = projects.map((p) => p._id)
    const counts = ids.length
      ? await DevIssue.aggregate([
          { $match: { project: { $in: ids }, status: { $nin: ['DONE', 'CANCELLED'] } } },
          { $group: { _id: '$project', count: { $sum: 1 } } },
        ])
      : []
    const countMap: Record<string, number> = {}
    for (const c of counts) countMap[String(c._id)] = c.count

    const enriched = projects.map((p) => ({
      ...p,
      openIssues: countMap[String(p._id)] || 0,
    }))
    res.json({ projects: enriched })
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/dev/projects
router.post('/projects', requirePermission(PERMISSIONS.MANAGE_DEV), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = sanitizeKey(req.body?.key)
    if (!key) return res.status(400).json({ error: 'Clé invalide (2-8 majuscules, commence par une lettre)' })

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name) return res.status(400).json({ error: 'Nom requis' })

    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : ''
    const color = typeof req.body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.color)
      ? req.body.color
      : '#7c5cff'
    const lead = isObjectId(req.body?.lead) ? req.body.lead : null
    const members = Array.isArray(req.body?.members)
      ? Array.from(new Set(req.body.members.filter(isObjectId)))
      : []

    const existing = await DevProject.findOne({ key })
    if (existing) return res.status(409).json({ error: `Une clé "${key}" existe déjà` })

    const created = await DevProject.create({
      key,
      name,
      description,
      color,
      lead,
      members,
      createdBy: req.user!.id,
    })

    const populated = await DevProject.findById(created._id)
      .populate('lead', 'name email avatarUrl')
      .populate('members', 'name email avatarUrl')
      .populate('createdBy', 'name email')

    res.status(201).json(populated)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/dev/projects/:id
router.get('/projects/:id', requirePermission(PERMISSIONS.VIEW_DEV), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
    const project = await DevProject.findById(req.params.id)
      .populate('lead', 'name email avatarUrl')
      .populate('members', 'name email avatarUrl role')
      .populate('createdBy', 'name email')
    if (!project) return res.status(404).json({ error: 'Projet introuvable' })
    res.json(project)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/dev/projects/:id
router.patch('/projects/:id', requirePermission(PERMISSIONS.MANAGE_DEV), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
    const project = await DevProject.findById(req.params.id)
    if (!project) return res.status(404).json({ error: 'Projet introuvable' })

    if (typeof req.body?.name === 'string') project.name = req.body.name.trim().slice(0, 120)
    if (typeof req.body?.description === 'string') project.description = req.body.description.trim().slice(0, 2000)
    if (typeof req.body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.color)) project.color = req.body.color
    if (typeof req.body?.status === 'string' && (DEV_PROJECT_STATUSES as readonly string[]).includes(req.body.status)) {
      project.status = req.body.status as typeof project.status
    }
    if (req.body?.lead === null) project.lead = null
    else if (isObjectId(req.body?.lead)) project.lead = new mongoose.Types.ObjectId(req.body.lead)
    if (Array.isArray(req.body?.members)) {
      project.members = Array.from(new Set(req.body.members.filter(isObjectId))).map(
        (id) => new mongoose.Types.ObjectId(id as string)
      )
    }

    await project.save()
    const populated = await DevProject.findById(project._id)
      .populate('lead', 'name email avatarUrl')
      .populate('members', 'name email avatarUrl')
      .populate('createdBy', 'name email')
    res.json(populated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/dev/projects/:id — supprime aussi les issues / commentaires associés
router.delete('/projects/:id', requirePermission(PERMISSIONS.MANAGE_DEV), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
    const project = await DevProject.findById(req.params.id)
    if (!project) return res.status(404).json({ error: 'Projet introuvable' })

    await DevIssueComment.deleteMany({ project: project._id })
    await DevIssue.deleteMany({ project: project._id })
    await project.deleteOne()

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
