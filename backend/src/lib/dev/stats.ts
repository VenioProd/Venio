import mongoose from 'mongoose'
import DevIssue, {
  DEV_ISSUE_STATUSES,
  DEV_ISSUE_PRIORITIES,
  DEV_ISSUE_TYPES,
  type DevIssueStatus,
  type DevIssuePriority,
  type DevIssueType,
} from '../../models/DevIssue.js'
import DevIssueComment from '../../models/DevIssueComment.js'
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
const BLOCKED_LABEL_REGEXES = BLOCKED_LABELS.map((l) => new RegExp(`^${l}$`, 'i'))
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
      DevIssue.countDocuments({ ...openMatch, labels: { $in: BLOCKED_LABEL_REGEXES } }),
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

  const statusSumStage = Object.fromEntries(
    (Object.keys(emptyByStatus()) as DevIssueStatus[]).map((s) => [
      s,
      { $sum: { $cond: [{ $eq: ['$status', s] }, 1, 0] } },
    ])
  )

  const perProjectAgg = await DevIssue.aggregate<{
    _id: mongoose.Types.ObjectId
    urgent: number
    blocked: number
    lastUpdatedAt: Date | null
  } & Record<DevIssueStatus, number>>([
    {
      $group: {
        _id: '$project',
        ...statusSumStage,
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
      for (const s of Object.keys(byStatus) as DevIssueStatus[]) {
        byStatus[s] = agg[s] ?? 0
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

  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const since14 = new Date(now - 14 * day)
  const since7 = new Date(now - 7 * day)
  const [completed7d, completed14d] = await Promise.all([
    DevIssue.countDocuments({ status: 'DONE', completedAt: { $gte: since7 } }),
    DevIssue.countDocuments({ status: 'DONE', completedAt: { $gte: since14 } }),
  ])

  const kpis: OverviewKpis = {
    totalProjects: projects.filter((p) => p.status !== 'ARCHIVED').length,
    activeProjects: projects.filter((p) => p.status === 'ACTIVE').length,
    totalOpen: projects.reduce((s, p) => s + p.counts.open, 0),
    urgent: projects.reduce((s, p) => s + p.counts.urgent, 0),
    blocked: projects.reduce((s, p) => s + p.counts.blocked, 0),
    completed7d,
    completed14d,
    velocity14d: Math.round((completed14d / 14) * 100) / 100,
  }

  return { kpis, projects }
}

// ─── Project cockpit (per-project dashboard) ─────────────────────────────────

export interface CockpitProject {
  _id: string
  key: string
  name: string
  description: string
  color: string
  status: string
  lead: { _id: string; name: string; email: string; avatarUrl?: string } | null
  members: Array<{ _id: string; name: string; email: string; avatarUrl?: string }>
  createdBy: { _id: string; name: string; email: string } | null
  createdAt: string
  updatedAt: string
}

export interface CockpitCounts {
  total: number
  open: number
  done: number
  cancelled: number
  urgent: number
  blocked: number
  overdue: number
}

export interface CockpitVelocityPoint {
  date: string // YYYY-MM-DD
  completed: number
  created: number
}

export interface CockpitIssueRef {
  _id: string
  identifier: string
  title: string
  status: DevIssueStatus
  priority: DevIssuePriority
  type: DevIssueType
  labels: string[]
  dueDate: string | null
  updatedAt: string
  assignee: { _id: string; name: string; email: string; avatarUrl?: string } | null
}

export interface CockpitActivityEvent {
  type: 'issue_created' | 'issue_completed' | 'issue_updated' | 'comment'
  at: string
  issue: { _id: string; identifier: string; title: string; status: DevIssueStatus } | null
  actor: { _id: string; name: string; email: string } | null
}

export interface CockpitAssigneeRow {
  user: { _id: string; name: string; email: string; avatarUrl?: string } | null
  open: number
  done: number
  urgent: number
}

export interface CockpitPayload {
  project: CockpitProject
  counts: CockpitCounts
  progress: number
  health: ProjectHealth
  lastActivityAt: string
  byStatus: Record<DevIssueStatus, number>
  byPriority: Record<DevIssuePriority, number>
  byType: Record<DevIssueType, number>
  velocity: {
    days: CockpitVelocityPoint[]
    completed7d: number
    completed14d: number
    created14d: number
    velocityPerDay14d: number
    avgCompletionDays: number | null
  }
  blockers: CockpitIssueRef[]
  urgent: CockpitIssueRef[]
  overdue: CockpitIssueRef[]
  nextDue: CockpitIssueRef[]
  recentlyDone: CockpitIssueRef[]
  activity: CockpitActivityEvent[]
  assignees: CockpitAssigneeRow[]
}

function emptyByStatusType<T extends string>(keys: readonly T[]): Record<T, number> {
  const out = {} as Record<T, number>
  for (const k of keys) out[k] = 0
  return out
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface PopulatedUserRef {
  _id: mongoose.Types.ObjectId
  name?: string
  email?: string
  avatarUrl?: string
}

function userRef(u: PopulatedUserRef | null | undefined) {
  if (!u || !u._id) return null
  return {
    _id: String(u._id),
    name: u.name || '',
    email: u.email || '',
    avatarUrl: u.avatarUrl,
  }
}

function shapeIssueRef(issue: {
  _id: mongoose.Types.ObjectId
  identifier: string
  title: string
  status: DevIssueStatus
  priority: DevIssuePriority
  type: DevIssueType
  labels: string[]
  dueDate: Date | null
  updatedAt: Date
  assignee?: PopulatedUserRef | null
}): CockpitIssueRef {
  return {
    _id: String(issue._id),
    identifier: issue.identifier,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    type: issue.type,
    labels: issue.labels || [],
    dueDate: issue.dueDate ? new Date(issue.dueDate).toISOString() : null,
    updatedAt: new Date(issue.updatedAt).toISOString(),
    assignee: userRef(issue.assignee ?? null),
  }
}

/**
 * Per-project cockpit payload. Aggregates everything needed for the project
 * detail dashboard in one round-trip:
 *  - counts/progress/health snapshot
 *  - status / priority / type breakdowns
 *  - 14-day velocity series (completed vs created per day)
 *  - blocker / urgent / overdue / next-due / recently-done lists
 *  - activity stream (recent issue + comment events, capped)
 *  - per-assignee workload
 */
export async function computeProjectCockpit(
  projectId: mongoose.Types.ObjectId | string
): Promise<CockpitPayload | null> {
  const id = typeof projectId === 'string' ? new mongoose.Types.ObjectId(projectId) : projectId

  const projectDoc = await DevProject.findById(id)
    .populate<{ lead: PopulatedUserRef | null }>('lead', 'name email avatarUrl')
    .populate<{ members: PopulatedUserRef[] }>('members', 'name email avatarUrl')
    .populate<{ createdBy: PopulatedUserRef | null }>('createdBy', 'name email')
    .lean()
  if (!projectDoc) return null

  const match = { project: id }
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const since7 = new Date(now - 7 * day)
  const since14 = new Date(now - 14 * day)
  const startOfToday = startOfDayUTC(new Date(now))

  const [
    byStatusAgg,
    byPriorityAgg,
    byTypeAgg,
    completedAgg,
    createdAgg,
    completionDurations,
    blockersRaw,
    urgentRaw,
    overdueRaw,
    nextDueRaw,
    recentlyDoneRaw,
    recentIssuesRaw,
    recentCommentsRaw,
    assigneesAgg,
  ] = await Promise.all([
    DevIssue.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    DevIssue.aggregate([{ $match: match }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
    DevIssue.aggregate([{ $match: match }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
    DevIssue.aggregate([
      { $match: { project: id, status: 'DONE', completedAt: { $gte: since14 } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
    ]),
    DevIssue.aggregate([
      { $match: { project: id, createdAt: { $gte: since14 } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
    ]),
    DevIssue.aggregate<{ duration: number }>([
      {
        $match: {
          project: id,
          status: 'DONE',
          completedAt: { $gte: since14 },
          startedAt: { $ne: null },
        },
      },
      {
        $project: {
          duration: {
            $divide: [{ $subtract: ['$completedAt', '$startedAt'] }, 1000 * 60 * 60 * 24],
          },
        },
      },
    ]),
    DevIssue.find({
      project: id,
      status: { $nin: CLOSED_STATUSES },
      labels: { $in: BLOCKED_LABEL_REGEXES },
    })
      .populate('assignee', 'name email avatarUrl')
      .sort({ priority: -1, updatedAt: -1 })
      .limit(8)
      .lean(),
    DevIssue.find({
      project: id,
      status: { $nin: CLOSED_STATUSES },
      priority: 'URGENT',
    })
      .populate('assignee', 'name email avatarUrl')
      .sort({ updatedAt: -1 })
      .limit(8)
      .lean(),
    DevIssue.find({
      project: id,
      status: { $nin: CLOSED_STATUSES },
      dueDate: { $ne: null, $lt: startOfToday },
    })
      .populate('assignee', 'name email avatarUrl')
      .sort({ dueDate: 1 })
      .limit(8)
      .lean(),
    DevIssue.find({
      project: id,
      status: { $nin: CLOSED_STATUSES },
      dueDate: { $ne: null, $gte: startOfToday },
    })
      .populate('assignee', 'name email avatarUrl')
      .sort({ dueDate: 1 })
      .limit(5)
      .lean(),
    DevIssue.find({ project: id, status: 'DONE' })
      .populate('assignee', 'name email avatarUrl')
      .sort({ completedAt: -1 })
      .limit(5)
      .lean(),
    DevIssue.find({ project: id })
      .populate('assignee', 'name email avatarUrl')
      .populate('reporter', 'name email')
      .sort({ updatedAt: -1 })
      .limit(15)
      .lean(),
    DevIssueComment.find({ project: id })
      .populate('author', 'name email')
      .populate('issue', 'identifier title status')
      .sort({ createdAt: -1 })
      .limit(15)
      .lean(),
    DevIssue.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$assignee',
          open: {
            $sum: {
              $cond: [{ $not: { $in: ['$status', CLOSED_STATUSES] } }, 1, 0],
            },
          },
          done: {
            $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] },
          },
          urgent: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$priority', 'URGENT'] },
                    { $not: { $in: ['$status', CLOSED_STATUSES] } },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ])

  const byStatus = emptyByStatusType(DEV_ISSUE_STATUSES) as Record<DevIssueStatus, number>
  for (const row of byStatusAgg) byStatus[row._id as DevIssueStatus] = row.count
  const byPriority = emptyByStatusType(DEV_ISSUE_PRIORITIES) as Record<DevIssuePriority, number>
  for (const row of byPriorityAgg) byPriority[row._id as DevIssuePriority] = row.count
  const byType = emptyByStatusType(DEV_ISSUE_TYPES) as Record<DevIssueType, number>
  for (const row of byTypeAgg) byType[row._id as DevIssueType] = row.count

  const total = Object.values(byStatus).reduce((a, b) => a + b, 0)
  const done = byStatus.DONE
  const cancelled = byStatus.CANCELLED
  const open = total - done - cancelled
  const urgent = urgentRaw.length
  const blocked = blockersRaw.length
  const overdueCount = overdueRaw.length
  const progress = computeProgress(byStatus)
  const health = computeHealth({ urgent, blocked }, progress)

  // Velocity series: 14 daily points ending today (UTC)
  const completedByDay = new Map<string, number>()
  for (const row of completedAgg) completedByDay.set(row._id as string, row.count)
  const createdByDay = new Map<string, number>()
  for (const row of createdAgg) createdByDay.set(row._id as string, row.count)

  const days: CockpitVelocityPoint[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(startOfToday.getTime() - i * day)
    const key = ymd(d)
    days.push({
      date: key,
      completed: completedByDay.get(key) || 0,
      created: createdByDay.get(key) || 0,
    })
  }
  const completed7d = days.slice(-7).reduce((s, d) => s + d.completed, 0)
  const completed14d = days.reduce((s, d) => s + d.completed, 0)
  const created14d = days.reduce((s, d) => s + d.created, 0)
  const avgCompletionDays = completionDurations.length
    ? Math.round(
        (completionDurations.reduce((s, r) => s + r.duration, 0) / completionDurations.length) * 10
      ) / 10
    : null

  const blockers = blockersRaw.map((i) => shapeIssueRef(i as never))
  const urgentList = urgentRaw.map((i) => shapeIssueRef(i as never))
  const overdueList = overdueRaw.map((i) => shapeIssueRef(i as never))
  const nextDue = nextDueRaw.map((i) => shapeIssueRef(i as never))
  const recentlyDone = recentlyDoneRaw.map((i) => shapeIssueRef(i as never))

  // Activity stream — merge issue events + comments, keep last 20
  const activity: CockpitActivityEvent[] = []
  for (const c of recentCommentsRaw as unknown as Array<{
    createdAt: Date
    author: PopulatedUserRef | null
    issue: {
      _id: mongoose.Types.ObjectId
      identifier: string
      title: string
      status: DevIssueStatus
    } | null
  }>) {
    activity.push({
      type: 'comment',
      at: new Date(c.createdAt).toISOString(),
      issue: c.issue
        ? {
            _id: String(c.issue._id),
            identifier: c.issue.identifier,
            title: c.issue.title,
            status: c.issue.status,
          }
        : null,
      actor: userRef(c.author),
    })
  }
  for (const i of recentIssuesRaw as Array<{
    _id: mongoose.Types.ObjectId
    identifier: string
    title: string
    status: DevIssueStatus
    createdAt: Date
    updatedAt: Date
    completedAt: Date | null
    reporter?: PopulatedUserRef | null
    assignee?: PopulatedUserRef | null
  }>) {
    if (i.completedAt) {
      activity.push({
        type: 'issue_completed',
        at: new Date(i.completedAt).toISOString(),
        issue: { _id: String(i._id), identifier: i.identifier, title: i.title, status: i.status },
        actor: userRef(i.assignee ?? i.reporter ?? null),
      })
    }
    const createdAt = new Date(i.createdAt).getTime()
    const updatedAt = new Date(i.updatedAt).getTime()
    if (Math.abs(createdAt - updatedAt) < 5_000) {
      activity.push({
        type: 'issue_created',
        at: new Date(i.createdAt).toISOString(),
        issue: { _id: String(i._id), identifier: i.identifier, title: i.title, status: i.status },
        actor: userRef(i.reporter ?? null),
      })
    } else {
      activity.push({
        type: 'issue_updated',
        at: new Date(i.updatedAt).toISOString(),
        issue: { _id: String(i._id), identifier: i.identifier, title: i.title, status: i.status },
        actor: userRef(i.assignee ?? i.reporter ?? null),
      })
    }
  }
  activity.sort((a, b) => b.at.localeCompare(a.at))
  const activityCapped = activity.slice(0, 20)

  // Assignees workload — populate user refs in a second pass
  const assigneeIds = assigneesAgg
    .map((row) => row._id)
    .filter((v): v is mongoose.Types.ObjectId => Boolean(v))
  const users = assigneeIds.length
    ? await mongoose.model('User').find({ _id: { $in: assigneeIds } }).select('name email avatarUrl').lean()
    : []
  const userMap = new Map<string, PopulatedUserRef>()
  for (const u of users as PopulatedUserRef[]) userMap.set(String(u._id), u)
  const assignees: CockpitAssigneeRow[] = assigneesAgg
    .map((row) => ({
      user: row._id ? userRef(userMap.get(String(row._id)) ?? null) : null,
      open: row.open as number,
      done: row.done as number,
      urgent: row.urgent as number,
    }))
    .sort((a, b) => b.open - a.open || b.urgent - a.urgent)

  const lastActivityAt = activityCapped[0]?.at || new Date(projectDoc.updatedAt).toISOString()

  const project: CockpitProject = {
    _id: String(projectDoc._id),
    key: projectDoc.key,
    name: projectDoc.name,
    description: projectDoc.description || '',
    color: projectDoc.color,
    status: projectDoc.status,
    lead: userRef(projectDoc.lead),
    members: (projectDoc.members || [])
      .map((m) => userRef(m))
      .filter((m): m is NonNullable<ReturnType<typeof userRef>> => m !== null),
    createdBy: userRef(projectDoc.createdBy),
    createdAt: new Date(projectDoc.createdAt).toISOString(),
    updatedAt: new Date(projectDoc.updatedAt).toISOString(),
  }

  return {
    project,
    counts: {
      total,
      open,
      done,
      cancelled,
      urgent,
      blocked,
      overdue: overdueCount,
    },
    progress,
    health,
    lastActivityAt,
    byStatus,
    byPriority,
    byType,
    velocity: {
      days,
      completed7d,
      completed14d,
      created14d,
      velocityPerDay14d: Math.round((completed14d / 14) * 100) / 100,
      avgCompletionDays,
    },
    blockers,
    urgent: urgentList,
    overdue: overdueList,
    nextDue,
    recentlyDone,
    activity: activityCapped,
    assignees,
  }
}
