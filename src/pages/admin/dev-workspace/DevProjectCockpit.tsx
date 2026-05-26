import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  Code2,
  Coins,
  ExternalLink,
  FileWarning,
  Files,
  Flame,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Hash,
  ListChecks,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Users,
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
  fetchDevProjectCockpit,
  fetchDevProjectIntelligence,
  fetchDevProjectLargeFiles,
  updateDevProject,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_ORDER,
  TYPE_COLOR,
  TYPE_LABEL,
  type DevCiStatus,
  type DevCockpit,
  type DevCockpitActivityEvent,
  type DevCockpitIssueRef,
  type DevGithubPullRequestRef,
  type DevIssuePriority,
  type DevIssueStatus,
  type DevIssueType,
  type DevProjectGithubConfig,
  type DevProjectIntelligence,
  type DevLargeFilesSnapshot,
} from '@/services/dev'
import { useAuth } from '@/context/AuthContext'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'
import { logger } from '@/lib/logger'
import RecommendationsPanel from './RecommendationsPanel'
import './DevProjectCockpit.css'

const HEALTH_META: Record<DevCockpit['health'], { label: string; tone: 'ok' | 'warn' | 'fail'; icon: typeof Sparkles }> = {
  on_track: { label: 'On track', tone: 'ok', icon: Sparkles },
  at_risk: { label: 'At risk', tone: 'warn', icon: AlertTriangle },
  blocked: { label: 'Blocked', tone: 'fail', icon: ShieldAlert },
}

