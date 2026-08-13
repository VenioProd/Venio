import mongoose from 'mongoose'
import DevIssue, { type DevIssuePriority, type DevIssueStatus } from '../../models/DevIssue.js'
import DevProject from '../../models/DevProject.js'
import { CLOSED_ISSUE_STATUSES } from './issueMutations.js'

const STALE_AFTER_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

export type DailyPriorityKind = 'build_failure' | 'blocker' | 'pr_review' | 'overdue' | 'stale' | 'priority'
export type DailyPrioritySeverity = 'critical' | 'high' | 'medium'

export interface DailyPriorityItem {
  id: string
  kind: DailyPriorityKind
  severity: DailyPrioritySeverity
  rank: number
  title: string
  description: string
  project: { _id: string; key: string; name: string; color: string }
  issue: {
    _id: string
    identifier: string
    title: string
    status: DevIssueStatus
    priority: DevIssuePriority
    updatedAt: string
  }
  action: { label: string; href: string | null }
  source: { type: 'ci' | 'issue' | 'pull_request' | 'freshness'; observedAt: string }
}

export interface DailyProjectState {
  project: { _id: string; key: string; name: string; color: string }
  state: 'attention' | 'healthy'
  nextAction: DailyPriorityItem | null
  reason: string
}

export interface DailyPrioritiesPayload {
  generatedAt: string
  staleAfterDays: number
  items: DailyPriorityItem[]
  projects: DailyProjectState[]
}

type IssueWithProject = {
  _id: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  identifier: string
  title: string
  status: DevIssueStatus
  priority: DevIssuePriority
  labels: string[]
  dueDate: Date | null
  updatedAt: Date
  github: { prNumber: number | null; prUrl: string | null; ciStatus: string | null; mergedAt: Date | null } | null
}

const priorityWeight: Record<DevIssuePriority, number> = {
  URGENT: 50,
  HIGH: 30,
  MEDIUM: 10,
  LOW: 0,
  NO_PRIORITY: 0,
}

function daysSince(date: Date, now: number): number {
  return Math.floor((now - date.getTime()) / DAY_MS)
}

function isBlocked(issue: IssueWithProject): boolean {
  return issue.status === 'BLOCKED' || issue.labels.some((label) => /^(blocked|blocker)$/i.test(label))
}

function candidateFor(
  issue: IssueWithProject,
  project: DailyPriorityItem['project'],
  now: number,
): DailyPriorityItem | null {
  const observedAt = issue.updatedAt.toISOString()
  const base = {
    project,
    issue: {
      _id: String(issue._id),
      identifier: issue.identifier,
      title: issue.title,
      status: issue.status,
      priority: issue.priority,
      updatedAt: observedAt,
    },
  }
  const prHref = issue.github?.prUrl ?? null

  if (issue.github?.ciStatus === 'FAILURE') {
    return {
      ...base,
      id: `build_failure:${issue._id}`,
      kind: 'build_failure',
      severity: 'critical',
      rank: 1000 + priorityWeight[issue.priority],
      title: `CI en échec · ${issue.identifier}`,
      description: 'Corriger le build avant toute nouvelle livraison.',
      action: { label: prHref ? 'Ouvrir la PR' : 'Ouvrir l’issue', href: prHref },
      source: { type: 'ci', observedAt },
    }
  }

  if (isBlocked(issue)) {
    return {
      ...base,
      id: `blocker:${issue._id}`,
      kind: 'blocker',
      severity: issue.priority === 'URGENT' ? 'critical' : 'high',
      rank: 900 + priorityWeight[issue.priority],
      title: `Bloquant à lever · ${issue.identifier}`,
      description: 'Clarifier le blocage, assigner le responsable, puis relancer le flux.',
      action: { label: 'Ouvrir l’issue', href: null },
      source: { type: 'issue', observedAt },
    }
  }

  if (issue.status === 'IN_REVIEW' && issue.github?.prNumber && !issue.github.mergedAt) {
    return {
      ...base,
      id: `pr_review:${issue._id}`,
      kind: 'pr_review',
      severity: issue.priority === 'URGENT' ? 'high' : 'medium',
      rank: 800 + priorityWeight[issue.priority],
      title: `PR à valider · ${issue.identifier}`,
      description: `La PR #${issue.github.prNumber} attend une revue ou une décision de merge.`,
      action: { label: prHref ? 'Ouvrir la PR' : 'Ouvrir l’issue', href: prHref },
      source: { type: 'pull_request', observedAt },
    }
  }

  if (issue.dueDate && issue.dueDate.getTime() < now) {
    const overdueDays = Math.max(1, daysSince(issue.dueDate, now))
    return {
      ...base,
      id: `overdue:${issue._id}`,
      kind: 'overdue',
      severity: issue.priority === 'URGENT' ? 'high' : 'medium',
      rank: 700 + priorityWeight[issue.priority] + Math.min(overdueDays, 30),
      title: `Échéance dépassée · ${issue.identifier}`,
      description: `Échéance dépassée depuis ${overdueDays} j. Replanifier ou terminer l’action.`,
      action: { label: 'Ouvrir l’issue', href: null },
      source: { type: 'issue', observedAt },
    }
  }

  const inactivityDays = daysSince(issue.updatedAt, now)
  if ((issue.status === 'IN_PROGRESS' || issue.status === 'IN_REVIEW') && inactivityDays >= STALE_AFTER_DAYS) {
    return {
      ...base,
      id: `stale:${issue._id}`,
      kind: 'stale',
      severity: inactivityDays >= 30 ? 'high' : 'medium',
      rank: 600 + priorityWeight[issue.priority] + Math.min(inactivityDays, 60),
      title: `Tâche stale · ${issue.identifier}`,
      description: `Aucune activité depuis ${inactivityDays} j : débloquer, requalifier ou clôturer.`,
      action: { label: 'Ouvrir l’issue', href: null },
      source: { type: 'freshness', observedAt },
    }
  }

  if (issue.priority === 'URGENT' || issue.priority === 'HIGH') {
    return {
      ...base,
      id: `priority:${issue._id}`,
      kind: 'priority',
      severity: issue.priority === 'URGENT' ? 'high' : 'medium',
      rank: 400 + priorityWeight[issue.priority],
      title: `Prochaine priorité · ${issue.identifier}`,
      description:
        issue.status === 'IN_PROGRESS'
          ? 'Poursuivre cette action prioritaire.'
          : 'Qualifier et démarrer cette action prioritaire.',
      action: { label: 'Ouvrir l’issue', href: null },
      source: { type: 'issue', observedAt },
    }
  }

  return {
    ...base,
    id: `priority:${issue._id}`,
    kind: 'priority',
    severity: 'medium',
    rank: 100 + priorityWeight[issue.priority],
    title: `Prochaine action · ${issue.identifier}`,
    description:
      issue.status === 'IN_PROGRESS'
        ? 'Poursuivre cette action en cours.'
        : 'Qualifier et planifier cette issue ouverte.',
    action: { label: 'Ouvrir l’issue', href: null },
    source: { type: 'issue', observedAt },
  }
}

