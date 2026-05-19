import mongoose from 'mongoose'
import DevIssue, {
  DEV_ISSUE_STATUSES,
  DEV_ISSUE_PRIORITIES,
  type DevIssueStatus,
} from '../../models/DevIssue.js'
import DevProject from '../../models/DevProject.js'

export const STATUS_WEIGHT: Record<DevIssueStatus, number> = {
  BACKLOG: 0,
  TODO: 10,
  IN_PROGRESS: 50,
  IN_REVIEW: 80,
  DONE: 100,
  CANCELLED: 0,
}

/**
 * Calcule un pourcentage 0-100 (arrondi entier) à partir d'un compte par
 * statut. CANCELLED est ignoré au numérateur ET au dénominateur.
 */
export function computeProgress(byStatus: Record<DevIssueStatus, number>): number {
  let weighted = 0
  let nonCancelled = 0
  for (const [status, count] of Object.entries(byStatus) as [DevIssueStatus, number][]) {
    if (status === 'CANCELLED') continue
    weighted += STATUS_WEIGHT[status] * count
    nonCancelled += count
  }
  if (nonCancelled === 0) return 0
  return Math.round(weighted / nonCancelled)
}

export type ProjectHealth = 'on_track' | 'at_risk' | 'blocked'

export interface HealthSignals {
  blocked: number
  urgent: number
}

/**
 * Heuristique provisoire :
 *   blocked > 0             → 'blocked'
 *   urgent > 0 && progress < 50 → 'at_risk'
 *   sinon                   → 'on_track'
 */
export function computeHealth(signals: HealthSignals, progress: number): ProjectHealth {
  if (signals.blocked > 0) return 'blocked'
  if (signals.urgent > 0 && progress < 50) return 'at_risk'
  return 'on_track'
}

export interface StatsPayload {
  total: number
  open: number
  completedRecent: number // alias rétro-compat de completed14d
  completed7d: number
  completed14d: number
  urgent: number
  blocked: number
  totalProjects: number
  velocity14d: number
  byStatus: Record<string, number>
  byPriority: Record<string, number>
}

const BLOCKED_LABELS = ['blocked', 'blocker']
const CLOSED_STATUSES = ['DONE', 'CANCELLED'] as const

