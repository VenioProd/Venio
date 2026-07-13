import mongoose from 'mongoose'
import DevIssue, { type DevIssueStatus, type DevIssuePriority, type DevIssueType } from '../../models/DevIssue.js'
import DevProject from '../../models/DevProject.js'
import {
  getCachedProjectCodeMetrics,
  refreshProjectCodeMetrics,
  type CodeMetricsSummary,
  type LargeFile,
} from './codeMetrics.js'
import { computeProjectGithubSummary, type DevGithubSummary } from './githubSummary.js'

// ─── Public types ────────────────────────────────────────────────────────────

export type RecommendationSection =
  | 'improve' // features existantes à améliorer
  | 'add' // features à ajouter ensuite
  | 'optimize' // optimisations / refactor / chore
  | 'large_files' // fichiers trop volumineux

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low'

export type RecommendationSource = 'issues' | 'pull_requests' | 'code_metrics' | 'backlog' | 'roadmap' | 'labels' | 'ci'

export interface RecommendationAction {
  kind: 'open_issue' | 'open_pr' | 'open_file' | 'open_url'
  label: string
  href?: string | null
  issueId?: string | null
}

export interface RecommendationItem {
  id: string
  section: RecommendationSection
  title: string
  description: string
  priority: RecommendationPriority
  source: RecommendationSource
  // Free-form badges shown to the user (small chips).
  badges: string[]
  // Optional metric attached to the row (e.g. age in days, LoC, score).
  metric?: { label: string; value: string | number } | null
  // Quick actions: open issue, open PR, open file in repo.
  actions: RecommendationAction[]
}

export type RecommendationStatus = 'ok' | 'partial' | 'empty' | 'error'

export interface RecommendationsPayload {
  projectId: string
  generatedAt: string
  nextRefreshAt: string
  ttlSeconds: number
  fromCache: boolean
  cacheAgeSeconds: number
  status: RecommendationStatus
  source: {
    issues: boolean
    github: boolean
    code: boolean
  }
  reasons: string[]
  counts: {
    total: number
    improve: number
    add: number
    optimize: number
    large_files: number
    bySeverity: Record<RecommendationPriority, number>
  }
  sections: {
    improve: RecommendationItem[]
    add: RecommendationItem[]
    optimize: RecommendationItem[]
    large_files: RecommendationItem[]
  }
}

// ─── Cache (TTL ≈ 6h) ────────────────────────────────────────────────────────

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000

interface CacheEntry {
  computedAt: number
  payload: RecommendationsPayload
}

const cache = new Map<string, CacheEntry>()

export function invalidateRecommendationsCache(projectId?: string): void {
  if (projectId) cache.delete(String(projectId))
  else cache.clear()
}

// ─── Heuristic helpers ───────────────────────────────────────────────────────

const CLOSED_STATUSES: DevIssueStatus[] = ['DONE', 'CANCELLED']
const STALE_IN_PROGRESS_DAYS = 14
const STALE_PR_DAYS = 7
const OLD_BACKLOG_DAYS = 60
const ROADMAP_INACTIVITY_DAYS = 21

const IMPROVEMENT_LABEL_HINTS = [/\bimprov/i, /améliorer/i, /amelioration/i, /enhancement/i, /polish/i, /ux/i, /a11y/i]
const FEATURE_LABEL_HINTS = [/\bfeature\b/i, /\bnouveau\b/i, /\bnew\b/i, /roadmap/i, /v\d/i, /mvp/i, /next/i]
const OPTIMIZATION_LABEL_HINTS = [/optim/i, /perf/i, /refactor/i, /cleanup/i, /tech[\s_-]?debt/i, /dette/i]

function daysSince(date: Date | string | null | undefined): number {
  if (!date) return Number.POSITIVE_INFINITY
  const t = typeof date === 'string' ? Date.parse(date) : date.getTime()
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000))
}

function matchesAny(value: string | null | undefined, patterns: RegExp[]): boolean {
  if (!value) return false
  return patterns.some((p) => p.test(value))
}

function labelsMatchAny(labels: string[] | undefined, patterns: RegExp[]): boolean {
  if (!labels || labels.length === 0) return false
  return labels.some((l) => patterns.some((p) => p.test(l)))
}

