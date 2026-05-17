import express, { type Request, type Response, type NextFunction } from 'express'
import Task from '../../models/Task.js'
import Project from '../../models/Project.js'
import { requireScope } from './_middleware/auth.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour la vue calendrier — agrège les Tasks (par dueDate) et
 * les Projects (par endDate / deliveredAt / reminderAt) dans une plage de
 * dates donnée. Vue de lecture seulement.
 *
 * Scope : read:calendar (lecture seule par design — pour créer un événement,
 * Kuro crée directement la Task / le Project sous-jacent).
 *
 * GET /calendar/events?start=YYYY-MM-DD&end=YYYY-MM-DD&projectId=&assigneeId=
 */

const router = express.Router()

interface CalendarEvent {
  id: string
  title: string
  date: string
  source: 'TASK' | 'PROJECT_END' | 'PROJECT_REMINDER' | 'PROJECT_DELIVERED'
  status?: string
  priority?: string
  assignee?: { _id: string; name: string } | null
  projectId: string
  projectName?: string
  metadata?: Record<string, unknown>
}

router.get(
  '/calendar/events',
  requireScope('read:calendar'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { start, end } = req.query as Record<string, string | undefined>
      if (!start || !end) {
        return respondError(
          res,
          400,
          'VALIDATION_ERROR',
          'Paramètres start et end requis (YYYY-MM-DD ou ISO 8601)'
        )
      }
      const startDate = new Date(start)
      const endDate = new Date(end)
      endDate.setHours(23, 59, 59, 999)
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return respondError(res, 400, 'VALIDATION_ERROR', 'Format de date invalide')
      }

      const taskFilter: Record<string, unknown> = {
        dueDate: { $gte: startDate, $lte: endDate },
      }
      const projectFilter: Record<string, unknown> = {
        $or: [
          { endDate: { $gte: startDate, $lte: endDate } },
          { reminderAt: { $gte: startDate, $lte: endDate } },
          { deliveredAt: { $gte: startDate, $lte: endDate } },
        ],
      }
      if (typeof req.query.projectId === 'string') {
        taskFilter.project = req.query.projectId
        projectFilter._id = req.query.projectId
      }
      if (typeof req.query.assigneeId === 'string') {
        taskFilter.assignee = req.query.assigneeId
      }

      const [tasks, projects] = await Promise.all([
        Task.find(taskFilter)
          .populate('project', 'name')
          .populate('assignee', 'name email')
          .lean(),
        Project.find(projectFilter).select('name endDate reminderAt deliveredAt').lean(),
      ])

      const events: CalendarEvent[] = []

      for (const t of tasks) {
        if (!t.dueDate) continue
        events.push({
          id: `task-${String(t._id)}`,
          title: t.title,
          date: new Date(t.dueDate).toISOString(),
          source: 'TASK',
          status: t.status,
          priority: t.priority,
          assignee: t.assignee
            ? {
                _id: String((t.assignee as unknown as { _id: unknown })._id),
                name: (t.assignee as unknown as { name?: string }).name || '',
              }
            : null,
          projectId: String(t.project && (t.project as unknown as { _id?: unknown })._id
            ? (t.project as unknown as { _id: unknown })._id
            : t.project),
          projectName: (t.project as unknown as { name?: string })?.name,
        })
      }

      for (const p of projects) {
        if (p.endDate && p.endDate >= startDate && p.endDate <= endDate) {
          events.push({
            id: `project-end-${String(p._id)}`,
            title: `Fin prévue : ${p.name}`,
            date: new Date(p.endDate).toISOString(),
            source: 'PROJECT_END',
            projectId: String(p._id),
            projectName: p.name,
          })
        }
        if (p.reminderAt && p.reminderAt >= startDate && p.reminderAt <= endDate) {
          events.push({
            id: `project-reminder-${String(p._id)}`,
            title: `Rappel : ${p.name}`,
            date: new Date(p.reminderAt).toISOString(),
            source: 'PROJECT_REMINDER',
            projectId: String(p._id),
            projectName: p.name,
          })
        }
        if (p.deliveredAt && p.deliveredAt >= startDate && p.deliveredAt <= endDate) {
          events.push({
            id: `project-delivered-${String(p._id)}`,
            title: `Livré : ${p.name}`,
            date: new Date(p.deliveredAt).toISOString(),
            source: 'PROJECT_DELIVERED',
            projectId: String(p._id),
            projectName: p.name,
          })
        }
      }

      events.sort((a, b) => a.date.localeCompare(b.date))
      res.json({ items: events, total: events.length, start: startDate.toISOString(), end: endDate.toISOString() })
    } catch (err) {
      next(err)
    }
  }
)

export default router
