import { apiFetch } from '../lib/api'

export type DevProjectStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
export type DevIssueStatus =
  | 'BACKLOG'
  | 'TODO'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'BLOCKED'
  | 'DONE'
  | 'DUPLICATE'
  | 'CANCELLED'
export type DevIssuePriority = 'NO_PRIORITY' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type DevIssueType = 'FEATURE' | 'BUG' | 'CHORE' | 'TASK' | 'REFACTOR' | 'SECURITY' | 'CI' | 'DEPLOY' | 'DOC'

export interface UserRef {
  _id: string
  name?: string
  email?: string
  avatarUrl?: string
}

export interface DevProjectGithubConfig {
  owner: string | null
  repo: string | null
  defaultBranch: string | null
  htmlUrl: string | null
  repoPath: string | null
}

export interface DevProject {
  _id: string
  key: string
  name: string
  description: string
  color: string
  status: DevProjectStatus
  lead: UserRef | null
  members: UserRef[]
  createdBy: UserRef | null
  github: DevProjectGithubConfig | null
  openIssues?: number
  createdAt: string
  updatedAt: string
}

export type DevCiStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILURE' | 'UNKNOWN'

export interface DevIssueGithubLink {
  repo: string | null
  prNumber: number | null
  prUrl: string | null
  branch: string | null
  commitSha: string | null
  ciStatus: DevCiStatus | null
  mergedAt: string | null
}

export interface DevIssueExternalRef {
  linearId: string | null
  linearUrl: string | null
  linearIdentifier: string | null
}

export interface DevIssueRelation {
  type: 'blocks' | 'blocked_by' | 'relates_to' | 'duplicates'
  issue: string
}

export interface DevIssue {
  _id: string
  project: { _id: string; key: string; name: string; color?: string } | string
  number: number
  identifier: string
  title: string
  description: string
  type: DevIssueType
  status: DevIssueStatus
  priority: DevIssuePriority
  assignee: UserRef | null
  reporter: UserRef | null
  labels: string[]
  estimate: number | null
  rank: string | null
  cycle: string | null
  parent: string | null
  relations: DevIssueRelation[]
  source: { kind: 'manual' | 'agent' | 'linear' | 'github' | 'import'; name: string | null } | null
  external: DevIssueExternalRef | null
  agentAssignee: string | null
  acceptanceCriteria: string[]
  subtasks: string[]
  blockedReason: string | null
  blockedBy: string[]
  duplicateOf: string | null
  dueDate: string | null
  startedAt: string | null
  completedAt: string | null
  archivedAt: string | null
  github: DevIssueGithubLink | null
  createdAt: string
  updatedAt: string
}

export interface DevIssueComment {
  _id: string
  issue: string
  project: string
  author: UserRef
  body: string
  createdAt: string
  updatedAt: string
}

