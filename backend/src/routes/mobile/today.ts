import express, { type NextFunction, type Request, type Response } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import Lead from '../../models/Lead.js'
import Interaction from '../../models/Interaction.js'
import mongoose from 'mongoose'
import Task from '../../models/Task.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import logger from '../../lib/logger.js'
import { leadScopeFilter } from '../../lib/crmScope.js'

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
    const taskMeetings = (async () => {
      const [tasks, total] = await Promise.all([
        Task.aggregate<{
          _id: mongoose.Types.ObjectId
          title: string
          project: mongoose.Types.ObjectId
          startsAt: Date
          projects: { name: string }[]
        }>([
          { $match: { ...meetingFilter, assignee: new mongoose.Types.ObjectId(req.user!.id) } },
          {
            $addFields: {
              startsAt: {
                $cond: [
                  { $and: [{ $gte: ['$startDate', start] }, { $lt: ['$startDate', end] }] },
                  '$startDate',
                  '$dueDate',
                ],
              },
            },
          },
          { $sort: { startsAt: 1, _id: 1 } },
          { $limit: 50 },
          {
            $lookup: {
              from: 'projects',
              localField: 'project',
              foreignField: '_id',
              as: 'projects',
              pipeline: [{ $project: { name: 1 } }],
            },
          },
        ]),
        Task.countDocuments(meetingFilter),
      ])
      return {
        items: tasks.map((task) => ({
          id: `task_${task._id}`,
          source: 'task',
          title: task.title,
          startsAt: task.startsAt.toISOString(),
          endsAt: null,
          lead: null,
          projectId: String(task.project),
          projectName: task.projects[0]?.name ?? null,
        })),
        total,
      }
    })().catch((err: unknown) => {
      logger.warn({ err }, 'Lecture du calendrier indisponible')
      return { items: [], total: 0 }
    })
    const interactionMeetings = (async () => {
      const filter = { author: req.user!.id, kind: 'MEETING', occurredAt: { $gte: start, $lt: end } }
      const [items, total] = await Promise.all([
        Interaction.find(filter).sort({ occurredAt: 1, _id: 1 }).limit(50).lean(),
        Interaction.countDocuments(filter),
      ])
      const linkedLeads = await Lead.find({
        _id: { $in: items.filter((item) => item.subjectType === 'LEAD').map((item) => item.subjectId) },
      })
        .select('company')
        .lean()
      const leadById = new Map(
        linkedLeads.map((lead) => [String(lead._id), { id: String(lead._id), company: lead.company }]),
      )
      return {
        items: items.map((item) => ({
          id: String(item._id),
          source: 'interaction',
          title: item.subject || 'Rendez-vous',
          startsAt: item.occurredAt.toISOString(),
          endsAt: item.endsAt?.toISOString() ?? null,
          lead: item.subjectType === 'LEAD' ? (leadById.get(String(item.subjectId)) ?? null) : null,
          projectId: null,
          projectName: null,
        })),
        total,
      }
    })().catch((err: unknown) => {
      logger.warn({ err }, 'Lecture des rendez-vous indisponible')
      return { items: [], total: 0 }
    })
    const meetings = Promise.all([taskMeetings, interactionMeetings]).then(([tasks, interactions]) => ({
      items: [...tasks.items, ...interactions.items]
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id))
        .slice(0, 50),
      total: tasks.total + interactions.total,
    }))
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
            $and: [leadScopeFilter(req)],
          },
          { createdAt: -1, _id: 1 },
        ),
        meetings,
        QuoteProposal.find(quoteFilter)
          .select('_id reference project client title status expiresAt firstViewedAt createdBy createdAt updatedAt')
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