/**
 * Daily command-center signals. This stays deliberately data-only: it uses
 * persisted issue/CI state so the global landing page remains quick, fresh and
 * does not duplicate the more expensive per-project recommendation scan.
 */
export async function computeDailyPriorities(): Promise<DailyPrioritiesPayload> {
  const now = Date.now()
  const projectsRaw = await DevProject.find({ status: 'ACTIVE' }).select('key name color').lean()
  const projects = projectsRaw.map((project) => ({
    _id: String(project._id),
    key: project.key,
    name: project.name,
    color: project.color,
  }))
  const byProjectId = new Map(projects.map((project) => [project._id, project]))
  const projectIds = projectsRaw.map((project) => project._id)

  if (projectIds.length === 0) {
    return { generatedAt: new Date(now).toISOString(), staleAfterDays: STALE_AFTER_DAYS, items: [], projects: [] }
  }

  const issues = (await DevIssue.find({
    project: { $in: projectIds },
    archivedAt: null,
    status: { $nin: CLOSED_ISSUE_STATUSES },
  })
    .select('_id project identifier title status priority labels dueDate updatedAt github')
    .lean()) as unknown as IssueWithProject[]

  const candidates = issues
    .map((issue) => {
      const project = byProjectId.get(String(issue.project))
      return project ? candidateFor(issue, project, now) : null
    })
    .filter((item): item is DailyPriorityItem => item !== null)
    .sort((a, b) => b.rank - a.rank || b.issue.updatedAt.localeCompare(a.issue.updatedAt))

  const bestByProject = new Map<string, DailyPriorityItem>()
  for (const item of candidates) {
    if (!bestByProject.has(item.project._id)) bestByProject.set(item.project._id, item)
  }

  return {
    generatedAt: new Date(now).toISOString(),
    staleAfterDays: STALE_AFTER_DAYS,
    // The home list stays P0-only; regular open work still supplies a next
    // action in the per-project state below.
    items: candidates.filter((item) => item.rank >= 400).slice(0, 12),
    projects: projects.map((project) => {
      const nextAction = bestByProject.get(project._id) ?? null
      return {
        project,
        state: nextAction ? 'attention' : 'healthy',
        nextAction,
        reason: nextAction ? nextAction.title : 'Aucun signal bloquant ou prioritaire détecté.',
      }
    }),
  }
}