export interface DevIssueEvent {
  _id: string
  issue: string
  project: string
  actor: UserRef | null
  type:
    | 'created'
    | 'status_changed'
    | 'priority_changed'
    | 'type_changed'
    | 'assigned'
    | 'metadata_changed'
    | 'commented'
    | 'github_linked'
    | 'ci_changed'
    | 'agent_started'
    | 'agent_blocked'
    | 'agent_done'
    | 'deployed'
    | 'archived'
  summary: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface DevStats {
  total: number
  open: number
  done?: number
  cancelled?: number
  progress?: number
  completedRecent: number
  completed7?: number
  completed14?: number
  created7?: number
  overdue?: number
  totalProjects: number
  byStatus: Record<DevIssueStatus, number>
  byPriority: Record<DevIssuePriority, number>
  byType?: Record<DevIssueType, number>
}

export interface DevProjectDetail {
  project: DevProject
  stats: {
    total: number
    open: number
    done: number
    cancelled: number
    progress: number
    completed14: number
    completed7: number
    created7: number
    overdue: number
    byStatus: Record<DevIssueStatus, number>
    byPriority: Record<DevIssuePriority, number>
    byType: Record<DevIssueType, number>
  }
  recentIssues: DevIssue[]
}

export type DevActivityKind = 'created' | 'completed' | 'comment'

export interface DevActivityEntry {
  kind: DevActivityKind
  at: string
  user: UserRef | null
  issue: { _id: string; identifier: string; number: number; title: string }
  project: { _id: string; key: string; name: string; color?: string } | null
  body?: string
}

export interface DevRoadmapIssueSummary {
  _id: string
  identifier: string
  number: number
  title: string
  type: DevIssueType
  status: DevIssueStatus
  priority: DevIssuePriority
  assignee: UserRef | null
  dueDate: string | null
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
  github: {
    prNumber: number | null
    prUrl: string | null
    prState: 'open' | 'closed' | null
    ciStatus: 'NEUTRAL' | 'PENDING' | 'SUCCESS' | 'FAILURE'
  } | null
}

export interface DevRoadmapProject {
  project: {
    _id: string
    key: string
    name: string
    color: string
    description: string
    status: DevProjectStatus
    lead: UserRef | null
    updatedAt: string
  }
  summary: {
    total: number
    open: number
    done: number
    cancelled: number
    inProgress: number
    inReview: number
    blocked: number
    todo: number
    backlog: number
    overdue: number
    progress: number
  }
  active: DevRoadmapIssueSummary[]
  upcoming: DevRoadmapIssueSummary[]
  recentlyDone: DevRoadmapIssueSummary[]
}

export interface DevRoadmapResponse {
  projects: DevRoadmapProject[]
  generatedAt: string
}

export interface IssueFilters {
  project?: string
  status?: DevIssueStatus | 'open' | 'all'
  priority?: DevIssuePriority | 'all'
  type?: DevIssueType | 'all'
  assignee?: string | 'me' | 'unassigned' | 'all'
  q?: string
  label?: string
  cycle?: string
  agentAssignee?: string
  includeArchived?: 'true'
}

function qs(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== 'all') search.set(k, v)
  }
  const str = search.toString()
  return str ? `?${str}` : ''
}

// Projects
export function listDevProjects(status?: DevProjectStatus | 'all'): Promise<{ projects: DevProject[] }> {
  return apiFetch(`/api/admin/dev/projects${qs({ status })}`)
}

export function createDevProject(data: {
  key: string
  name: string
  description?: string
  color?: string
  lead?: string | null
  members?: string[]
}): Promise<DevProject> {
  return apiFetch('/api/admin/dev/projects', { method: 'POST', body: JSON.stringify(data) })
}

export function updateDevProject(id: string, data: Partial<DevProject>): Promise<DevProject> {
  return apiFetch(`/api/admin/dev/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteDevProject(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/dev/projects/${id}`, { method: 'DELETE' })
}

// Issues
export function listDevIssues(filters: IssueFilters = {}): Promise<{ issues: DevIssue[] }> {
  return apiFetch(`/api/admin/dev/issues${qs(filters as Record<string, string | undefined>)}`)
}

export function getDevIssue(id: string): Promise<{ issue: DevIssue; comments: DevIssueComment[]; events: DevIssueEvent[] }> {
  return apiFetch(`/api/admin/dev/issues/${id}`)
}

export function createDevIssue(data: {
  project: string
  title: string
  description?: string
  type?: DevIssueType
  status?: DevIssueStatus
  priority?: DevIssuePriority
  assignee?: string | null
  labels?: string[]
  dueDate?: string | null
  estimate?: number | null
  rank?: string | null
  cycle?: string | null
  external?: Partial<DevIssueExternalRef> | null
  agentAssignee?: string | null
  acceptanceCriteria?: string[]
  subtasks?: string[]
  blockedReason?: string | null
  blockedBy?: string[]
  duplicateOf?: string | null
}): Promise<DevIssue> {
  return apiFetch('/api/admin/dev/issues', { method: 'POST', body: JSON.stringify(data) })
}

export function updateDevIssue(
  id: string,
  data: Partial<DevIssue> & { assignee?: string | null; github?: Partial<DevIssueGithubLink> | null }
): Promise<DevIssue> {
  return apiFetch(`/api/admin/dev/issues/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteDevIssue(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/dev/issues/${id}`, { method: 'DELETE' })
}

export function addDevIssueComment(id: string, body: string): Promise<DevIssueComment> {
  return apiFetch(`/api/admin/dev/issues/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) })
}

export function deleteDevIssueComment(issueId: string, commentId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/dev/issues/${issueId}/comments/${commentId}`, { method: 'DELETE' })
}

// Stats
export function fetchDevStats(project?: string): Promise<DevStats> {
  return apiFetch(`/api/admin/dev/stats${qs({ project })}`)
}