function fileHref(repoUrl: string | null, branch: string | null, path: string): string | null {
  if (!repoUrl) return null
  const b = branch || 'main'
  return `${repoUrl}/blob/${encodeURIComponent(b)}/${path.split('/').map(encodeURIComponent).join('/')}`
}

function priorityRank(p: RecommendationPriority): number {
  switch (p) {
    case 'critical':
      return 0
    case 'high':
      return 1
    case 'medium':
      return 2
    case 'low':
      return 3
  }
}

function sortItems(items: RecommendationItem[]): RecommendationItem[] {
  return items.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
}

// ─── Section builders ────────────────────────────────────────────────────────

interface IssueLite {
  _id: mongoose.Types.ObjectId
  identifier: string
  title: string
  status: DevIssueStatus
  priority: DevIssuePriority
  type: DevIssueType
  labels: string[]
  dueDate: Date | null
  startedAt: Date | null
  updatedAt: Date
  createdAt: Date
  github: {
    prNumber: number | null
    prUrl: string | null
    ciStatus: string | null
    mergedAt: Date | null
    branch: string | null
  } | null
}

function buildImproveSection(issues: IssueLite[], github: DevGithubSummary): RecommendationItem[] {
  const items: RecommendationItem[] = []

  // 1. PRs ouvertes avec CI en échec — blocant pour shipper.
  for (const pr of github.pullRequests.failing.slice(0, 6)) {
    items.push({
      id: `pr-ci-fail-${pr.issueId}`,
      section: 'improve',
      title: `PR #${pr.prNumber ?? '—'} en échec CI : ${pr.title}`,
      description: 'La CI échoue sur cette pull request. Corriger pour pouvoir merger.',
      priority: 'critical',
      source: 'ci',
      badges: ['CI', 'PR', pr.identifier],
      metric: null,
      actions: [
        ...(pr.prUrl ? [{ kind: 'open_pr' as const, label: 'Voir la PR', href: pr.prUrl }] : []),
        { kind: 'open_issue' as const, label: 'Voir l’issue', issueId: pr.issueId },
      ],
    })
  }

  // 2. PRs ouvertes "stale" (pas de merge depuis N jours, branche encore ouverte)
  for (const pr of github.pullRequests.open) {
    if (!pr.prUrl || pr.mergedAt) continue
    if (github.pullRequests.failing.find((f) => f.issueId === pr.issueId)) continue
    const linked = issues.find((i) => String(i._id) === pr.issueId)
    const age = linked ? daysSince(linked.updatedAt) : Number.POSITIVE_INFINITY
    if (age < STALE_PR_DAYS) continue
    if (!Number.isFinite(age)) continue
    items.push({
      id: `pr-stale-${pr.issueId}`,
      section: 'improve',
      title: `PR #${pr.prNumber ?? '—'} dormante : ${pr.title}`,
      description: `Aucune activité depuis ${age} j. Relancer la revue ou rebase/clore.`,
      priority: age > 21 ? 'high' : 'medium',
      source: 'pull_requests',
      badges: ['PR', pr.identifier, `${age} j`],
      metric: { label: 'inactif depuis', value: `${age} j` },
      actions: [
        { kind: 'open_pr', label: 'Voir la PR', href: pr.prUrl },
        { kind: 'open_issue', label: 'Voir l’issue', issueId: pr.issueId },
      ],
    })
    if (items.length >= 14) break
  }

  // 3. Issues IN_PROGRESS / IN_REVIEW sans mouvement depuis N jours
  for (const issue of issues) {
    if (issue.status !== 'IN_PROGRESS' && issue.status !== 'IN_REVIEW') continue
    const age = daysSince(issue.updatedAt)
    if (age < STALE_IN_PROGRESS_DAYS) continue
    const startedDays = issue.startedAt ? daysSince(issue.startedAt) : null
    items.push({
      id: `issue-stale-${String(issue._id)}`,
      section: 'improve',
      title: `${issue.identifier} bloquée en ${issue.status}`,
      description: `Pas de mise à jour depuis ${age} j${startedDays ? ` · démarrée il y a ${startedDays} j` : ''}. À débloquer ou requalifier.`,
      priority: age > 30 ? 'high' : 'medium',
      source: 'issues',
      badges: [issue.status, issue.identifier, `${age} j`],
      metric: { label: 'sans activité', value: `${age} j` },
      actions: [{ kind: 'open_issue', label: 'Voir l’issue', issueId: String(issue._id) }],
    })
    if (items.length >= 18) break
  }

  // 4. Issues "amélioration" (labels) en backlog/todo, encore non démarrées
  for (const issue of issues) {
    if (CLOSED_STATUSES.includes(issue.status)) continue
    if (issue.status === 'IN_PROGRESS' || issue.status === 'IN_REVIEW') continue
    if (!labelsMatchAny(issue.labels, IMPROVEMENT_LABEL_HINTS)) continue
    const age = daysSince(issue.updatedAt)
    items.push({
      id: `issue-improve-${String(issue._id)}`,
      section: 'improve',
      title: issue.title,
      description: `Amélioration repérée via labels (${issue.labels.join(', ')}).`,
      priority: issue.priority === 'URGENT' ? 'high' : 'medium',
      source: 'labels',
      badges: [issue.identifier, ...issue.labels.slice(0, 3)],
      metric: { label: 'créée il y a', value: `${age} j` },
      actions: [{ kind: 'open_issue', label: 'Voir l’issue', issueId: String(issue._id) }],
    })
    if (items.length >= 22) break
  }

  return sortItems(items).slice(0, 12)
}

