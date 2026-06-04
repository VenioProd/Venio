import express, { Request, Response, NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import WorkspaceLayout from '../../models/WorkspaceLayout.js'
import PersonalTask from '../../models/PersonalTask.js'
import WorkspaceNote from '../../models/WorkspaceNote.js'
import Task from '../../models/Task.js'
import InboxPin from '../../models/InboxPin.js'
import Notification from '../../models/Notification.js'
import { computeRoleKpis } from '../../services/workspaceKpis.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

// ─── Layout ───────────────────────────────────────────────────────────────
router.get('/layout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const found = await WorkspaceLayout.findOne({ userId }).lean()
    const layout = found ?? await WorkspaceLayout.create({ userId })
    res.json(layout)
  } catch (e) {
    next(e)
  }
})

router.put('/layout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const { widgets, shortcuts, dailyGoal } = req.body
    const update: Record<string, unknown> = {}
    if (widgets !== undefined) update.widgets = widgets
    if (shortcuts !== undefined) update.shortcuts = shortcuts
    if (dailyGoal !== undefined) update.dailyGoal = dailyGoal
    const layout = await WorkspaceLayout.findOneAndUpdate(
      { userId },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
    res.json(layout)
  } catch (e) {
    next(e)
  }
})

// ─── Personal tasks (+ tâches projet assignées) ─────────────────────────────
router.get('/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const VALID_PERSONAL_STATUS = ['A_FAIRE', 'EN_COURS', 'TERMINE']
    const status = req.query.status as string | undefined
    const validStatus = status && VALID_PERSONAL_STATUS.includes(status) ? status : undefined
    const personalFilter: Record<string, unknown> = { userId, isArchived: false }
    if (validStatus) personalFilter.status = validStatus
    const personal = await PersonalTask.find(personalFilter).sort({ order: 1, createdAt: -1 }).limit(200).lean()

    const projectFilter: Record<string, unknown> = { assignee: userId }
    if (status) projectFilter.status = status
    const projectTasks = await Task.find(projectFilter)
      .sort({ dueDate: 1 })
      .limit(50)
      .populate('project', 'name')
      .lean()

    const merged = [
      ...personal.map((t) => ({ ...t, source: 'PERSONAL' as const })),
      ...projectTasks.map((t) => ({ ...t, source: 'PROJECT' as const })),
    ]
    res.json(merged)
  } catch (e) {
    next(e)
  }
})

router.post('/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const { title, description, status, priority, dueDate, order } = req.body
    if (!title || !String(title).trim()) {
      res.status(400).json({ error: 'Titre requis' })
      return
    }
    const task = await PersonalTask.create({ userId, title, description, status, priority, dueDate, order })
    res.status(201).json(task)
  } catch (e) {
    next(e)
  }
})

router.patch('/tasks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const allowed = ['title', 'description', 'status', 'priority', 'dueDate', 'order', 'isArchived']
    const update: Record<string, unknown> = {}
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k]
    const task = await PersonalTask.findOneAndUpdate({ _id: req.params.id, userId }, { $set: update }, { new: true })
    if (!task) {
      res.status(404).json({ error: 'Introuvable' })
      return
    }
    res.json(task)
  } catch (e) {
    next(e)
  }
})

router.delete('/tasks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const r = await PersonalTask.findOneAndDelete({ _id: req.params.id, userId })
    if (!r) {
      res.status(404).json({ error: 'Introuvable' })
      return
    }
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

// ─── Notes (NOTE | POSTIT | DRAFT | IDEA) ───────────────────────────────────
router.get('/notes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const filter: Record<string, unknown> = { userId }
    if (req.query.type) filter.type = req.query.type
    const notes = await WorkspaceNote.find(filter).sort({ pinned: -1, order: 1, updatedAt: -1 }).lean()
    res.json(notes)
  } catch (e) {
    next(e)
  }
})

router.post('/notes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const { type, title, content, color, pinned, order, tags } = req.body
    if (!['NOTE', 'POSTIT', 'DRAFT', 'IDEA'].includes(type)) {
      res.status(400).json({ error: 'Type invalide' })
      return
    }
    const note = await WorkspaceNote.create({ userId, type, title, content, color, pinned, order, tags })
    res.status(201).json(note)
  } catch (e) {
    next(e)
  }
})

router.patch('/notes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const allowed = ['title', 'content', 'color', 'pinned', 'order', 'tags', 'status']
    const update: Record<string, unknown> = {}
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k]
    const note = await WorkspaceNote.findOneAndUpdate({ _id: req.params.id, userId }, { $set: update }, { new: true })
    if (!note) {
      res.status(404).json({ error: 'Introuvable' })
      return
    }
    res.json(note)
  } catch (e) {
    next(e)
  }
})

router.delete('/notes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const r = await WorkspaceNote.findOneAndDelete({ _id: req.params.id, userId })
    if (!r) {
      res.status(404).json({ error: 'Introuvable' })
      return
    }
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

router.post('/notes/:id/convert', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const idea = await WorkspaceNote.findOne({ _id: req.params.id, userId, type: 'IDEA' })
    if (!idea) {
      res.status(404).json({ error: 'Idée introuvable' })
      return
    }
    const task = await PersonalTask.create({
      userId,
      title: idea.title || idea.content.slice(0, 80) || 'Idée',
      description: idea.content,
      sourceIdeaId: idea._id,
    })
    idea.status = 'CONVERTED'
    await idea.save()
    res.status(201).json(task)
  } catch (e) {
    next(e)
  }
})

// ─── Overview (agrégat 1 appel) ─────────────────────────────────────────────
router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const role = req.user!.role as string
    const now = new Date()
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const [kpis, overdue, week, pinned, activity] = await Promise.all([
      computeRoleKpis(userId, role),
      Task.find({ assignee: userId, status: { $ne: 'TERMINE' }, dueDate: { $lt: now, $ne: null } })
        .sort({ dueDate: 1 })
        .limit(10)
        .populate('project', 'name')
        .lean(),
      Task.find({ assignee: userId, status: { $ne: 'TERMINE' }, dueDate: { $gte: now, $lte: weekEnd } })
        .sort({ dueDate: 1 })
        .limit(20)
        .populate('project', 'name')
        .lean(),
      InboxPin.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
      Notification.find({ recipient: userId }).sort({ createdAt: -1 }).limit(10).lean(),
    ])

    res.json({ kpis, overdue, week, pinned, activity })
  } catch (e) {
    next(e)
  }
})

export default router
