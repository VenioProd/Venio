import express, { type NextFunction, type Request, type Response } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import Lead from '../../models/Lead.js'
import Task from '../../models/Task.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import logger from '../../lib/logger.js'

const router = express.Router()
router.use(auth, requireAdmin, requirePermission(PERMISSIONS.VIEW_CRM))
const LEAD_SELECT =
  '_id company contactName contactEmail contactPhone status leadTemperature nextActionAt assignedTo source createdAt updatedAt'

function dayBounds(now: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  function dateKey(date: Date) {
    const p = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]))
    return Number(`${p.year}${p.month}${p.day}`)
  }
  const p = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]))
  const midnight = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))
  function boundary(target: number) {
    const targetKey = Number(new Date(target).toISOString().slice(0, 10).replaceAll('-', ''))
    let low = target - 36 * 3600000
    let high = target + 36 * 3600000
    // Chercher le premier instant du jour couvre aussi les fuseaux dont le minuit est sauté.
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (dateKey(new Date(middle)) < targetKey) low = middle + 1
      else high = middle
    }
    return new Date(low)
  }
  return { start: boundary(midnight), end: boundary(midnight + 86400000) }
}

async function leads(filter: Record<string, unknown>, sort: Record<string, 1 | -1>) {
  const [items, total] = await Promise.all([
    Lead.find(filter).select(LEAD_SELECT).sort(sort).limit(50).lean(),
    Lead.countDocuments(filter),
  ])
  return { items, total }
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tz = req.query.tz ?? 'Europe/Paris'
    let bounds: ReturnType<typeof dayBounds>
    try {
      if (typeof tz !== 'string' || /^[+-]/.test(tz)) throw new Error('Fuseau invalide')
      bounds = dayBounds(new Date(Date.now()), tz)
    } catch {
      return res.status(400).json({ error: 'Fuseau horaire invalide', code: 'INVALID_TIMEZONE' })
    }
    const { start, end } = bounds
    const mine = { assignedTo: req.user!.id, status: { $nin: ['WON', 'LOST'] } }
    const meetingFilter = { assignee: req.user!.id, dueDate: { $gte: start, $lt: end } }
    const meetings = (async () => {
      const [tasks, total] = await Promise.all([
        Task.find(meetingFilter)
          .select('_id title dueDate project status priority')
          .populate('project', 'name')
          .sort({ dueDate: 1, _id: 1 })
          .limit(50)
          .lean(),
        Task.countDocuments(meetingFilter),
      ])
      return {
        items: tasks.map((task) => {
          const project = task.project as unknown as { _id: unknown; name?: string } | null
          return {
            id: `task_${task._id}`,
            type: 'task',
            title: task.title,
            date: task.dueDate!.toISOString().slice(0, 10),
            projectId: project?._id ?? task.project,
            projectName: project?.name ?? '',
            metadata: { status: task.status, priority: task.priority },
          }
        }),
        total,
      }
    })().catch((err: unknown) => {
      logger.warn({ err }, 'Lecture du calendrier indisponible')
      return { items: [], total: 0 }
    })
    const quoteFilter = {
      createdBy: req.user!.id,
      status: 'SENT',
      firstViewedAt: { $ne: null },
    }
    const [overdue, today, hotLeadsWithoutAction, newInboundLeads, meetingResult, quoteItems, quoteTotal] =
      await Promise.all([
        leads({ ...mine, nextActionAt: { $lt: start, $ne: null } }, { nextActionAt: 1, _id: 1 }),
        leads({ ...mine, nextActionAt: { $gte: start, $lt: end } }, { nextActionAt: 1, _id: 1 }),
        leads(
          { ...mine, leadTemperature: { $in: ['CHAUD', 'TRES_CHAUD'] }, nextActionAt: null },
          { updatedAt: -1, _id: 1 },
        ),
        leads(
          {
            source: 'FORMULAIRE_SITE',
            createdAt: { $gte: new Date(Date.now() - 7 * 86400000) },
            $or: [{ assignedTo: null }, { assignedTo: req.user!.id }],
          },
          { createdAt: -1, _id: 1 },
        ),
        meetings,
        QuoteProposal.find(quoteFilter)
          .select('_id project client title status expiresAt firstViewedAt createdBy createdAt updatedAt')
          .sort({ updatedAt: -1, _id: 1 })
          .limit(50)
          .lean(),
        QuoteProposal.countDocuments(quoteFilter),
      ])
    return res.json({
      followUps: { overdue, today },
      meetings: meetingResult,
      hotLeadsWithoutAction,
      newInboundLeads,
      quotesViewedNotSigned: { items: quoteItems, total: quoteTotal },
    })
  } catch (err) {
    return next(err)
  }
})
export default router