// Overview (KPIs + per-project counts)
export interface DevOverviewProjectCounts {
  total: number
  open: number
  done: number
  cancelled: number
  urgent: number
  blocked: number
  byStatus: Record<DevIssueStatus, number>
}

export interface DevOverviewProject {
  _id: string
  key: string
  name: string
  color: string
  status: DevProjectStatus
  lead: { _id: string; name?: string; email?: string } | null
  counts: DevOverviewProjectCounts
  progress: number
  health: 'on_track' | 'at_risk' | 'blocked'
  lastActivityAt: string
}

export interface DevOverviewKpis {
  totalProjects: number
  activeProjects: number
  totalOpen: number
  urgent: number
  blocked: number
  completed7d: number
  completed14d: number
  velocity14d: number
}

export interface DevOverview {
  kpis: DevOverviewKpis
  projects: DevOverviewProject[]
}

export function fetchDevOverview(): Promise<DevOverview> {
  return apiFetch('/api/admin/dev/overview')
}

// Project cockpit (per-project dashboard)
export interface DevCockpitProject {
  _id: string
  key: string
  name: string
  description: string
  color: string
  status: DevProjectStatus
  lead: { _id: string; name: string; email: string; avatarUrl?: string } | null
  members: Array<{ _id: string; name: string; email: string; avatarUrl?: string }>
  createdBy: { _id: string; name: string; email: string } | null
  createdAt: string
  updatedAt: string
}

export interface DevCockpitCounts {
  total: number
  open: number
  done: number
  cancelled: number
  urgent: number
  blocked: number
  overdue: number
}

export interface DevCockpitVelocityPoint {
  date: string
  completed: number
  created: number
}

