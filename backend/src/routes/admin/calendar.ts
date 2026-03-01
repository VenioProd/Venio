import express, { Request, Response, NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import Task from '../../models/Task.js'
import Project from '../../models/Project.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET /api/admin/calendar/events?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start, end } = req.query as Record<string, string | undefined>

    if (!start || !end) {
      return res.status(400).json({ error: 'Les paramètres start et end sont requis (YYYY-MM-DD).' })
    }

    const startDate = new Date(start)
    const endDate = new Date(end)
    endDate.setHours(23, 59, 59, 999)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Format de date invalide.' })
    }

    const events: Array<{
      id: string
      type: string
      title: string
      date: string
      projectId: unknown
      projectName: string
      metadata?: Record<string, unknown>
    }> = []

    // 1. Tasks with dueDate in range
    const tasks = await Task.find({
      dueDate: { $gte: startDate, $lte: endDate },
    }).populate('project', 'name')

    for (const task of tasks) {
      events.push({
        id: `task_${task._id}`,
        type: 'task',
        title: task.title,
        date: task.dueDate!.toISOString().slice(0, 10),
        projectId: (task.project as any)?._id || task.project,
        projectName: (task.project as any)?.name || '',
        metadata: {
          status: task.status,
          priority: task.priority,
        },
      })
    }

    // 2. Projects with deadlines in range
    const projectsWithDeadlines = await Project.find({
      'deadlines.dueAt': { $gte: startDate, $lte: endDate },
    })

    for (const project of projectsWithDeadlines) {
      for (const dl of project.deadlines) {
        if (dl.dueAt && dl.dueAt >= startDate && dl.dueAt <= endDate) {
          events.push({
            id: `deadline_${project._id}_${(dl as any)._id}`,
            type: 'deadline',
            title: dl.label || 'Deadline',
            date: dl.dueAt.toISOString().slice(0, 10),
            projectId: project._id,
            projectName: project.name,
          })
        }
      }
    }

    // 3. Project start dates in range
    const projectsStarting = await Project.find({
      startDate: { $gte: startDate, $lte: endDate },
    })

    for (const project of projectsStarting) {
      events.push({
        id: `project_start_${project._id}`,
        type: 'project_start',
        title: `Début: ${project.name}`,
        date: project.startDate!.toISOString().slice(0, 10),
        projectId: project._id,
        projectName: project.name,
      })
    }

    // 4. Project end dates in range
    const projectsEnding = await Project.find({
      endDate: { $gte: startDate, $lte: endDate },
    })

    for (const project of projectsEnding) {
      events.push({
        id: `project_end_${project._id}`,
        type: 'project_end',
        title: `Fin: ${project.name}`,
        date: project.endDate!.toISOString().slice(0, 10),
        projectId: project._id,
        projectName: project.name,
      })
    }

    // Sort events by date
    events.sort((a, b) => a.date.localeCompare(b.date))

    return res.json({ events })
  } catch (err) {
    return next(err)
  }
})

export default router
