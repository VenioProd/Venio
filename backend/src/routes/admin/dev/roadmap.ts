import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import DevProject from '../../../models/DevProject.js'
import DevIssue from '../../../models/DevIssue.js'
import { CLOSED_ISSUE_STATUSES } from '../../../lib/dev/issueMutations.js'

const router = express.Router()

// GET /api/admin/dev/roadmap
//
// Vue agregee « feuilles de route » :
// pour chaque projet actif on renvoie ses compteurs, les issues actives
// (IN_PROGRESS + IN_REVIEW), la queue (BACKLOG + TODO) triee par priorite/
// dueDate, et les dernieres issues terminees. Pensee pour alimenter une
// section unique du dashboard sans devoir faire N requetes cote front.
router.get(
  '/roadmap',
  requirePermission(PERMISSIONS.VIEW_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const includeArchived = req.query.includeArchived === 'true'
      const upcomingLimit = clampInt(req.query.upcomingLimit, 5, 1, 20)
      const recentLimit = clampInt(req.query.recentLimit, 5, 1, 20)
      const activeLimit = clampInt(req.query.activeLimit, 10, 1, 50)

      const projectFilter: Record<string, unknown> = {}
      if (!includeArchived) projectFilter.status = { $ne: 'ARCHIVED' }

      const projects = await DevProject.find(projectFilter)
        .populate('lead', 'name email avatarUrl')
        .sort({ status: 1, updatedAt: -1 })
        .lean()

      if (projects.length === 0) {
        return res.json({ projects: [], generatedAt: new Date().toISOString() })
      }

      const projectIds = projects.map((p) => p._id)
      const now = new Date()
      const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

      // Agregations massivement parallelisables : un seul appel par requete,
      // toutes scopees sur les projets renvoyes.
      const [
        countsByProjectStatus,
        overdueByProject,
        activeRaw,
        upcomingRaw,
        recentRaw,
      ] = await Promise.all([
        DevIssue.aggregate([
          { $match: { project: { $in: projectIds }, archivedAt: null } },
          { $group: { _id: { project: '$project', status: '$status' }, count: { $sum: 1 } } },
        ]),
        DevIssue.aggregate([
          {
            $match: {
              project: { $in: projectIds },
              archivedAt: null,
              dueDate: { $ne: null, $lt: now },
              status: { $nin: CLOSED_ISSUE_STATUSES },
            },
          },
          { $group: { _id: '$project', count: { $sum: 1 } } },
        ]),
        // Active : on prend large puis on tri en memoire par rang de priorite
        // (impossible a faire en sort Mongo car priority est un string).
        DevIssue.find({
          project: { $in: projectIds },
          archivedAt: null,
          status: { $in: ['IN_PROGRESS', 'IN_REVIEW'] },
        })
          .populate('assignee', 'name email avatarUrl')
          .populate('project', 'key name color')
          .limit(Math.min(500, activeLimit * projects.length * 4))
          .lean(),
        DevIssue.find({
          project: { $in: projectIds },
          archivedAt: null,
          status: { $in: ['TODO', 'BACKLOG'] },
        })
          .populate('assignee', 'name email avatarUrl')
          .populate('project', 'key name color')
          .limit(Math.min(500, upcomingLimit * projects.length * 4))
          .lean(),
        DevIssue.find({
          project: { $in: projectIds },
          archivedAt: null,
          status: 'DONE',
          completedAt: { $gte: since14 },
        })
          .populate('assignee', 'name email avatarUrl')
          .populate('project', 'key name color')
          .sort({ completedAt: -1 })
          .limit(recentLimit * projects.length)
          .lean(),
      ])

      // Tri en JS : IN_PROGRESS avant IN_REVIEW, puis priorite, puis recence.
      activeRaw.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'IN_PROGRESS' ? -1 : 1
        const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        if (pr !== 0) return pr
        return b.updatedAt.getTime() - a.updatedAt.getTime()
      })
      upcomingRaw.sort((a, b) => {
        const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        if (pr !== 0) return pr
        const da = a.dueDate ? a.dueDate.getTime() : Number.POSITIVE_INFINITY
        const db = b.dueDate ? b.dueDate.getTime() : Number.POSITIVE_INFINITY
        if (da !== db) return da - db
        return b.createdAt.getTime() - a.createdAt.getTime()
      })

      // Index par projet
      const countsMap = new Map<string, Record<string, number>>()
      for (const row of countsByProjectStatus) {
        const projectId = String(row._id.project)
        const status = row._id.status as string
        if (!countsMap.has(projectId)) countsMap.set(projectId, {})
        countsMap.get(projectId)![status] = row.count
      }
      const overdueMap = new Map<string, number>()
      for (const row of overdueByProject) overdueMap.set(String(row._id), row.count)

      const activeByProject = groupByProject(activeRaw, activeLimit)
      const upcomingByProject = groupByProject(upcomingRaw, upcomingLimit)
      const recentByProject = groupByProject(recentRaw, recentLimit)

      const out = projects.map((project) => {
        const projectId = String(project._id)
        const counts = countsMap.get(projectId) || {}
        const done = counts.DONE || 0
        const cancelled = counts.CANCELLED || 0
        const duplicate = counts.DUPLICATE || 0
        const inProgress = counts.IN_PROGRESS || 0
        const inReview = counts.IN_REVIEW || 0
        const blocked = counts.BLOCKED || 0
        const todo = counts.TODO || 0
        const backlog = counts.BACKLOG || 0
        const total = done + duplicate + cancelled + inProgress + inReview + blocked + todo + backlog
        const open = inProgress + inReview + blocked + todo + backlog
        const progress = total > 0 ? Math.round((done / total) * 100) : 0

        return {
          project: {
            _id: projectId,
            key: project.key,
            name: project.name,
            color: project.color,
            description: project.description,
            status: project.status,
            lead: project.lead || null,
            updatedAt: project.updatedAt,
          },
          summary: {
            total,
            open,
            done,
            cancelled,
            inProgress,
            inReview,
            blocked,
            todo,
            backlog,
            overdue: overdueMap.get(projectId) || 0,
            progress,
          },
          active: activeByProject.get(projectId) || [],
          upcoming: upcomingByProject.get(projectId) || [],
          recentlyDone: recentByProject.get(projectId) || [],
        }
      })

      // Projets actifs avec du mouvement en premier, archives a la fin.
      out.sort((a, b) => {
        if (a.project.status !== b.project.status) {
          const order = { ACTIVE: 0, PAUSED: 1, ARCHIVED: 2 } as const
          return (order[a.project.status as keyof typeof order] ?? 3) -
            (order[b.project.status as keyof typeof order] ?? 3)
        }
        const aActivity = a.summary.inProgress + a.summary.inReview
        const bActivity = b.summary.inProgress + b.summary.inReview
        if (aActivity !== bActivity) return bActivity - aActivity
        return b.summary.open - a.summary.open
      })

      res.json({ projects: out, generatedAt: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  }
)