function formatRelative(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const diff = Date.now() - d.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return "à l'instant"
  if (diff < hour) return `il y a ${Math.floor(diff / minute)} min`
  if (diff < day) return `il y a ${Math.floor(diff / hour)} h`
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function userInitial(u: { name?: string; email?: string } | null | undefined): string {
  if (!u) return '?'
  const name = u.name || u.email || ''
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'kB', 'MB', 'GB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR')
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

// Local "GitHub" mark — lucide-react in this repo doesn't bundle the brand icon.
const GithubIcon = ({ size = 12 }: { size?: number }) => (
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

const IssueRow = ({ issue, onOpen }: IssueRowProps) => (
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

const ActivityRow = ({ event, onOpen }: ActivityRowProps) => {
  const Icon = ACTIVITY_ICON[event.type]
  return (
    <div className={`cockpit-activity-row tone-${event.type}`}>
      <span className="cockpit-activity-icon">
        <Icon size={12} />
      </span>
      <span className="cockpit-activity-actor">{event.actor?.name || event.actor?.email || 'Système'}</span>
      <span className="cockpit-activity-action">{ACTIVITY_LABEL[event.type]}</span>
      {event.issue && (
        <button
          type="button"
          className="cockpit-activity-issue"
          onClick={() => event.issue && onOpen(event.issue._id)}
        >
          {event.issue.identifier} <span className="cockpit-activity-issue-title">{event.issue.title}</span>
        </button>
      )}
      <span className="cockpit-activity-date">{formatRelative(event.at)}</span>
    </div>
  )
}

interface ChartTooltipPayload {
  payload?: { date?: string; completed?: number; created?: number }
  value?: number
  name?: string
  color?: string
}

const VelocityTooltip = ({ active, payload }: { active?: boolean; payload?: ChartTooltipPayload[] }) => {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload || {}
  return (
    <div className="cockpit-chart-tooltip">
      <strong>{point.date}</strong>
      <span><CheckCircle2 size={10} style={{ color: '#10b981' }} /> Terminées : {point.completed ?? 0}</span>
      <span><Plus size={10} style={{ color: '#7c5cff' }} /> Créées : {point.created ?? 0}</span>
    </div>
  )
}

const PieTooltip = ({ active, payload }: { active?: boolean; payload?: ChartTooltipPayload[] }) => {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="cockpit-chart-tooltip">
      <strong>{p.name}</strong>
      <span>{p.value} issue(s)</span>
    </div>
  )
}

const BarTooltip = PieTooltip

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

const GithubPanel = ({
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
        <span className="cockpit-card-kicker"><GithubIcon size={11} /> GitHub</span>
        <span className="cockpit-card-meta">
          {configured ? (
            <>
              <GitPullRequest size={11} /> {pullRequests.counts.open} ouvertes ·{' '}
              <GitMerge size={11} /> {pullRequests.counts.merged} mergées
              {pullRequests.counts.failing > 0 && (
                <> · <XCircle size={11} style={{ color: '#fca5a5' }} /> {pullRequests.counts.failing} CI fail</>
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

const PullRequestRow = ({ pr }: { pr: DevGithubPullRequestRef }) => {
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

const TokensPanel = ({ tokens }: { tokens: DevProjectIntelligence['tokens'] }) => {
  return (
    <div className="cockpit-card cockpit-intel-card">
      <div className="cockpit-card-header">
        <span className="cockpit-card-kicker"><Coins size={11} /> Tokens LLM</span>
        <span className="cockpit-card-meta">
          {tokens.available ? 'mesuré' : 'non disponible'}
        </span>
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

const CodeMetricsPanel = ({ code }: { code: DevProjectIntelligence['code'] }) => {
  const maxLines = code.byExtension.reduce((m, e) => Math.max(m, e.lines), 0)
  return (
    <div className="cockpit-card cockpit-intel-card">
      <div className="cockpit-card-header">
        <span className="cockpit-card-kicker"><Code2 size={11} /> Code</span>
        <span className="cockpit-card-meta">
          {code.available ? (
            <>
              <Files size={11} /> {formatNumber(code.totals.files)} fichiers ·{' '}
              {formatNumber(code.totals.lines)} lignes · {formatBytes(code.totals.bytes)}
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
                  <span className="cockpit-code-lang-bar"><span style={{ width: `${pct}%` }} /></span>
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
            <div className="cockpit-code-warn"><AlertTriangle size={11} /> {code.reason}</div>
          )}
        </div>
      ) : (
        <div className="cockpit-code-empty">
          {code.reason || 'Scan code non disponible.'}
        </div>
      )}
    </div>
  )
}

interface LargeFilesPanelProps {
  snapshot: DevLargeFilesSnapshot | null
  loading: boolean
  onRefresh: () => void
  github: DevProjectIntelligence['github']
  nextRefreshIn: number
}

const LargeFilesPanel = ({ snapshot, loading, onRefresh, github, nextRefreshIn }: LargeFilesPanelProps) => {
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
                <> · scanné <RelativeTime iso={snapshot.scannedAt} /></>
              )}
              {' '}· prochaine vérif {nextRefreshIn}s
            </>
          ) : (
            <span style={{ color: '#94a3b8' }}>non disponible</span>
          )}
          <button
            type="button"
            className="cockpit-icon-btn"
            onClick={onRefresh}
            disabled={loading}
            title="Forcer un nouveau scan"
            aria-label="Rafraîchir"
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
                    {f.language}{f.ext ? ` · ${f.ext}` : ''} · seuil {f.threshold}
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

function relativeFR(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return ''
  if (diff < 60_000) return `il y a ${Math.max(1, Math.floor(diff / 1000))}s`
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`
  return `il y a ${Math.floor(diff / 86_400_000)} j`
}

const RelativeTime = ({ iso }: { iso: string }) => {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])
  return <>{relativeFR(iso)}</>
}

const DevProjectCockpit = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_DEV)

  const [cockpit, setCockpit] = useState<DevCockpit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Project intelligence (github / tokens / code metrics)
  const [intel, setIntel] = useState<DevProjectIntelligence | null>(null)
  const [intelLoading, setIntelLoading] = useState(false)
  const [largeFiles, setLargeFiles] = useState<DevLargeFilesSnapshot | null>(null)
  const [largeLoading, setLargeLoading] = useState(false)
  const [largeNextIn, setLargeNextIn] = useState(60)

  // GitHub config edit form
  const [ghEditing, setGhEditing] = useState(false)
  const [ghDraft, setGhDraft] = useState<DevProjectGithubConfig | null>(null)
  const [ghSaving, setGhSaving] = useState(false)
  const [ghError, setGhError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDevProjectCockpit(projectId)
      setCockpit(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const loadIntel = useCallback(async (refresh = false) => {
    if (!projectId) return
    setIntelLoading(true)
    try {
      const data = await fetchDevProjectIntelligence(projectId, { refresh })
      setIntel(data)
      // Seed the dedicated large-files snapshot from the same payload.
      setLargeFiles({
        projectId: data.projectId,
        available: data.code.available,
        source: data.code.source,
        scannedAt: data.code.scannedAt,
        durationMs: data.code.durationMs,
        reason: data.code.reason,
        largeFiles: data.code.largeFiles,
        totals: data.code.totals,
      })
    } catch (e) {
      logger.error('[intelligence] load failed', e)
    } finally {
      setIntelLoading(false)
    }
  }, [projectId])

  const refreshLargeFiles = useCallback(async (force = false) => {
    if (!projectId) return
    setLargeLoading(true)
    try {
      const snap = await fetchDevProjectLargeFiles(projectId, { refresh: force })
      setLargeFiles(snap)
      setLargeNextIn(60)
    } catch (e) {
      logger.error('[large-files] refresh failed', e)
    } finally {
      setLargeLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadIntel() }, [loadIntel])

  // Auto-refresh large files every 60s. The hook also drives a countdown so the
  // user can see the list is "alive".
  const refreshLargeRef = useRef(refreshLargeFiles)
  useEffect(() => { refreshLargeRef.current = refreshLargeFiles }, [refreshLargeFiles])
  useEffect(() => {
    if (!projectId) return
    const tick = setInterval(() => {
      setLargeNextIn((prev) => {
        if (prev <= 1) {
          refreshLargeRef.current(false)
          return 60
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [projectId])

  const openIssue = useCallback((id: string) => {
    navigate(`/admin/dev/issues/${id}`)
  }, [navigate])

  const beginGhEdit = useCallback(() => {
    setGhDraft(intel?.github
      ? {
          owner: intel.github.owner,
          repo: intel.github.repo,
          defaultBranch: intel.github.defaultBranch,
          htmlUrl: intel.github.htmlUrl,
          repoPath: intel.github.repoPath,
        }
      : { owner: null, repo: null, defaultBranch: null, htmlUrl: null, repoPath: null })
    setGhError(null)
    setGhEditing(true)
  }, [intel])

  const cancelGhEdit = useCallback(() => {
    setGhEditing(false)
    setGhDraft(null)
    setGhError(null)
  }, [])

  const saveGhConfig = useCallback(async () => {
    if (!projectId || !ghDraft) return
    setGhSaving(true)
    setGhError(null)
    try {
      await updateDevProject(projectId, { github: ghDraft })
      setGhEditing(false)
      setGhDraft(null)
      await loadIntel(true)
      await refreshLargeFiles(true)
    } catch (e) {
      setGhError(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement')
    } finally {
      setGhSaving(false)
    }
  }, [projectId, ghDraft, loadIntel, refreshLargeFiles])

  const statusData = useMemo(() => {
    if (!cockpit) return []
    return STATUS_ORDER.map((s) => ({
      key: s,
      name: STATUS_LABEL[s],
      value: cockpit.byStatus[s] || 0,
      color: STATUS_COLOR[s],
    })).filter((d) => d.value > 0)
  }, [cockpit])

  const priorityData = useMemo(() => {
    if (!cockpit) return []
    return (Object.entries(cockpit.byPriority) as [DevIssuePriority, number][])
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ key: k, name: PRIORITY_LABEL[k], value: v, color: PRIORITY_COLOR[k] }))
  }, [cockpit])

  const typeData = useMemo(() => {
    if (!cockpit) return []
    return (Object.entries(cockpit.byType) as [DevIssueType, number][])
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ key: k, name: TYPE_LABEL[k], value: v, color: TYPE_COLOR[k] }))
  }, [cockpit])

  const velocityData = useMemo(() => {
    if (!cockpit) return []
    return cockpit.velocity.days.map((d) => ({
      date: d.date.slice(5), // MM-DD
      completed: d.completed,
      created: d.created,
    }))
  }, [cockpit])

  if (!projectId) return <div className="cockpit-loading">Identifiant de projet manquant.</div>
  if (loading && !cockpit) return <div className="cockpit-loading">Chargement du cockpit…</div>
  if (error) return (
    <div className="cockpit-error">
      <AlertOctagon size={16} /> {error}
      <button className="cockpit-btn" onClick={load}>Réessayer</button>
    </div>
  )
  if (!cockpit) return <div className="cockpit-loading">Aucune donnée.</div>

  const { project, counts, progress, health, velocity } = cockpit
  const HealthIcon = HEALTH_META[health].icon

  return (
    <div className="cockpit-page" style={{ ['--accent' as never]: project.color }}>
      <header className="cockpit-header">
        <div className="cockpit-header-left">
          <button className="cockpit-back" onClick={() => navigate('/admin/dev')} title="Retour Dev Workspace">
            <ArrowLeft size={14} />
          </button>
          <div className="cockpit-header-id">
            <span className="cockpit-project-key">{project.key}</span>
            <span className="cockpit-project-status" data-tone={project.status === 'ACTIVE' ? 'ok' : project.status === 'PAUSED' ? 'warn' : 'neutral'}>
              {project.status}
            </span>
          </div>
          <h1 className="cockpit-title">{project.name}</h1>
        </div>
        <div className="cockpit-header-actions">
          <button className="cockpit-btn subtle" onClick={load} title="Rafraîchir">
            <RefreshCw size={12} /> Rafraîchir
          </button>
          <button className="cockpit-btn subtle" onClick={() => navigate(`/admin/dev/projects/${project._id}/issues`)} disabled>
            <ListChecks size={12} /> Voir les issues
          </button>
          <button
            className="cockpit-btn subtle"
            onClick={() => navigate(`/admin/dev?project=${project._id}`)}
            title="Ouvrir dans le workspace"
          >
            <ExternalLink size={12} /> Workspace
          </button>
          {canManage && (
            <button
              className="cockpit-btn primary"
              onClick={() => navigate('/admin/dev')}
              title="Créer une issue (workspace)"
            >
              <Plus size={12} /> Nouvelle issue
            </button>
          )}
        </div>
      </header>

      {/* KPI strip — ordered by actionability: santé, blocages, urgentes, en retard,
         then secondary signals (issues totales, vélocité, récent). */}
      <section className="cockpit-kpis">
        <div className={`cockpit-kpi-card health tone-${HEALTH_META[health].tone}`}>
          <div className="cockpit-kpi-label">
            <HealthIcon size={12} /> Santé
          </div>
          <div className="cockpit-kpi-value">{HEALTH_META[health].label}</div>
          <div className="cockpit-kpi-sub">{progress}% complétion</div>
          <div className="cockpit-kpi-progress" aria-hidden>
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className={`cockpit-kpi-card${counts.blocked ? ' tone-fail' : ''}`}>
          <div className="cockpit-kpi-label"><ShieldAlert size={12} /> Bloquées</div>
          <div className="cockpit-kpi-value">{counts.blocked}</div>
          <div className="cockpit-kpi-sub">à débloquer en priorité</div>
        </div>
        <div className={`cockpit-kpi-card${counts.urgent ? ' tone-warn' : ''}`}>
          <div className="cockpit-kpi-label"><Flame size={12} /> Urgentes</div>
          <div className="cockpit-kpi-value">{counts.urgent}</div>
          <div className="cockpit-kpi-sub">à traiter</div>
        </div>
        <div className={`cockpit-kpi-card${counts.overdue ? ' tone-fail' : ''}`}>
          <div className="cockpit-kpi-label"><Clock size={12} /> En retard</div>
          <div className="cockpit-kpi-value">{counts.overdue}</div>
          <div className="cockpit-kpi-sub">échéances dépassées</div>
        </div>
        <div className="cockpit-kpi-card">
          <div className="cockpit-kpi-label"><Hash size={12} /> Issues</div>
          <div className="cockpit-kpi-value">{counts.total}</div>
          <div className="cockpit-kpi-sub">{counts.open} ouvertes · {counts.done} terminées</div>
        </div>
        <div className="cockpit-kpi-card">
          <div className="cockpit-kpi-label"><Target size={12} /> Récent</div>
          <div className="cockpit-kpi-value">{velocity.completed7d}</div>
          <div className="cockpit-kpi-sub">terminées sur 7 j</div>
        </div>
      </section>

      {/* ── Priorité 1 — Santé synthétique : blocages, urgences, retards ── */}
      <section className="cockpit-row triple">
        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker"><ShieldAlert size={11} /> Bloquées</span>
            <span className="cockpit-card-meta">{cockpit.blockers.length}</span>
          </div>
          {cockpit.blockers.length === 0 ? (
            <div className="cockpit-empty">Aucune issue bloquée. </div>
          ) : (
            cockpit.blockers.map((i) => <IssueRow key={i._id} issue={i} onOpen={openIssue} />)
          )}
        </div>

        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker"><Flame size={11} /> Urgentes</span>
            <span className="cockpit-card-meta">{cockpit.urgent.length}</span>
          </div>
          {cockpit.urgent.length === 0 ? (
            <div className="cockpit-empty">Aucune issue urgente.</div>
          ) : (
            cockpit.urgent.map((i) => <IssueRow key={i._id} issue={i} onOpen={openIssue} />)
          )}
        </div>

        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker"><Clock size={11} /> En retard</span>
            <span className="cockpit-card-meta">{cockpit.overdue.length}</span>
          </div>
          {cockpit.overdue.length === 0 ? (
            <div className="cockpit-empty">Aucune échéance dépassée.</div>
          ) : (
            cockpit.overdue.map((i) => <IssueRow key={i._id} issue={i} onOpen={openIssue} />)
          )}
        </div>
      </section>

      {/* ── Priorité 1 (suite) — PRs ouvertes / CI ── */}
      {intel && (
        <section className="cockpit-row cockpit-intel-row">
          <GithubPanel
            github={intel.github}
            canManage={canManage}
            configDraft={ghDraft}
            saving={ghSaving}
            saveError={ghError}
            editing={ghEditing}
            onChangeDraft={(patch) =>
              setGhDraft((prev) => ({
                owner: prev?.owner ?? null,
                repo: prev?.repo ?? null,
                defaultBranch: prev?.defaultBranch ?? null,
                htmlUrl: prev?.htmlUrl ?? null,
                repoPath: prev?.repoPath ?? null,
                ...patch,
              }))
            }
            onSubmit={saveGhConfig}
            onCancel={cancelGhEdit}
            onToggleEdit={(v) => (v ? beginGhEdit() : cancelGhEdit())}
          />
          <div className="cockpit-card cockpit-intel-card">
            <div className="cockpit-card-header">
              <span className="cockpit-card-kicker">Contexte projet</span>
              <span className="cockpit-card-meta">
                <Users size={11} /> {project.members.length} membre(s)
                {project.lead && <> · Lead : {project.lead.name || project.lead.email}</>}
              </span>
            </div>
            {project.description ? (
              <pre className="cockpit-readme-body">{project.description}</pre>
            ) : (
              <div className="cockpit-readme-empty">
                Aucune description. Renseignez-la dans le workspace pour donner du contexte au projet.
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Priorité 2 — Prochaine action ── */}
      <section className="cockpit-row">
        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker"><CalendarClock size={11} /> Prochaine action</span>
            <span className="cockpit-card-meta">{cockpit.nextDue.length} échéance(s) à venir</span>
          </div>
          {cockpit.nextDue.length === 0 ? (
            <div className="cockpit-empty">Aucune échéance à venir.</div>
          ) : (
            cockpit.nextDue.map((i) => <IssueRow key={i._id} issue={i} onOpen={openIssue} />)
          )}
        </div>

        <div className="cockpit-card cockpit-status">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker">Où ça en est</span>
            <span className="cockpit-card-meta">
              dernière activité {formatRelative(cockpit.lastActivityAt)}
            </span>
          </div>
          <ul className="cockpit-status-list">
            <li>
              <strong>{counts.open}</strong> issue(s) ouverte(s) — {counts.done} terminée(s) / {counts.total}
            </li>
            {counts.urgent > 0 && (
              <li className="warn">
                <Flame size={11} /> <strong>{counts.urgent}</strong> urgentes à traiter
              </li>
            )}
            {counts.blocked > 0 && (
              <li className="fail">
                <ShieldAlert size={11} /> <strong>{counts.blocked}</strong> bloquée(s) — débloquer pour avancer
              </li>
            )}
            {counts.overdue > 0 && (
              <li className="fail">
                <Clock size={11} /> <strong>{counts.overdue}</strong> en retard sur échéance
              </li>
            )}
            {cockpit.nextDue[0] && (
              <li>
                <CalendarClock size={11} /> Prochaine échéance :{' '}
                <button className="cockpit-inline-link" onClick={() => openIssue(cockpit.nextDue[0]!._id)}>
                  {cockpit.nextDue[0].identifier} · {formatShortDate(cockpit.nextDue[0].dueDate!)}
                </button>
              </li>
            )}
            {counts.open === 0 && counts.total > 0 && (
              <li className="ok">
                <CheckCircle2 size={11} /> Backlog vidé : aucune issue ouverte.
              </li>
            )}
            {counts.total === 0 && (
              <li>Aucune issue pour ce projet. Créez-en une depuis le workspace.</li>
            )}
          </ul>
        </div>
      </section>

      {/* ── Priorité 3 — Travail actif : charge par assigné (IN_PROGRESS / IN_REVIEW) ── */}
      <section className="cockpit-row">
        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker"><Users size={11} /> Charge par assigné</span>
            <span className="cockpit-card-meta">{cockpit.assignees.length} entrée(s)</span>
          </div>
          {cockpit.assignees.length === 0 ? (
            <div className="cockpit-empty">Aucun assigné.</div>
          ) : (
            <table className="cockpit-assignees">
              <thead>
                <tr><th>Membre</th><th>Ouvertes</th><th>Urgent</th><th>Terminé</th></tr>
              </thead>
              <tbody>
                {cockpit.assignees.map((row, idx) => (
                  <tr key={row.user?._id || `unassigned-${idx}`}>
                    <td>
                      <span className="cockpit-avatar">{userInitial(row.user)}</span>
                      {row.user?.name || row.user?.email || 'Non assignée'}
                    </td>
                    <td>{row.open}</td>
                    <td className={row.urgent ? 'warn' : ''}>{row.urgent}</td>
                    <td>{row.done}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker"><CheckCircle2 size={11} /> Récemment terminées</span>
            <span className="cockpit-card-meta">{cockpit.recentlyDone.length}</span>
          </div>
          {cockpit.recentlyDone.length === 0 ? (
            <div className="cockpit-empty">Aucune issue terminée.</div>
          ) : (
            cockpit.recentlyDone.map((i) => <IssueRow key={i._id} issue={i} onOpen={openIssue} />)
          )}
        </div>
      </section>

      {/* ── Priorité 5 — Activité récente ── */}
      <section className="cockpit-row cockpit-row-single">
        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker"><Activity size={11} /> Activité récente</span>
            <span className="cockpit-card-meta">{cockpit.activity.length} événement(s)</span>
          </div>
          {cockpit.activity.length === 0 ? (
            <div className="cockpit-empty">Aucune activité.</div>
          ) : (
            <div className="cockpit-activity-list">
              {cockpit.activity.map((event, idx) => (
                <ActivityRow key={`${event.type}-${event.at}-${idx}`} event={event} onOpen={openIssue} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Recommandations projet (auto-refresh ~6h) — VENIO-38 ── */}
      <RecommendationsPanel projectId={projectId} onOpenIssue={openIssue} />

      {/* ── Priorité 6 — Métriques secondaires (charts, code, tokens) ── */}
      <section className="cockpit-metrics-section">
        <header className="cockpit-metrics-header">
          <TrendingUp size={12} />
          <span>Métriques</span>
          <span className="cockpit-metrics-subtitle">vélocité, répartitions, code, tokens — pour analyse</span>
        </header>

        <div className="cockpit-row">
          <div className="cockpit-card">
            <div className="cockpit-card-header">
              <span className="cockpit-card-kicker">Vélocité 14 jours</span>
              <span className="cockpit-card-meta">
                {velocity.velocityPerDay14d.toFixed(1)}/j · {velocity.completed14d} terminées
              </span>
            </div>
            <div className="cockpit-chart" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={velocityData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} interval={1} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<VelocityTooltip />} cursor={{ stroke: 'rgba(148,163,184,0.18)' }} />
                  <Line type="monotone" dataKey="created" stroke="#7c5cff" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={1.8} dot={{ r: 2, fill: '#10b981' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {velocity.avgCompletionDays !== null && (
              <div className="cockpit-card-foot">
                <Activity size={11} /> Temps moyen de résolution : <strong>{velocity.avgCompletionDays} j</strong>
              </div>
            )}
          </div>

          <div className="cockpit-card">
            <div className="cockpit-card-header">
              <span className="cockpit-card-kicker">Statut</span>
              <span className="cockpit-card-meta">{counts.total} issue(s)</span>
            </div>
            {statusData.length === 0 ? (
              <div className="cockpit-empty">Aucune donnée</div>
            ) : (
              <div className="cockpit-chart-wrap">
                <div className="cockpit-chart" style={{ height: 180, flex: '0 0 180px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip content={<PieTooltip />} />
                      <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} stroke="none" paddingAngle={2}>
                        {statusData.map((d) => (
                          <Cell key={d.key} fill={d.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="cockpit-legend">
                  {statusData.map((d) => (
                    <li key={d.key}>
                      <span className="cockpit-legend-dot" style={{ background: d.color }} />
                      <span className="cockpit-legend-label">{d.name}</span>
                      <span className="cockpit-legend-value">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="cockpit-row">
          <div className="cockpit-card">
            <div className="cockpit-card-header">
              <span className="cockpit-card-kicker">Priorité</span>
              <span className="cockpit-card-meta">répartition</span>
            </div>
            {priorityData.length === 0 ? (
              <div className="cockpit-empty">Aucune donnée</div>
            ) : (
              <div className="cockpit-chart" style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={priorityData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {priorityData.map((d) => (
                        <Cell key={d.key} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="cockpit-card">
            <div className="cockpit-card-header">
              <span className="cockpit-card-kicker">Type</span>
              <span className="cockpit-card-meta">feature · bug · …</span>
            </div>
            {typeData.length === 0 ? (
              <div className="cockpit-empty">Aucune donnée</div>
            ) : (
              <div className="cockpit-chart" style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} layout="vertical">
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} width={70} />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {typeData.map((d) => (
                        <Cell key={d.key} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {intel && (
          <div className="cockpit-row cockpit-intel-row">
            <CodeMetricsPanel code={intel.code} />
            <LargeFilesPanel
              snapshot={largeFiles}
              loading={largeLoading || intelLoading}
              onRefresh={() => refreshLargeFiles(true)}
              github={intel.github}
              nextRefreshIn={largeNextIn}
            />
          </div>
        )}

        {intel && (
          <div className="cockpit-row cockpit-intel-row">
            <TokensPanel tokens={intel.tokens} />
            <div className="cockpit-card cockpit-intel-card cockpit-metrics-spacer" aria-hidden="true" />
          </div>
        )}
      </section>

    </div>
  )
}

export default DevProjectCockpit