function buildAddSection(issues: IssueLite[]): RecommendationItem[] {
  const items: RecommendationItem[] = []

  // 1. Issues type=FEATURE ouvertes, par priorité décroissante.
  const features = issues.filter((i) => i.type === 'FEATURE' && !CLOSED_STATUSES.includes(i.status))

  const priorityToScore: Record<DevIssuePriority, RecommendationPriority> = {
    URGENT: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    NO_PRIORITY: 'low',
  }

  for (const issue of features.slice(0, 12)) {
    const age = daysSince(issue.updatedAt)
    items.push({
      id: `feat-${String(issue._id)}`,
      section: 'add',
      title: issue.title,
      description: `Feature à planifier — actuellement ${issue.status}. ${issue.dueDate ? `Due ${new Date(issue.dueDate).toISOString().slice(0, 10)}.` : ''}`,
      priority: priorityToScore[issue.priority],
      source: 'backlog',
      badges: [issue.identifier, issue.priority, issue.status],
      metric: { label: 'inactif', value: `${age} j` },
      actions: [{ kind: 'open_issue', label: 'Voir l’issue', issueId: String(issue._id) }],
    })
  }

  // 2. Features détectées via labels mais d'un autre type (ex: TASK avec label "feature").
  for (const issue of issues) {
    if (CLOSED_STATUSES.includes(issue.status)) continue
    if (issue.type === 'FEATURE') continue
    if (!labelsMatchAny(issue.labels, FEATURE_LABEL_HINTS)) continue
    items.push({
      id: `feat-label-${String(issue._id)}`,
      section: 'add',
      title: issue.title,
      description: `Repérée comme évolution via labels (${issue.labels.slice(0, 3).join(', ')}).`,
      priority: issue.priority === 'URGENT' ? 'high' : 'medium',
      source: 'labels',
      badges: [issue.identifier, ...issue.labels.slice(0, 3)],
      metric: null,
      actions: [{ kind: 'open_issue', label: 'Voir l’issue', issueId: String(issue._id) }],
    })
    if (items.length >= 16) break
  }

  return sortItems(items).slice(0, 10)
}