export async function computeStats(
  match: Record<string, unknown> = {}
): Promise<StatsPayload> {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const since14 = new Date(now - 14 * day)
  const since7 = new Date(now - 7 * day)
  const openMatch = { ...match, status: { $nin: CLOSED_STATUSES } }

  const [byStatusAgg, byPriorityAgg, total, openCount, totalProjects, urgent, blocked, completed7d, completed14d] =
    await Promise.all([
      DevIssue.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      DevIssue.aggregate([{ $match: match }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
      DevIssue.countDocuments(match),
      DevIssue.countDocuments(openMatch),
      DevProject.countDocuments({ status: { $ne: 'ARCHIVED' } }),
      DevIssue.countDocuments({ ...openMatch, priority: 'URGENT' }),
      DevIssue.countDocuments({
        ...openMatch,
        labels: { $in: BLOCKED_LABELS.map((l) => new RegExp(`^${l}$`, 'i')) },
      }),
      DevIssue.countDocuments({ ...match, status: 'DONE', completedAt: { $gte: since7 } }),
      DevIssue.countDocuments({ ...match, status: 'DONE', completedAt: { $gte: since14 } }),
    ])

  const byStatus: Record<string, number> = {}
  for (const s of DEV_ISSUE_STATUSES) byStatus[s] = 0
  for (const row of byStatusAgg) byStatus[row._id as string] = row.count

  const byPriority: Record<string, number> = {}
  for (const p of DEV_ISSUE_PRIORITIES) byPriority[p] = 0
  for (const row of byPriorityAgg) byPriority[row._id as string] = row.count

  return {
    total,
    open: openCount,
    completedRecent: completed14d,
    completed7d,
    completed14d,
    urgent,
    blocked,
    totalProjects,
    velocity14d: Math.round((completed14d / 14) * 100) / 100,
    byStatus,
    byPriority,
  }
}

export interface ProjectCounts {
  total: number
  open: number
  done: number
  cancelled: number
  urgent: number
  blocked: number
  byStatus: Record<DevIssueStatus, number>
}

export interface OverviewProject {
  _id: string
  key: string
  name: string
  color: string
  status: string
  lead: { _id: string; name: string; email: string } | null
  counts: ProjectCounts
  progress: number
  health: ProjectHealth
  lastActivityAt: string
}

export interface OverviewKpis {
  totalProjects: number
  activeProjects: number
  totalOpen: number
  urgent: number
  blocked: number
  completed7d: number
  completed14d: number
  velocity14d: number
}

export interface OverviewPayload {
  kpis: OverviewKpis
  projects: OverviewProject[]
}

function emptyByStatus(): Record<DevIssueStatus, number> {
  return { BACKLOG: 0, TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0, CANCELLED: 0 }
}

export async function computeOverview(): Promise<OverviewPayload> {
  const projectsRaw = await DevProject.find({})
    .populate<{ lead: { _id: mongoose.Types.ObjectId; name: string; email: string } | null }>(
      'lead',
      'name email'
    )
    .lean()

  const perProjectAgg = await DevIssue.aggregate<{
    _id: mongoose.Types.ObjectId
    byStatus: { status: string; count: number }[]
    urgent: number
    blocked: number
    lastUpdatedAt: Date | null
  }>([
    {
      $group: {
        _id: '$project',
        byStatus: { $push: { status: '$status', count: 1 } },
        urgent: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$priority', 'URGENT'] }, { $not: { $in: ['$status', CLOSED_STATUSES] } }] },
              1,
              0,
            ],
          },
        },
        blocked: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $not: { $in: ['$status', CLOSED_STATUSES] } },
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: { $ifNull: ['$labels', []] },
                            as: 'l',
                            cond: {
                              $regexMatch: {
                                input: '$$l',
                                regex: '^(blocked|blocker)$',
                                options: 'i',
                              },
                            },
                          },
                        },
                      },
                      0,
                    ],
                  },
                ],
              },
              1,
              0,
            ],
          },
        },
        lastUpdatedAt: { $max: '$updatedAt' },
      },
    },
  ])

  const aggByProjectId = new Map<string, (typeof perProjectAgg)[number]>()
  for (const row of perProjectAgg) aggByProjectId.set(String(row._id), row)

  const projects: OverviewProject[] = projectsRaw.map((p) => {
    const agg = aggByProjectId.get(String(p._id))
    const byStatus = emptyByStatus()
    if (agg) {
      for (const row of agg.byStatus) {
        byStatus[row.status as DevIssueStatus] = (byStatus[row.status as DevIssueStatus] ?? 0) + row.count
      }
    }
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0)
    const done = byStatus.DONE
    const cancelled = byStatus.CANCELLED
    const open = total - done - cancelled
    const urgent = agg?.urgent ?? 0
    const blocked = agg?.blocked ?? 0
    const progress = computeProgress(byStatus)
    const health = computeHealth({ urgent, blocked }, progress)
    const lastActivityAt = new Date(
      Math.max(
        new Date(p.updatedAt).getTime(),
        agg?.lastUpdatedAt ? new Date(agg.lastUpdatedAt).getTime() : 0
      )
    ).toISOString()
    return {
      _id: String(p._id),
      key: p.key,
      name: p.name,
      color: p.color,
      status: p.status,
      lead: p.lead
        ? { _id: String(p.lead._id), name: p.lead.name, email: p.lead.email }
        : null,
      counts: { total, open, done, cancelled, urgent, blocked, byStatus },
      progress,
      health,
      lastActivityAt,
    }
  })

  projects.sort((a, b) => {
    const aActive = a.status === 'ACTIVE' ? 0 : 1
    const bActive = b.status === 'ACTIVE' ? 0 : 1
    if (aActive !== bActive) return aActive - bActive
    return b.lastActivityAt.localeCompare(a.lastActivityAt)
  })

  const stats = await computeStats()
  const kpis: OverviewKpis = {
    totalProjects: stats.totalProjects,
    activeProjects: projects.filter((p) => p.status === 'ACTIVE').length,
    totalOpen: stats.open,
    urgent: stats.urgent,
    blocked: stats.blocked,
    completed7d: stats.completed7d,
    completed14d: stats.completed14d,
    velocity14d: stats.velocity14d,
  }

  return { kpis, projects }
}
