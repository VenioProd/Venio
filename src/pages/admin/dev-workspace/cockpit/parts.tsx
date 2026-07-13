import { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Plus,
  Sparkles,
  AlertOctagon,
  CalendarClock,
  CheckCircle2,
  Clock,
  Code2,
  Coins,
  ExternalLink,
  FileWarning,
  Files,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  HeartPulse,
  Hash,
  ListChecks,
  MessageSquare,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  TYPE_COLOR,
  TYPE_LABEL,
  type DevCiStatus,
  type DevCockpitActivityEvent,
  type DevCockpitIssueRef,
  type DevCockpitTimelineEvent,
  type DevGithubPullRequestRef,
  type DevDeploymentSummary,
  type DevIssuePriority,
  type DevIssueStatus,
  type DevIssueType,
  type DevProjectGithubConfig,
  type DevProjectIntelligence,
  type DevLargeFilesSnapshot,
  type DevRepoQuality,
} from '../../../../services/dev'
import { clamp01, formatBytes, formatNumber, formatRelative, formatShortDate, relativeFR, userInitial } from './helpers'

export const GithubIcon = ({ size = 12 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    style={{ display: 'inline-block', verticalAlign: 'middle' }}
  >
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.17c-3.2.7-3.88-1.36-3.88-1.36-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.74 1.27 3.41.97.1-.76.4-1.27.74-1.56-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.17-3.07-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.17a11 11 0 0 1 5.79 0c2.2-1.48 3.17-1.17 3.17-1.17.63 1.59.24 2.76.12 3.05.73.8 1.17 1.82 1.17 3.07 0 4.4-2.69 5.36-5.25 5.65.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
  </svg>
)

interface IssueRowProps {
  issue: DevCockpitIssueRef
  onOpen: (id: string) => void
}

export const IssueRow = ({ issue, onOpen }: IssueRowProps) => (
  <button
    type="button"
    className="cockpit-issue-row"
    onClick={() => onOpen(issue._id)}
    style={{ ['--prio-color' as never]: PRIORITY_COLOR[issue.priority] }}
  >
    <span className="cockpit-issue-row-id">{issue.identifier}</span>
    <span className="cockpit-issue-row-title">{issue.title}</span>
    <span
      className="cockpit-issue-row-status"
      style={{ color: STATUS_COLOR[issue.status] }}
      title={STATUS_LABEL[issue.status]}
    >
      <span className="cockpit-status-dot" style={{ background: STATUS_COLOR[issue.status] }} />
      {STATUS_LABEL[issue.status]}
    </span>
    {issue.assignee && (
      <span className="cockpit-issue-row-assignee" title={issue.assignee.name || issue.assignee.email}>
        {userInitial(issue.assignee)}
      </span>
    )}
    {issue.dueDate && (
      <span className="cockpit-issue-row-due">
        <CalendarClock size={11} />
        {formatShortDate(issue.dueDate)}
      </span>
    )}
  </button>
)

interface ActivityRowProps {
  event: DevCockpitActivityEvent
  onOpen: (id: string) => void
}

const ACTIVITY_LABEL: Record<DevCockpitActivityEvent['type'], string> = {
  issue_created: 'a créé',
  issue_completed: 'a terminé',
  issue_updated: 'a mis à jour',
  comment: 'a commenté',
}

const ACTIVITY_ICON: Record<DevCockpitActivityEvent['type'], typeof Sparkles> = {
  issue_created: Plus,
  issue_completed: CheckCircle2,
  issue_updated: RefreshCw,
  comment: MessageSquare,
}

export const ActivityRow = ({ event, onOpen }: ActivityRowProps) => {
  const Icon = ACTIVITY_ICON[event.type]
  return (
    <div className={`cockpit-activity-row tone-${event.type}`}>
      <span className="cockpit-activity-icon">
        <Icon size={12} />
      </span>
      <span className="cockpit-activity-actor">{event.actor?.name || event.actor?.email || 'Système'}</span>
      <span className="cockpit-activity-action">{ACTIVITY_LABEL[event.type]}</span>
      {event.issue && (
        <button type="button" className="cockpit-activity-issue" onClick={() => event.issue && onOpen(event.issue._id)}>
          {event.issue.identifier} <span className="cockpit-activity-issue-title">{event.issue.title}</span>
        </button>
      )}
      <span className="cockpit-activity-date">{formatRelative(event.at)}</span>
    </div>
  )
}

interface TimelineRowProps {
  event: DevCockpitTimelineEvent
  onOpen: (id: string) => void
}

const TIMELINE_LABEL: Record<DevCockpitTimelineEvent['type'], string> = {
  created: 'Issue créée',
  status_changed: 'Statut modifié',
  priority_changed: 'Priorité modifiée',
  type_changed: 'Type modifié',
  assigned: 'Assignation modifiée',
  metadata_changed: 'Métadonnées modifiées',
  commented: 'Commentaire',
  comment: 'Commentaire',
  github_linked: 'Lien GitHub',
  ci_changed: 'CI',
  agent_started: 'Agent démarré',
  agent_blocked: 'Agent bloqué',
  agent_done: 'Agent terminé',
  deployed: 'Déploiement',
  archived: 'Issue archivée',
}

const TIMELINE_ICON: Record<DevCockpitTimelineEvent['category'], typeof Sparkles> = {
  change: RefreshCw,
  comment: MessageSquare,
  github: GitPullRequest,
  agent: Sparkles,
  deployment: Play,
}

function githubMeta(metadata: Record<string, unknown>): { prUrl: string | null; commitSha: string | null } {
  const github = metadata.github
  if (!github || typeof github !== 'object') return { prUrl: null, commitSha: null }
  const value = github as Record<string, unknown>
  return {
    prUrl: typeof value.prUrl === 'string' ? value.prUrl : null,
    commitSha: typeof value.commitSha === 'string' ? value.commitSha : null,
  }
}

export const TimelineRow = ({ event, onOpen }: TimelineRowProps) => {
  const Icon = TIMELINE_ICON[event.category]
  const github = githubMeta(event.metadata)
  return (
    <div className={`cockpit-timeline-row tone-${event.category}`}>
      <span className="cockpit-timeline-icon">
        <Icon size={12} />
      </span>
      <div className="cockpit-timeline-main">
        <div className="cockpit-timeline-topline">
          <span className="cockpit-timeline-label">{TIMELINE_LABEL[event.type]}</span>
          <span className="cockpit-timeline-actor">{event.actor?.name || event.actor?.email || 'Système'}</span>
          <span className="cockpit-timeline-date">{formatRelative(event.at)}</span>
        </div>
        <div className="cockpit-timeline-summary">{event.summary}</div>
        {event.commentBody && <div className="cockpit-timeline-comment">{event.commentBody}</div>}
        <div className="cockpit-timeline-links">
          {event.issue && (
            <button type="button" className="cockpit-timeline-issue" onClick={() => onOpen(event.issue!._id)}>
              {event.issue.identifier} <span>{event.issue.title}</span>
            </button>
          )}
          {github.prUrl && (
            <a href={github.prUrl} target="_blank" rel="noopener noreferrer" className="cockpit-timeline-external">
              PR <ExternalLink size={10} />
            </a>
          )}
          {github.commitSha && <span className="cockpit-timeline-sha">{github.commitSha.slice(0, 12)}</span>}
        </div>
      </div>
    </div>
  )
}

interface ChartTooltipPayload {
  payload?: { date?: string; completed?: number; created?: number }
  value?: number
  name?: string
  color?: string
}

export const VelocityTooltip = ({ active, payload }: { active?: boolean; payload?: ChartTooltipPayload[] }) => {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload || {}
  return (
    <div className="cockpit-chart-tooltip">
      <strong>{point.date}</strong>
      <span>
        <CheckCircle2 size={10} style={{ color: '#10b981' }} /> Terminées : {point.completed ?? 0}
      </span>
      <span>
        <Plus size={10} style={{ color: '#7c5cff' }} /> Créées : {point.created ?? 0}
      </span>
    </div>
  )
}

export const PieTooltip = ({ active, payload }: { active?: boolean; payload?: ChartTooltipPayload[] }) => {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="cockpit-chart-tooltip">
      <strong>{p.name}</strong>
      <span>{p.value} issue(s)</span>
    </div>
  )
}