function buildOptimizeSection(issues: IssueLite[], code: CodeMetricsSummary): RecommendationItem[] {
  const items: RecommendationItem[] = []

  // 1. Issues type=CHORE / labels d'optimisation, ouvertes.
  for (const issue of issues) {
    if (CLOSED_STATUSES.includes(issue.status)) continue
    const isChore = issue.type === 'CHORE'
    const looksOptim = labelsMatchAny(issue.labels, OPTIMIZATION_LABEL_HINTS)
    if (!isChore && !looksOptim) continue
    items.push({
      id: `optim-${String(issue._id)}`,
      section: 'optimize',
      title: issue.title,
      description: isChore
        ? 'Chore ouverte — à planifier dans un sprint de cleanup.'
        : `Optimisation repérée via labels (${issue.labels.slice(0, 3).join(', ')}).`,
      priority: issue.priority === 'URGENT' ? 'high' : isChore ? 'low' : 'medium',
      source: 'labels',
      badges: [issue.identifier, ...(isChore ? ['CHORE'] : []), ...issue.labels.slice(0, 2)],
      metric: null,
      actions: [{ kind: 'open_issue', label: 'Voir l’issue', issueId: String(issue._id) }],
    })
    if (items.length >= 12) break
  }

  // 2. Backlog très ancien (signe de dette ou de roadmap pas tenue à jour).
  const oldBacklog = issues
    .filter((i) => i.status === 'BACKLOG' && daysSince(i.createdAt) > OLD_BACKLOG_DAYS)
    .slice(0, 4)
  if (oldBacklog.length >= 5) {
    items.push({
      id: 'optim-old-backlog',
      section: 'optimize',
      title: `${oldBacklog.length}+ issues en backlog depuis +${OLD_BACKLOG_DAYS} j`,
      description: 'Trier le backlog : convertir en TODO, ré-estimer ou clore. Sinon le projet va dériver.',
      priority: 'low',
      source: 'backlog',
      badges: ['backlog', `+${OLD_BACKLOG_DAYS}j`],
      metric: { label: 'issues anciennes', value: oldBacklog.length },
      actions: [],
    })
  }

  // 3. Pas de roadmap active (aucune activité récente sur les issues ouvertes).
  const lastIssueUpdate = issues.reduce((max, i) => {
    const t = new Date(i.updatedAt).getTime()
    return t > max ? t : max
  }, 0)
  if (lastIssueUpdate > 0) {
    const inactivityDays = Math.floor((Date.now() - lastIssueUpdate) / (24 * 60 * 60 * 1000))
    if (inactivityDays > ROADMAP_INACTIVITY_DAYS) {
      items.push({
        id: 'optim-roadmap-stale',
        section: 'optimize',
        title: `Roadmap projet inactive depuis ${inactivityDays} j`,
        description: 'Aucune issue mise à jour récemment — re-planifier le prochain incrément.',
        priority: inactivityDays > 60 ? 'high' : 'medium',
        source: 'roadmap',
        badges: ['roadmap', `${inactivityDays} j`],
        metric: { label: 'sans activité', value: `${inactivityDays} j` },
        actions: [],
      })
    }
  }

  // 4. Métriques code globales si disponibles : ratio TS/JS qui penche fortement vers JS
  // ⇒ candidat à une migration progressive.
  if (code.available) {
    const tsLines = code.byExtension.filter((e) => e.ext === '.ts' || e.ext === '.tsx').reduce((s, e) => s + e.lines, 0)
    const jsLines = code.byExtension.filter((e) => e.ext === '.js' || e.ext === '.jsx').reduce((s, e) => s + e.lines, 0)
    if (jsLines > 0 && jsLines > tsLines * 0.5 && tsLines > 0) {
      items.push({
        id: 'optim-js-share',
        section: 'optimize',
        title: 'Part de JavaScript significative dans le code TypeScript',
        description: `${jsLines.toLocaleString('fr-FR')} l. JS pour ${tsLines.toLocaleString('fr-FR')} l. TS — migration progressive recommandée.`,
        priority: 'low',
        source: 'code_metrics',
        badges: ['code', 'migration'],
        metric: { label: 'JS / TS', value: `${Math.round((jsLines / Math.max(tsLines, 1)) * 100)}%` },
        actions: [],
      })
    }
  }

  return sortItems(items).slice(0, 10)
}

function buildLargeFilesSection(code: CodeMetricsSummary, github: DevGithubSummary): RecommendationItem[] {
  if (!code.available) return []
  const branch = github.defaultBranch
  const repoUrl = github.links.repoUrl
  const items: RecommendationItem[] = []
  for (const f of (code.largeFiles as LargeFile[]).slice(0, 12)) {
    const priority: RecommendationPriority =
      f.score >= 80 ? 'critical' : f.score >= 50 ? 'high' : f.score >= 20 ? 'medium' : 'low'
    items.push({
      id: `large-${f.path}`,
      section: 'large_files',
      title: f.path,
      description: f.reason,
      priority,
      source: 'code_metrics',
      badges: [f.language, `${f.lines} l.`, `seuil ${f.threshold}`],
      metric: { label: 'criticité', value: f.score },
      actions: repoUrl
        ? [
            {
              kind: 'open_file' as const,
              label: 'Ouvrir sur GitHub',
              href: fileHref(repoUrl, branch, f.path),
            },
          ]
        : [],
    })
  }
  return items
}