export interface DevCockpitIssueRef {
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

export interface DevCockpitActivityEvent {
  type: 'issue_created' | 'issue_completed' | 'issue_updated' | 'comment'
  at: string
  issue: { _id: string; identifier: string; title: string; status: DevIssueStatus } | null
  actor: { _id: string; name: string; email: string } | null
}

export interface DevCockpitAssigneeRow {
  user: { _id: string; name: string; email: string; avatarUrl?: string } | null
  open: number
  done: number
  urgent: number
}

export interface DevCockpit {
  project: DevCockpitProject
  counts: DevCockpitCounts
  progress: number
  health: 'on_track' | 'at_risk' | 'blocked'
  lastActivityAt: string
  byStatus: Record<DevIssueStatus, number>
  byPriority: Record<DevIssuePriority, number>
  byType: Record<DevIssueType, number>
  velocity: {
    days: DevCockpitVelocityPoint[]
    completed7d: number
    completed14d: number
    created14d: number
    velocityPerDay14d: number
    avgCompletionDays: number | null
  }
  blockers: DevCockpitIssueRef[]
  urgent: DevCockpitIssueRef[]
  overdue: DevCockpitIssueRef[]
  nextDue: DevCockpitIssueRef[]
  recentlyDone: DevCockpitIssueRef[]
  activity: DevCockpitActivityEvent[]
  assignees: DevCockpitAssigneeRow[]
}

export function fetchDevProjectCockpit(projectId: string): Promise<DevCockpit> {
  return apiFetch(`/api/admin/dev/projects/${projectId}/dashboard`)
}

// ─── Project intelligence (github, tokens, code metrics) ────────────────────

export interface DevGithubLinks {
  repoUrl: string | null
  prsUrl: string | null
  commitsUrl: string | null
  actionsUrl: string | null
  branchesUrl: string | null
  issuesUrl: string | null
}

export interface DevGithubPullRequestRef {
  issueId: string
  identifier: string
  title: string
  prNumber: number | null
  prUrl: string | null
  branch: string | null
  ciStatus: DevCiStatus | null
  mergedAt: string | null
  repo: string | null
}

export interface DevGithubSummary {
  configured: boolean
  owner: string | null
  repo: string | null
  defaultBranch: string | null
  htmlUrl: string | null
  repoPath: string | null
  links: DevGithubLinks
  pullRequests: {
    open: DevGithubPullRequestRef[]
    merged: DevGithubPullRequestRef[]
    failing: DevGithubPullRequestRef[]
    counts: { open: number; merged: number; failing: number }
  }
  reason?: string
}

export interface DevTokensSnapshot {
  available: boolean
  source: 'none' | 'agents' | 'llm-runs'
  reason: string
  period: { since: string | null; until: string | null }
  totalTokens: number | null
  inputTokens: number | null
  outputTokens: number | null
  estimatedCostUsd: number | null
  missing: string[]
}

export interface DevCodeMetricsExtension {
  ext: string
  language: string
  files: number
  lines: number
  bytes: number
  largestFiles: Array<{ path: string; lines: number; bytes: number }>
}

export interface DevCodeMetricsLargeFile {
  path: string
  ext: string
  language: string
  lines: number
  threshold: number
  score: number
  reason: string
}

export interface DevCodeMetrics {
  available: boolean
  source: 'filesystem' | 'unconfigured' | 'error'
  resolvedPath: string | null
  scannedAt: string | null
  durationMs: number | null
  reason?: string
  totals: { files: number; lines: number; bytes: number }
  byExtension: DevCodeMetricsExtension[]
  largeFiles: DevCodeMetricsLargeFile[]
  topFilesGlobal: Array<{ path: string; ext: string; language: string; lines: number; bytes: number }>
}

export interface DevProjectIntelligence {
  projectId: string
  github: DevGithubSummary
  tokens: DevTokensSnapshot
  code: DevCodeMetrics
  generatedAt: string
}

export interface DevLargeFilesSnapshot {
  projectId: string
  available: boolean
  source: DevCodeMetrics['source']
  scannedAt: string | null
  durationMs: number | null
  reason?: string
  largeFiles: DevCodeMetricsLargeFile[]
  totals: DevCodeMetrics['totals']
}

export function fetchDevProjectIntelligence(
  projectId: string,
  opts: { refresh?: boolean } = {}
): Promise<DevProjectIntelligence> {
  const refresh = opts.refresh ? '?refresh=1' : ''
  return apiFetch(`/api/admin/dev/projects/${projectId}/intelligence${refresh}`)
}

export function fetchDevProjectLargeFiles(
  projectId: string,
  opts: { refresh?: boolean } = {}
): Promise<DevLargeFilesSnapshot> {
  const refresh = opts.refresh ? '?refresh=1' : ''
  return apiFetch(`/api/admin/dev/projects/${projectId}/large-files${refresh}`)
}

// ─── Project recommendations (auto-refresh ~6h, heuristic) ──────────────────

export type DevRecommendationSection = 'improve' | 'add' | 'optimize' | 'large_files'
export type DevRecommendationPriority = 'critical' | 'high' | 'medium' | 'low'
export type DevRecommendationSource =
  | 'issues'
  | 'pull_requests'
  | 'code_metrics'
  | 'backlog'
  | 'roadmap'
  | 'labels'
  | 'ci'
export type DevRecommendationStatus = 'ok' | 'partial' | 'empty' | 'error'
export type DevRecommendationActionKind = 'open_issue' | 'open_pr' | 'open_file' | 'open_url'

export interface DevRecommendationAction {
  kind: DevRecommendationActionKind
  label: string
  href?: string | null
  issueId?: string | null
}

export interface DevRecommendationItem {
  id: string
  section: DevRecommendationSection
  title: string
  description: string
  priority: DevRecommendationPriority
  source: DevRecommendationSource
  badges: string[]
  metric?: { label: string; value: string | number } | null
  actions: DevRecommendationAction[]
}

export interface DevRecommendationsPayload {
  projectId: string
  generatedAt: string
  nextRefreshAt: string
  ttlSeconds: number
  fromCache: boolean
  cacheAgeSeconds: number
  status: DevRecommendationStatus
  source: { issues: boolean; github: boolean; code: boolean }
  reasons: string[]
  counts: {
    total: number
    improve: number
    add: number
    optimize: number
    large_files: number
    bySeverity: Record<DevRecommendationPriority, number>
  }
  sections: {
    improve: DevRecommendationItem[]
    add: DevRecommendationItem[]
    optimize: DevRecommendationItem[]
    large_files: DevRecommendationItem[]
  }
}

export function fetchDevProjectRecommendations(
  projectId: string,
  opts: { refresh?: boolean } = {}
): Promise<DevRecommendationsPayload> {
  const refresh = opts.refresh ? '?refresh=1' : ''
  return apiFetch(`/api/admin/dev/projects/${projectId}/recommendations${refresh}`)
}

export function fetchDevProjectDetail(id: string): Promise<DevProjectDetail> {
  return apiFetch(`/api/admin/dev/projects/${id}/detail`)
}

export function fetchDevActivity(opts: { project?: string; limit?: number } = {}): Promise<{ entries: DevActivityEntry[] }> {
  return apiFetch(
    `/api/admin/dev/activity${qs({ project: opts.project, limit: opts.limit ? String(opts.limit) : undefined })}`
  )
}

export function fetchDevRoadmap(
  opts: { includeArchived?: boolean; upcomingLimit?: number; recentLimit?: number; activeLimit?: number } = {}
): Promise<DevRoadmapResponse> {
  return apiFetch(
    `/api/admin/dev/roadmap${qs({
      includeArchived: opts.includeArchived ? 'true' : undefined,
      upcomingLimit: opts.upcomingLimit ? String(opts.upcomingLimit) : undefined,
      recentLimit: opts.recentLimit ? String(opts.recentLimit) : undefined,
      activeLimit: opts.activeLimit ? String(opts.activeLimit) : undefined,
    })}`
  )
}

// UI helpers
export const STATUS_LABEL: Record<DevIssueStatus, string> = {
  BACKLOG: 'Backlog',
  TODO: 'À faire',
  IN_PROGRESS: 'En cours',
  IN_REVIEW: 'En revue',
  BLOCKED: 'Bloqué',
  DONE: 'Terminé',
  DUPLICATE: 'Doublon',
  CANCELLED: 'Annulé',
}

export const STATUS_COLOR: Record<DevIssueStatus, string> = {
  BACKLOG: '#94a3b8',
  TODO: '#cbd5e1',
  IN_PROGRESS: '#facc15',
  IN_REVIEW: '#a78bfa',
  BLOCKED: '#ef4444',
  DONE: '#10b981',
  DUPLICATE: '#64748b',
  CANCELLED: '#475569',
}

export const STATUS_ORDER: DevIssueStatus[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE', 'DUPLICATE', 'CANCELLED']

export const PRIORITY_LABEL: Record<DevIssuePriority, string> = {
  NO_PRIORITY: 'Aucune',
  LOW: 'Basse',
  MEDIUM: 'Moyenne',
  HIGH: 'Haute',
  URGENT: 'Urgent',
}

export const PRIORITY_COLOR: Record<DevIssuePriority, string> = {
  NO_PRIORITY: '#64748b',
  LOW: '#3b82f6',
  MEDIUM: '#06b6d4',
  HIGH: '#f97316',
  URGENT: '#ef4444',
}

export const PRIORITY_ORDER: DevIssuePriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NO_PRIORITY']

export const TYPE_LABEL: Record<DevIssueType, string> = {
  FEATURE: 'Feature',
  BUG: 'Bug',
  CHORE: 'Chore',
  TASK: 'Task',
  REFACTOR: 'Refactor',
  SECURITY: 'Sécurité',
  CI: 'CI',
  DEPLOY: 'Déploiement',
  DOC: 'Doc',
}

export const TYPE_COLOR: Record<DevIssueType, string> = {
  FEATURE: '#22c55e',
  BUG: '#ef4444',
  CHORE: '#a3a3a3',
  TASK: '#7c5cff',
  REFACTOR: '#14b8a6',
  SECURITY: '#f43f5e',
  CI: '#38bdf8',
  DEPLOY: '#22c55e',
  DOC: '#f59e0b',
}

// Weighted progression — must match backend src/lib/dev/stats.ts STATUS_WEIGHT.
// CANCELLED issues are excluded from both numerator and denominator.
export const STATUS_WEIGHT: Record<DevIssueStatus, number> = {
  BACKLOG: 0,
  TODO: 10,
  IN_PROGRESS: 50,
  IN_REVIEW: 80,
  BLOCKED: 20,
  DONE: 100,
  DUPLICATE: 0,
  CANCELLED: 0,
}

export function computeWeightedProgress(byStatus: Record<DevIssueStatus, number>): number {
  let weighted = 0
  let nonCancelled = 0
  for (const status of STATUS_ORDER) {
    if (status === 'CANCELLED' || status === 'DUPLICATE') continue
    const count = byStatus[status] || 0
    weighted += STATUS_WEIGHT[status] * count
    nonCancelled += count
  }
  if (nonCancelled === 0) return 0
  return Math.round(weighted / nonCancelled)
}
