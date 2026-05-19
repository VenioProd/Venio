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