export const BarTooltip = PieTooltip

const CI_TONE: Record<DevCiStatus, 'ok' | 'warn' | 'fail' | 'neutral'> = {
  SUCCESS: 'ok',
  PENDING: 'warn',
  RUNNING: 'warn',
  FAILURE: 'fail',
  UNKNOWN: 'neutral',
}

const CI_LABEL: Record<DevCiStatus, string> = {
  PENDING: 'En attente',
  RUNNING: 'En cours',
  SUCCESS: 'Succès',
  FAILURE: 'Échec',
  UNKNOWN: 'Inconnu',
}

interface GithubPanelProps {
  github: DevProjectIntelligence['github']
  configDraft: DevProjectGithubConfig | null
  canManage: boolean
  saving: boolean
  saveError: string | null
  onChangeDraft: (patch: Partial<DevProjectGithubConfig>) => void
  onSubmit: () => void
  onCancel: () => void
  editing: boolean
  onToggleEdit: (v: boolean) => void
}

export const GithubPanel = ({
  github,
  configDraft,
  canManage,
  saving,
  saveError,
  onChangeDraft,
  onSubmit,
  onCancel,
  editing,
  onToggleEdit,
}: GithubPanelProps) => {
  const { links, pullRequests, configured, reason } = github
  return (
    <div className="cockpit-card cockpit-intel-card">
      <div className="cockpit-card-header">
        <span className="cockpit-card-kicker">
          <GithubIcon size={11} /> GitHub
        </span>
        <span className="cockpit-card-meta">
          {configured ? (
            <>
              <GitPullRequest size={11} /> {pullRequests.counts.open} ouvertes · <GitMerge size={11} />{' '}
              {pullRequests.counts.merged} mergées
              {pullRequests.counts.failing > 0 && (
                <>
                  {' '}
                  · <XCircle size={11} style={{ color: '#fca5a5' }} /> {pullRequests.counts.failing} CI fail
                </>
              )}
            </>
          ) : (
            <span style={{ color: '#94a3b8' }}>non configuré</span>
          )}
        </span>
      </div>

      {!editing && (
        <>
          {configured ? (
            <div className="cockpit-gh-links">
              {links.repoUrl && (
                <a className="cockpit-gh-chip" href={links.repoUrl} target="_blank" rel="noopener noreferrer">
                  <GithubIcon size={12} /> Repo
                </a>
              )}
              {links.prsUrl && (
                <a className="cockpit-gh-chip" href={links.prsUrl} target="_blank" rel="noopener noreferrer">
                  <GitPullRequest size={12} /> PRs ouvertes
                </a>
              )}
              {links.commitsUrl && (
                <a className="cockpit-gh-chip" href={links.commitsUrl} target="_blank" rel="noopener noreferrer">
                  <GitCommit size={12} /> Commits
                </a>
              )}
              {links.actionsUrl && (
                <a className="cockpit-gh-chip" href={links.actionsUrl} target="_blank" rel="noopener noreferrer">
                  <Play size={12} /> Actions
                </a>
              )}
              {links.branchesUrl && (
                <a className="cockpit-gh-chip" href={links.branchesUrl} target="_blank" rel="noopener noreferrer">
                  <GitBranch size={12} /> Branches
                </a>
              )}
            </div>
          ) : (
            <div className="cockpit-gh-empty">{reason || 'GitHub non configuré.'}</div>
          )}

          {pullRequests.open.length > 0 && (
            <div className="cockpit-gh-prs">
              <div className="cockpit-gh-prs-header">Pull requests ouvertes</div>
              {pullRequests.open.slice(0, 6).map((pr) => (
                <PullRequestRow key={pr.issueId} pr={pr} />
              ))}
            </div>
          )}

          {canManage && (
            <div className="cockpit-gh-actions">
              <button className="cockpit-btn subtle" onClick={() => onToggleEdit(true)}>
                {configured ? 'Modifier la configuration GitHub' : 'Configurer GitHub'}
              </button>
            </div>
          )}
        </>
      )}

      {editing && canManage && (
        <form
          className="cockpit-gh-form"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          <div className="cockpit-gh-form-grid">
            <label>
              <span>Owner</span>
              <input
                value={configDraft?.owner ?? ''}
                onChange={(e) => onChangeDraft({ owner: e.target.value })}
                placeholder="raphaelbentv"
              />
            </label>
            <label>
              <span>Repo</span>
              <input
                value={configDraft?.repo ?? ''}
                onChange={(e) => onChangeDraft({ repo: e.target.value })}
                placeholder="venio"
              />
            </label>
            <label>
              <span>Branche</span>
              <input
                value={configDraft?.defaultBranch ?? ''}
                onChange={(e) => onChangeDraft({ defaultBranch: e.target.value })}
                placeholder="main"
              />
            </label>
            <label>
              <span>URL (alternatif)</span>
              <input
                value={configDraft?.htmlUrl ?? ''}
                onChange={(e) => onChangeDraft({ htmlUrl: e.target.value })}
                placeholder="https://github.com/org/repo"
              />
            </label>
            <label className="cockpit-gh-form-wide">
              <span>repoPath (chemin relatif sous DEV_REPO_ROOT côté serveur, pour scanner les LoC)</span>
              <input
                value={configDraft?.repoPath ?? ''}
                onChange={(e) => onChangeDraft({ repoPath: e.target.value })}
                placeholder="venio-dev-v2/Venio"
              />
            </label>
          </div>
          {saveError && <div className="cockpit-gh-form-error">{saveError}</div>}
          <div className="cockpit-gh-form-actions">
            <button type="button" className="cockpit-btn subtle" onClick={onCancel} disabled={saving}>
              Annuler
            </button>
            <button type="submit" className="cockpit-btn primary" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export const PullRequestRow = ({ pr }: { pr: DevGithubPullRequestRef }) => {
  const tone = pr.ciStatus ? CI_TONE[pr.ciStatus] : 'neutral'
  const merged = Boolean(pr.mergedAt)
  return (
    <a
      className="cockpit-gh-pr-row"
      href={pr.prUrl || undefined}
      target="_blank"
      rel="noopener noreferrer"
      data-disabled={pr.prUrl ? undefined : 'true'}
    >
      <span className={`cockpit-gh-pr-state ${merged ? 'merged' : 'open'}`}>
        {merged ? <GitMerge size={12} /> : <GitPullRequest size={12} />}
        {pr.prNumber ? `#${pr.prNumber}` : '—'}
      </span>
      <span className="cockpit-gh-pr-title">
        <span className="cockpit-gh-pr-issue">{pr.identifier}</span>
        {pr.title}
      </span>
      {pr.branch && (
        <span className="cockpit-gh-pr-branch" title={pr.branch}>
          <GitBranch size={10} />
          {pr.branch}
        </span>
      )}
      {pr.ciStatus && (
        <span className={`cockpit-gh-pr-ci tone-${tone}`}>
          {tone === 'ok' && <CheckCircle2 size={10} />}
          {tone === 'fail' && <XCircle size={10} />}
          {tone === 'warn' && <Activity size={10} />}
          {CI_LABEL[pr.ciStatus]}
        </span>
      )}
    </a>
  )
}

export const TokensPanel = ({ tokens }: { tokens: DevProjectIntelligence['tokens'] }) => {
  return (
    <div className="cockpit-card cockpit-intel-card">
      <div className="cockpit-card-header">
        <span className="cockpit-card-kicker">
          <Coins size={11} /> Tokens LLM
        </span>
        <span className="cockpit-card-meta">{tokens.available ? 'mesuré' : 'non disponible'}</span>
      </div>
      {tokens.available ? (
        <div className="cockpit-tokens-grid">
          <div className="cockpit-tokens-cell">
            <div className="cockpit-tokens-cell-label">Total</div>
            <div className="cockpit-tokens-cell-value">{tokens.totalTokens?.toLocaleString('fr-FR')}</div>
          </div>
          <div className="cockpit-tokens-cell">
            <div className="cockpit-tokens-cell-label">Entrée</div>
            <div className="cockpit-tokens-cell-value">{tokens.inputTokens?.toLocaleString('fr-FR') ?? '—'}</div>
          </div>
          <div className="cockpit-tokens-cell">
            <div className="cockpit-tokens-cell-label">Sortie</div>
            <div className="cockpit-tokens-cell-value">{tokens.outputTokens?.toLocaleString('fr-FR') ?? '—'}</div>
          </div>
          <div className="cockpit-tokens-cell">
            <div className="cockpit-tokens-cell-label">Coût est.</div>
            <div className="cockpit-tokens-cell-value">
              {tokens.estimatedCostUsd != null ? `$${tokens.estimatedCostUsd.toFixed(2)}` : '—'}
            </div>
          </div>
        </div>
      ) : (
        <div className="cockpit-tokens-empty">
          <p>{tokens.reason}</p>
          {tokens.missing?.length > 0 && (
            <>
              <div className="cockpit-tokens-missing-label">Pour activer la mesure :</div>
              <ul>
                {tokens.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export const CodeMetricsPanel = ({ code }: { code: DevProjectIntelligence['code'] }) => {
  const maxLines = code.byExtension.reduce((m, e) => Math.max(m, e.lines), 0)
  return (
    <div className="cockpit-card cockpit-intel-card">
      <div className="cockpit-card-header">
        <span className="cockpit-card-kicker">
          <Code2 size={11} /> Code
        </span>
        <span className="cockpit-card-meta">
          {code.available ? (
            <>
              <Files size={11} /> {formatNumber(code.totals.files)} fichiers · {formatNumber(code.totals.lines)} lignes
              · {formatBytes(code.totals.bytes)}
            </>
          ) : (
            <span style={{ color: '#94a3b8' }}>non disponible</span>
          )}
        </span>
      </div>
      {code.available ? (
        <div className="cockpit-code-stack">
          <ul className="cockpit-code-langs">
            {code.byExtension.slice(0, 8).map((ext) => {
              const pct = maxLines > 0 ? Math.round((ext.lines / maxLines) * 100) : 0
              return (
                <li key={ext.ext} className="cockpit-code-lang">
                  <div className="cockpit-code-lang-row">
                    <span className="cockpit-code-lang-name">
                      <span className="cockpit-code-lang-dot" data-ext={ext.ext} />
                      {ext.language}
                      <span className="cockpit-code-lang-ext">{ext.ext || '—'}</span>
                    </span>
                    <span className="cockpit-code-lang-meta">
                      {formatNumber(ext.files)} · {formatNumber(ext.lines)} l
                    </span>
                  </div>
                  <span className="cockpit-code-lang-bar">
                    <span style={{ width: `${pct}%` }} />
                  </span>
                </li>
              )
            })}
          </ul>
          {code.topFilesGlobal.length > 0 && (
            <details className="cockpit-code-top">
              <summary>Plus gros fichiers ({code.topFilesGlobal.length})</summary>
              <ul>
                {code.topFilesGlobal.map((f) => (
                  <li key={f.path}>
                    <span className="cockpit-code-top-path">{f.path}</span>
                    <span className="cockpit-code-top-meta">
                      {formatNumber(f.lines)} lignes · {formatBytes(f.bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {code.reason && (
            <div className="cockpit-code-warn">
              <AlertTriangle size={11} /> {code.reason}
            </div>
          )}
        </div>
      ) : (
        <div className="cockpit-code-empty">{code.reason || 'Scan code non disponible.'}</div>
      )}
    </div>
  )
}

const QUALITY_STATUS_LABEL = {
  ok: 'OK',
  warn: 'À suivre',
  critical: 'À traiter',
  unavailable: 'Indisponible',
} as const

/** Compact, source-first view: unavailable signals never turn into green points. */
export const RepoQualityPanel = ({ quality }: { quality: DevRepoQuality }) => {
  const actionable = quality.signals.filter((signal) => signal.status === 'warn' || signal.status === 'critical')
  return (
    <div className="cockpit-card cockpit-intel-card cockpit-quality">
      <div className="cockpit-card-header">
        <span className="cockpit-card-kicker">
          <Activity size={11} /> Qualité du repo
        </span>
        <span className="cockpit-card-meta">
          {quality.score === null ? 'score indisponible' : `score sur ${quality.scoredOutOf} pts observés`}
        </span>
      </div>
      <div className="cockpit-quality-summary">
        <strong className={`cockpit-quality-score${quality.score === null ? ' unavailable' : ''}`}>
          {quality.score === null ? '—' : `${quality.score}/100`}
        </strong>
        <span>{quality.score === null ? 'Aucune donnée fiable collectée.' : quality.formula}</span>
      </div>
      <ul className="cockpit-quality-signals">
        {quality.signals.map((signal) => (
          <li key={signal.id} className={`tone-${signal.status}`}>
            <span className="cockpit-quality-status">{QUALITY_STATUS_LABEL[signal.status]}</span>
            <span className="cockpit-quality-main">
              <strong>{signal.label}</strong>
              <span>{signal.value}</span>
              {signal.action && <em>{signal.action}</em>}
              {signal.limitation && <small>{signal.limitation}</small>}
            </span>
            <span className="cockpit-quality-points">
              {signal.points === null ? '—' : `${signal.points}/${signal.maxPoints}`}
            </span>
            <span className="cockpit-quality-source" title={signal.source}>
              {signal.source}
              {signal.checkedAt ? ` · ${formatRelative(signal.checkedAt)}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {actionable.length > 0 && (
        <div className="cockpit-quality-action">{actionable.length} signal(aux) actionnable(s) ci-dessus.</div>
      )}
    </div>
  )
}

const CI_STATUS_LABEL: Record<DevCiStatus, string> = {
  PENDING: 'En attente',
  RUNNING: 'En cours',
  SUCCESS: 'Succès',
  FAILURE: 'Échec',
  UNKNOWN: 'Inconnu',
}

const DEPLOYMENT_STATUS_LABEL: Record<DevDeploymentSummary['deployment']['status'], string> = {
  success: 'Réussi',
  failed: 'Échec',
  running: 'En cours',
  unknown: 'Inconnu',
}

const HEALTHCHECK_STATUS_LABEL: Record<DevDeploymentSummary['healthcheck']['status'], string> = {
  healthy: 'Sain',
  degraded: 'Dégradé',
  unhealthy: 'En échec',
  unknown: 'Inconnu',
}

function deploymentTone(status: string | null): 'ok' | 'warn' | 'fail' | 'neutral' {
  if (status === 'SUCCESS' || status === 'success' || status === 'healthy') return 'ok'
  if (status === 'FAILURE' || status === 'failed' || status === 'unhealthy') return 'fail'
  if (status === 'PENDING' || status === 'RUNNING' || status === 'running' || status === 'degraded') return 'warn'
  return 'neutral'
}

function deploymentSource(source: DevDeploymentSummary['ci']['source']): string {
  if (source === 'timeline_deployment') return 'timeline de déploiement'
  if (source === 'timeline_ci') return 'timeline CI'
  if (source === 'issue_github') return 'métadonnées GitHub de l’issue'
  return 'aucune donnée'
}

/** A bounded, source-first summary: no client-supplied URL or live probe. */
export const DeploymentPanel = ({ deployment }: { deployment: DevDeploymentSummary }) => (
  <div className="cockpit-card cockpit-intel-card cockpit-deployment">
    <div className="cockpit-card-header">
      <span className="cockpit-card-kicker">
        <Play size={11} /> Déploiement production
      </span>
      <span className={`cockpit-deployment-freshness tone-${deployment.freshness}`}>
        {deployment.freshness === 'fresh'
          ? 'données fraîches'
          : deployment.freshness === 'stale'
            ? 'données anciennes'
            : 'fraîcheur inconnue'}
      </span>
    </div>

    <dl className="cockpit-deployment-list">
      <div>
        <dt>
          <GitCommit size={12} /> Commit en production
        </dt>
        <dd>
          {deployment.productionCommit.sha ? (
            deployment.productionCommit.url ? (
              <a href={deployment.productionCommit.url} target="_blank" rel="noopener noreferrer">
                {deployment.productionCommit.sha.slice(0, 12)} <ExternalLink size={10} />
              </a>
            ) : (
              <code>{deployment.productionCommit.sha.slice(0, 12)}</code>
            )
          ) : (
            'Inconnu'
          )}
          <small>
            {deployment.productionCommit.observedAt
              ? `observé ${formatRelative(deployment.productionCommit.observedAt)}`
              : 'non enregistré'}
          </small>
        </dd>
      </div>
      <div>
        <dt>
          <GitPullRequest size={12} /> Dernier CI / build
        </dt>
        <dd>
          <span className={`cockpit-deployment-status tone-${deploymentTone(deployment.ci.status)}`}>
            {deployment.ci.status ? CI_STATUS_LABEL[deployment.ci.status] : 'Inconnu'}
          </span>
          {deployment.ci.runUrl && (
            <a
              href={deployment.ci.runUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cockpit-deployment-link"
            >
              Run <ExternalLink size={10} />
            </a>
          )}
          <small>
            {deployment.ci.observedAt ? `observé ${formatRelative(deployment.ci.observedAt)}` : 'non enregistré'}
          </small>
        </dd>
      </div>
      <div>
        <dt>
          <Play size={12} /> Dernier déploiement
        </dt>
        <dd>
          <span className={`cockpit-deployment-status tone-${deploymentTone(deployment.deployment.status)}`}>
            {DEPLOYMENT_STATUS_LABEL[deployment.deployment.status]}
          </span>
          {deployment.deployment.logsUrl && (
            <a
              href={deployment.deployment.logsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cockpit-deployment-link"
            >
              Logs <ExternalLink size={10} />
            </a>
          )}
          <small>
            {deployment.deployment.observedAt
              ? `observé ${formatRelative(deployment.deployment.observedAt)}`
              : 'non enregistré'}
          </small>
        </dd>
      </div>
      <div>
        <dt>
          <HeartPulse size={12} /> Healthcheck
        </dt>
        <dd>
          <span className={`cockpit-deployment-status tone-${deploymentTone(deployment.healthcheck.status)}`}>
            {HEALTHCHECK_STATUS_LABEL[deployment.healthcheck.status]}
          </span>
          <small>
            {deployment.healthcheck.observedAt
              ? `observé ${formatRelative(deployment.healthcheck.observedAt)}`
              : 'non enregistré'}
          </small>
        </dd>
      </div>
    </dl>

    <details className="cockpit-deployment-details">
      <summary>Sources et limites</summary>
      <p>
        Sources : {deploymentSource(deployment.deployment.source)} et métadonnées GitHub déjà associées au projet. Les
        liens sont construits côté serveur depuis le dépôt configuré.
      </p>
      <p>
        Aucune sonde externe n’est exécutée par cette carte : sans événement de production ou healthcheck enregistré,
        l’état reste « Inconnu ». Les données sont considérées anciennes après {deployment.freshnessThresholdHours} h.
      </p>
      {!deployment.configured && deployment.reason && <p className="cockpit-deployment-warning">{deployment.reason}</p>}
    </details>
  </div>
)

interface LargeFilesPanelProps {
  snapshot: DevLargeFilesSnapshot | null
  loading: boolean
  onRefresh: () => void
  github: DevProjectIntelligence['github']
  nextRefreshIn: number
}

export const LargeFilesPanel = ({ snapshot, loading, onRefresh, github, nextRefreshIn }: LargeFilesPanelProps) => {
  const repoBase = github.links.repoUrl
  const branch = github.defaultBranch || 'main'

  return (
    <div className="cockpit-card cockpit-intel-card cockpit-large-files">
      <div className="cockpit-card-header">
        <span className="cockpit-card-kicker">
          <FileWarning size={11} /> Fichiers à refactor
        </span>
        <span className="cockpit-card-meta">
          {snapshot?.available ? (
            <>
              {snapshot.largeFiles.length} candidat(s)
              {snapshot.scannedAt && (
                <>
                  {' '}
                  · scanné <RelativeTime iso={snapshot.scannedAt} />
                </>
              )}{' '}
              · prochaine vérif {nextRefreshIn}s
            </>
          ) : (
            <span style={{ color: '#94a3b8' }}>non disponible</span>
          )}
          <button
            type="button"
            className="cockpit-icon-btn"
            onClick={onRefresh}
            disabled={loading}
            title="Demander une nouvelle collecte en arrière-plan"
            aria-label="Demander une nouvelle collecte"
          >
            <RefreshCw size={11} className={loading ? 'cockpit-spin' : undefined} />
          </button>
        </span>
      </div>
      {!snapshot ? (
        <div className="cockpit-empty">Chargement…</div>
      ) : !snapshot.available ? (
        <div className="cockpit-empty">{snapshot.reason || 'Scan indisponible.'}</div>
      ) : snapshot.largeFiles.length === 0 ? (
        <div className="cockpit-empty">Aucun fichier au-dessus des seuils.</div>
      ) : (
        <ul className="cockpit-large-list">
          {snapshot.largeFiles.slice(0, 12).map((f) => {
            const tone = f.score >= 66 ? 'fail' : f.score >= 33 ? 'warn' : 'neutral'
            const url = repoBase ? `${repoBase}/blob/${branch}/${encodeURI(f.path)}` : null
            return (
              <li key={f.path} className={`cockpit-large-row tone-${tone}`}>
                <span className="cockpit-large-bar" style={{ ['--p' as never]: clamp01(f.score / 100) }} />
                <span className="cockpit-large-main">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="cockpit-large-path">
                      {f.path}
                    </a>
                  ) : (
                    <span className="cockpit-large-path">{f.path}</span>
                  )}
                  <span className="cockpit-large-meta">
                    {f.language}
                    {f.ext ? ` · ${f.ext}` : ''} · seuil {f.threshold}
                  </span>
                </span>
                <span className="cockpit-large-lines">{formatNumber(f.lines)} l</span>
                <span className={`cockpit-large-score tone-${tone}`}>{f.score}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export const RelativeTime = ({ iso }: { iso: string }) => {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])
  return <>{relativeFR(iso)}</>
}