// ─── Compute (main entry) ────────────────────────────────────────────────────

export interface ComputeRecommendationsOptions {
  force?: boolean
  ttlMs?: number
}

export async function computeProjectRecommendations(
  projectId: mongoose.Types.ObjectId | string,
  opts: ComputeRecommendationsOptions = {},
): Promise<RecommendationsPayload | null> {
  const id = typeof projectId === 'string' ? new mongoose.Types.ObjectId(projectId) : projectId
  const key = String(id)
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS

  // Cache hit (unless forced)
  if (!opts.force) {
    const cached = cache.get(key)
    if (cached && Date.now() - cached.computedAt < ttl) {
      const ageSec = Math.floor((Date.now() - cached.computedAt) / 1000)
      return {
        ...cached.payload,
        fromCache: true,
        cacheAgeSeconds: ageSec,
        nextRefreshAt: new Date(cached.computedAt + ttl).toISOString(),
      }
    }
  }

  const project = await DevProject.findById(id).lean()
  if (!project) return null

  // Issues — fetch a window large enough for the heuristics but bounded so the
  // route stays cheap even on noisy projects.
  const issues = (await DevIssue.find({ project: id })
    .select('_id identifier title status priority type labels dueDate startedAt updatedAt createdAt github')
    .sort({ updatedAt: -1 })
    .limit(400)
    .lean()) as unknown as IssueLite[]

  const reasons: string[] = []
  let github: DevGithubSummary
  try {
    github = await computeProjectGithubSummary({
      _id: project._id,
      github: project.github ?? null,
    })
  } catch (e) {
    reasons.push(`GitHub: ${(e as Error).message}`)
    github = {
      configured: false,
      owner: null,
      repo: null,
      defaultBranch: null,
      htmlUrl: null,
      repoPath: null,
      links: {
        repoUrl: null,
        prsUrl: null,
        commitsUrl: null,
        actionsUrl: null,
        branchesUrl: null,
        issuesUrl: null,
      },
      pullRequests: {
        open: [],
        merged: [],
        failing: [],
        counts: { open: 0, merged: 0, failing: 0 },
      },
    }
  }

  // Recommendations reuse the periodic snapshot as well: do not revive a
  // synchronous filesystem scan through this secondary HTTP route.
  if (opts.force) void refreshProjectCodeMetrics(project.github ?? null)
  const code: CodeMetricsSummary = getCachedProjectCodeMetrics(project.github ?? null)
  if (!code.available && code.reason) reasons.push(`Code: ${code.reason}`)
  if (!github.configured && github.reason) reasons.push(`GitHub: ${github.reason}`)

  const improve = buildImproveSection(issues, github)
  const add = buildAddSection(issues)
  const optimize = buildOptimizeSection(issues, code)
  const largeFiles = buildLargeFilesSection(code, github)

  const bySeverity: Record<RecommendationPriority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  }
  for (const list of [improve, add, optimize, largeFiles]) {
    for (const item of list) bySeverity[item.priority] += 1
  }
  const total = improve.length + add.length + optimize.length + largeFiles.length

  const status: RecommendationStatus =
    total === 0 ? (reasons.length ? 'partial' : 'empty') : reasons.length > 0 ? 'partial' : 'ok'

  const generatedAt = new Date()
  const payload: RecommendationsPayload = {
    projectId: String(project._id),
    generatedAt: generatedAt.toISOString(),
    nextRefreshAt: new Date(generatedAt.getTime() + ttl).toISOString(),
    ttlSeconds: Math.round(ttl / 1000),
    fromCache: false,
    cacheAgeSeconds: 0,
    status,
    source: {
      issues: issues.length > 0,
      github: github.configured,
      code: code.available,
    },
    reasons,
    counts: {
      total,
      improve: improve.length,
      add: add.length,
      optimize: optimize.length,
      large_files: largeFiles.length,
      bySeverity,
    },
    sections: {
      improve,
      add,
      optimize,
      large_files: largeFiles,
    },
  }

  cache.set(key, { computedAt: generatedAt.getTime(), payload })
  return payload
}