const PRIORITY_RANK: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  NO_PRIORITY: 4,
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

type RawIssue = {
  _id: mongoose.Types.ObjectId
  project: { _id: mongoose.Types.ObjectId; key?: string; name?: string; color?: string } | mongoose.Types.ObjectId
  identifier: string
  number: number
  title: string
  type: string
  status: string
  priority: string
  assignee: { _id: mongoose.Types.ObjectId; name?: string; email?: string; avatarUrl?: string } | null
  dueDate: Date | null
  startedAt: Date | null
  completedAt: Date | null
  updatedAt: Date
  github?: { prNumber?: number | null; prUrl?: string | null; prState?: string | null; ciStatus?: string | null } | null
}

function groupByProject(rows: RawIssue[], perProjectLimit: number) {
  const out = new Map<string, ReturnType<typeof slim>[]>()
  for (const row of rows) {
    const projectId = String(
      typeof row.project === 'object' && row.project && '_id' in row.project ? row.project._id : row.project
    )
    if (!out.has(projectId)) out.set(projectId, [])
    const bucket = out.get(projectId)!
    if (bucket.length < perProjectLimit) bucket.push(slim(row))
  }
  return out
}

function slim(issue: RawIssue) {
  return {
    _id: String(issue._id),
    identifier: issue.identifier,
    number: issue.number,
    title: issue.title,
    type: issue.type,
    status: issue.status,
    priority: issue.priority,
    assignee: issue.assignee,
    dueDate: issue.dueDate,
    startedAt: issue.startedAt,
    completedAt: issue.completedAt,
    updatedAt: issue.updatedAt,
    github: issue.github
      ? {
          prNumber: issue.github.prNumber ?? null,
          prUrl: issue.github.prUrl ?? null,
          prState: issue.github.prState ?? null,
          ciStatus: issue.github.ciStatus ?? 'NEUTRAL',
        }
      : null,
  }
}

export default router
