import express, { Request, Response, NextFunction } from 'express'
import auth from '../middleware/auth.js'
import Project from '../models/Project.js'
import Document from '../models/Document.js'
import ProjectUpdate from '../models/ProjectUpdate.js'
import Task from '../models/Task.js'
import ActivityLog from '../models/ActivityLog.js'
import ProjectMember from '../models/ProjectMember.js'
import { getProjectAccess } from '../lib/projectAccess.js'

const router = express.Router()

router.use(auth)

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const membershipProjectIds = await ProjectMember.distinct('project', { user: req.user!.id })
    const projects = await Project.find({
      $or: [{ client: req.user!.id }, { _id: { $in: membershipProjectIds } }],
    }).sort({ updatedAt: -1 })
    return res.json({ projects })
  } catch (err) {
    return next(err)
  }
})

// GET /api/projects/task-progress-all — résumé avancement tâches pour tous les projets du client
router.get('/task-progress-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const membershipProjectIds = await ProjectMember.distinct('project', { user: req.user!.id })
    const projects = await Project.find({
      $or: [{ client: req.user!.id }, { _id: { $in: membershipProjectIds } }],
    }).select('_id')
    const projectIds = projects.map((p) => p._id)

    const tasks = await Task.find({ project: { $in: projectIds } }).select('project status')

    const progressMap: Record<string, { total: number; done: number }> = {}
    for (const pid of projectIds) {
      progressMap[pid.toString()] = { total: 0, done: 0 }
    }
    for (const t of tasks) {
      const key = t.project.toString()
      if (progressMap[key]) {
        progressMap[key].total++
        if (t.status === 'TERMINE') progressMap[key].done++
      }
    }

    // Build result: { projectId: { total, done, percent } }
    const result: Record<string, { total: number; done: number; percent: number }> = {}
    for (const [pid, val] of Object.entries(progressMap)) {
      result[pid] = {
        total: val.total,
        done: val.done,
        percent: val.total > 0 ? Math.round((val.done / val.total) * 100) : 0,
      }
    }

    return res.json({ progress: result })
  } catch (err) {
    return next(err)
  }
})

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const access = await getProjectAccess(req.params.id, req.user!.id)
    if (!access) {
      return res.status(404).json({ error: 'Project not found' })
    }

    const [documents, updates] = await Promise.all([
      Document.find({ project: access.project._id }).sort({ uploadedAt: -1 }),
      ProjectUpdate.find({ project: access.project._id }).sort({ createdAt: -1 }),
    ])

    return res.json({ project: access.project, documents, updates, accessRole: access.role })
  } catch (err) {
    return next(err)
  }
})

router.get('/:id/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const access = await getProjectAccess(req.params.id, req.user!.id)
    if (!access) {
      return res.status(404).json({ error: 'Project not found' })
    }

    const documents = await Document.find({ project: access.project._id }).sort({ uploadedAt: -1 })
    return res.json({ documents })
  } catch (err) {
    return next(err)
  }
})

// GET /api/projects/:id/task-progress — résumé avancement tâches pour le client
router.get('/:id/task-progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const access = await getProjectAccess(req.params.id, req.user!.id)
    if (!access) {
      return res.status(404).json({ error: 'Project not found' })
    }

    const tasks = await Task.find({ project: access.project._id }).select('status')
    const total = tasks.length
    const byStatus: Record<string, number> = { A_FAIRE: 0, EN_COURS: 0, EN_REVIEW: 0, TERMINE: 0 }
    for (const t of tasks) {
      if (byStatus[t.status] !== undefined) byStatus[t.status]++
    }
    const percent = total > 0 ? Math.round((byStatus.TERMINE / total) * 100) : 0

    return res.json({ total, byStatus, percent })
  } catch (err) {
    return next(err)
  }
})

// GET /api/projects/:id/activity — activité récente visible par le client
router.get('/:id/activity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const access = await getProjectAccess(req.params.id, req.user!.id)
    if (!access) {
      return res.status(404).json({ error: 'Project not found' })
    }

    // Only show client-safe activity types
    const clientVisibleActions = [
      'STATUS_CHANGED',
      'UPDATE_POSTED',
      'DOCUMENT_UPLOADED',
      'ITEM_CREATED',
      'TASK_CREATED',
      'TASK_MOVED',
      'PHASE_STATUS_CHANGED',
      'PHASE_VALIDATED',
      'PHASE_REVISION_REQUESTED',
    ]

    const { limit: limitStr, before } = req.query as Record<string, string | undefined>
    const limit = Math.min(parseInt(limitStr as string) || 20, 50)
    const query: Record<string, unknown> = { project: access.project._id, action: { $in: clientVisibleActions } }
    if (before) {
      query.createdAt = { $lt: new Date(before) }
    }

    const activities = await ActivityLog.find(query).sort({ createdAt: -1 }).limit(limit).populate('actor', 'name')

    return res.json({ activities })
  } catch (err) {
    return next(err)
  }
})

export default router
