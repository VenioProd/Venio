import express, { Request, Response, NextFunction } from 'express'
import auth from '../middleware/auth.js'
import Project from '../models/Project.js'
import Document from '../models/Document.js'
import ProjectUpdate from '../models/ProjectUpdate.js'
import Task from '../models/Task.js'
import ActivityLog from '../models/ActivityLog.js'

const router = express.Router()

router.use(auth)

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const projects = await Project.find({ client: req.user!.id }).sort({ updatedAt: -1 })
    return res.json({ projects })
  } catch (err) {
    return next(err)
  }
})

// GET /api/projects/task-progress-all — résumé avancement tâches pour tous les projets du client.
// Optimisé en un seul aggregate sur Task (groupé par projet), au lieu d'un
// fetch complet de toutes les tâches puis comptage en mémoire.
router.get('/task-progress-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const projects = await Project.find({ client: req.user!.id }).select('_id').lean()
    const projectIds = projects.map((p) => p._id)

    const grouped = projectIds.length
      ? await Task.aggregate<{ _id: unknown; total: number; done: number }>([
          { $match: { project: { $in: projectIds } } },
          {
            $group: {
              _id: '$project',
              total: { $sum: 1 },
              done: { $sum: { $cond: [{ $eq: ['$status', 'TERMINE'] }, 1, 0] } },
            },
          },
        ])
      : []

    const result: Record<string, { total: number; done: number; percent: number }> = {}
    for (const pid of projectIds) {
      result[String(pid)] = { total: 0, done: 0, percent: 0 }
    }
    for (const g of grouped) {
      const key = String(g._id)
      const percent = g.total > 0 ? Math.round((g.done / g.total) * 100) : 0
      result[key] = { total: g.total, done: g.done, percent }
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

    const project = await Project.findOne({ _id: req.params.id, client: req.user!.id })
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    const [documents, updates] = await Promise.all([
      Document.find({ project: project._id }).sort({ uploadedAt: -1 }),
      ProjectUpdate.find({ project: project._id }).sort({ createdAt: -1 }),
    ])

    return res.json({ project, documents, updates })
  } catch (err) {
    return next(err)
  }
})

router.get('/:id/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const project = await Project.findOne({ _id: req.params.id, client: req.user!.id })
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    const documents = await Document.find({ project: project._id }).sort({ uploadedAt: -1 })
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

    const project = await Project.findOne({ _id: req.params.id, client: req.user!.id })
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    const tasks = await Task.find({ project: project._id }).select('status')
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

    const project = await Project.findOne({ _id: req.params.id, client: req.user!.id })
    if (!project) {
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
    ]

    const { limit: limitStr, before } = req.query as Record<string, string | undefined>
    const limit = Math.min(parseInt(limitStr as string) || 20, 50)
    const query: Record<string, unknown> = { project: project._id, action: { $in: clientVisibleActions } }
    if (before) {
      query.createdAt = { $lt: new Date(before) }
    }

    const activities = await ActivityLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actor', 'name')

    return res.json({ activities })
  } catch (err) {
    return next(err)
  }
})

export default router
