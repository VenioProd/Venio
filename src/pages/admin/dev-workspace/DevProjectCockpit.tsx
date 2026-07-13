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
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
  type DevCockpitIssueRef,
  type DevGithubPullRequestRef,
  type DevIssuePriority,
  type DevIssueStatus,
  type DevIssueType,
  type DevProjectGithubConfig,
  type DevProjectIntelligence,
  type DevLargeFilesSnapshot,
  type DevTimelineCategory,
} from '../../../services/dev'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
// Import via le barrel pour charger dashboard.css (style financial timeline).
import { FinancialChart } from '../../../components/dashboard'
import RecommendationsPanel from './RecommendationsPanel'
import './DevProjectCockpit.css'

import { formatBytes, formatNumber, formatRelative, formatShortDate, userInitial } from './cockpit/helpers'
import {
  GithubIcon,
  IssueRow,
  TimelineRow,
  PieTooltip,
  BarTooltip,
  GithubPanel,
  TokensPanel,
  CodeMetricsPanel,
  LargeFilesPanel,
  RepoQualityPanel,
  RelativeTime,
} from './cockpit/parts'

const HEALTH_META: Record<
  DevCockpit['health'],
  { label: string; tone: 'ok' | 'warn' | 'fail'; icon: typeof Sparkles }
> = {
  on_track: { label: 'On track', tone: 'ok', icon: Sparkles },
  at_risk: { label: 'At risk', tone: 'warn', icon: AlertTriangle },
  blocked: { label: 'Blocked', tone: 'fail', icon: ShieldAlert },
}

// Format JJ/MM pour l'axe temporel du chart vélocité.
const shortDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })

const DevProjectCockpit = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_DEV)

  const [cockpit, setCockpit] = useState<DevCockpit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timelineFilter, setTimelineFilter] = useState<DevTimelineCategory | 'all'>('all')

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

  const loadIntel = useCallback(
    async (refresh = false) => {
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
        console.error('[intelligence] load failed', e)
      } finally {
        setIntelLoading(false)
      }
    },
    [projectId],
  )

  const refreshLargeFiles = useCallback(
    async (force = false) => {
      if (!projectId) return
      setLargeLoading(true)
      try {
        const snap = await fetchDevProjectLargeFiles(projectId, { refresh: force })
        setLargeFiles(snap)
        setLargeNextIn(60)
      } catch (e) {
        console.error('[large-files] refresh failed', e)
      } finally {
        setLargeLoading(false)
      }
    },
    [projectId],
  )

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    loadIntel()
  }, [loadIntel])

  // Auto-refresh large files every 60s. The hook also drives a countdown so the
  // user can see the list is "alive".
  const refreshLargeRef = useRef(refreshLargeFiles)
  useEffect(() => {
    refreshLargeRef.current = refreshLargeFiles
  }, [refreshLargeFiles])
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

  const openIssue = useCallback(
    (id: string) => {
      navigate(`/admin/dev/issues/${id}`)
    },
    [navigate],
  )

  const beginGhEdit = useCallback(() => {
    setGhDraft(
      intel?.github
        ? {
            owner: intel.github.owner,
            repo: intel.github.repo,
            defaultBranch: intel.github.defaultBranch,
            htmlUrl: intel.github.htmlUrl,
            repoPath: intel.github.repoPath,
          }
        : { owner: null, repo: null, defaultBranch: null, htmlUrl: null, repoPath: null },
    )
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
      setGhError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement")
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

  const visibleTimeline = useMemo(() => {
    if (!cockpit) return []
    return timelineFilter === 'all'
      ? cockpit.timeline
      : cockpit.timeline.filter((event) => event.category === timelineFilter)
  }, [cockpit, timelineFilter])

  const typeData = useMemo(() => {
    if (!cockpit) return []
    return (Object.entries(cockpit.byType) as [DevIssueType, number][])
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ key: k, name: TYPE_LABEL[k], value: v, color: TYPE_COLOR[k] }))
  }, [cockpit])

  if (!projectId) return <div className="cockpit-loading">Identifiant de projet manquant.</div>
  if (loading && !cockpit) return <div className="cockpit-loading">Chargement du cockpit…</div>
  if (error)
    return (
      <div className="cockpit-error">
        <AlertOctagon size={16} /> {error}
        <button className="cockpit-btn" onClick={load}>
          Réessayer
        </button>
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
            <span
              className="cockpit-project-status"
              data-tone={project.status === 'ACTIVE' ? 'ok' : project.status === 'PAUSED' ? 'warn' : 'neutral'}
            >
              {project.status}
            </span>
          </div>
          <h1 className="cockpit-title">{project.name}</h1>
        </div>
        <div className="cockpit-header-actions">
          <button className="cockpit-btn subtle" onClick={load} title="Rafraîchir">
            <RefreshCw size={12} /> Rafraîchir
          </button>
          <button className="cockpit-btn subtle" onClick={() => navigate(`/admin/dev?project=${project._id}`)}>
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
          <div className="cockpit-kpi-label">
            <ShieldAlert size={12} /> Bloquées
          </div>
          <div className="cockpit-kpi-value">{counts.blocked}</div>
          <div className="cockpit-kpi-sub">à débloquer en priorité</div>
        </div>
        <div className={`cockpit-kpi-card${counts.urgent ? ' tone-warn' : ''}`}>
          <div className="cockpit-kpi-label">
            <Flame size={12} /> Urgentes
          </div>
          <div className="cockpit-kpi-value">{counts.urgent}</div>
          <div className="cockpit-kpi-sub">à traiter</div>
        </div>
        <div className={`cockpit-kpi-card${counts.overdue ? ' tone-fail' : ''}`}>
          <div className="cockpit-kpi-label">
            <Clock size={12} /> En retard
          </div>
          <div className="cockpit-kpi-value">{counts.overdue}</div>
          <div className="cockpit-kpi-sub">échéances dépassées</div>
        </div>
        <div className="cockpit-kpi-card">
          <div className="cockpit-kpi-label">
            <Hash size={12} /> Issues
          </div>
          <div className="cockpit-kpi-value">{counts.total}</div>
          <div className="cockpit-kpi-sub">
            {counts.open} ouvertes · {counts.done} terminées
          </div>
        </div>
        <div className="cockpit-kpi-card">
          <div className="cockpit-kpi-label">
            <Target size={12} /> Récent
          </div>
          <div className="cockpit-kpi-value">{velocity.completed7d}</div>
          <div className="cockpit-kpi-sub">terminées sur 7 j</div>
        </div>
      </section>

      {/* ── Priorité 1 — Santé synthétique : blocages, urgences, retards ── */}
      <section className="cockpit-row triple">
        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker">
              <ShieldAlert size={11} /> Bloquées
            </span>
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
            <span className="cockpit-card-kicker">
              <Flame size={11} /> Urgentes
            </span>
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
            <span className="cockpit-card-kicker">
              <Clock size={11} /> En retard
            </span>
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

      {intel && (
        <section className="cockpit-row cockpit-row-single">
          <RepoQualityPanel quality={intel.code.quality} />
        </section>
      )}

      {/* ── Priorité 2 — Prochaine action ── */}
      <section className="cockpit-row">
        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker">
              <CalendarClock size={11} /> Prochaine action
            </span>
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
            <span className="cockpit-card-meta">dernière activité {formatRelative(cockpit.lastActivityAt)}</span>
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
            {counts.total === 0 && <li>Aucune issue pour ce projet. Créez-en une depuis le workspace.</li>}
          </ul>
        </div>
      </section>

      {/* ── Priorité 3 — Travail actif : charge par assigné (IN_PROGRESS / IN_REVIEW) ── */}
      <section className="cockpit-row">
        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker">
              <Users size={11} /> Charge par assigné
            </span>
            <span className="cockpit-card-meta">{cockpit.assignees.length} entrée(s)</span>
          </div>
          {cockpit.assignees.length === 0 ? (
            <div className="cockpit-empty">Aucun assigné.</div>
          ) : (
            <table className="cockpit-assignees">
              <thead>
                <tr>
                  <th>Membre</th>
                  <th>Ouvertes</th>
                  <th>Urgent</th>
                  <th>Terminé</th>
                </tr>
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
            <span className="cockpit-card-kicker">
              <CheckCircle2 size={11} /> Récemment terminées
            </span>
            <span className="cockpit-card-meta">{cockpit.recentlyDone.length}</span>
          </div>
          {cockpit.recentlyDone.length === 0 ? (
            <div className="cockpit-empty">Aucune issue terminée.</div>
          ) : (
            cockpit.recentlyDone.map((i) => <IssueRow key={i._id} issue={i} onOpen={openIssue} />)
          )}
        </div>
      </section>

      {/* ── Priorité 5 — Timeline technique ── */}
      <section className="cockpit-row cockpit-row-single">
        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker">
              <Activity size={11} /> Timeline technique
            </span>
            <span className="cockpit-card-meta">{visibleTimeline.length} événement(s)</span>
          </div>
          <div className="cockpit-timeline-filters" role="group" aria-label="Filtrer la timeline technique">
            {(
              [
                ['all', 'Tout'],
                ['change', 'Changements'],
                ['comment', 'Commentaires'],
                ['github', 'GitHub / CI'],
                ['agent', 'Agents'],
                ['deployment', 'Déploiements'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`cockpit-timeline-filter${timelineFilter === value ? ' active' : ''}`}
                aria-pressed={timelineFilter === value}
                onClick={() => setTimelineFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {cockpit.timeline.length === 0 ? (
            <div className="cockpit-empty">Aucun événement technique n’a encore été tracé pour ce projet.</div>
          ) : visibleTimeline.length === 0 ? (
            <div className="cockpit-empty">Aucun événement ne correspond à ce filtre.</div>
          ) : (
            <div className="cockpit-timeline-list">
              {visibleTimeline.map((event) => (
                <TimelineRow key={event._id} event={event} onOpen={openIssue} />
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
            {/* Vélocité en style financial timeline (A8) : terminées en aire cyan
               + volume, créées en série secondaire pointillée. */}
            <FinancialChart
              data={velocity.days.map((d) => ({ ts: shortDate(d.date), value: d.completed, volume: d.created }))}
              secondarySeries={velocity.days.map((d) => ({ ts: shortDate(d.date), value: d.created }))}
              label="Vélocité 14 jours"
              currentValue={`${velocity.completed14d} terminées · ${velocity.velocityPerDay14d.toFixed(1)}/j`}
              height={220}
            />
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
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={45}
                        outerRadius={75}
                        stroke="none"
                        paddingAngle={2}
                      >
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
                    <YAxis
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
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
                    <XAxis
                      type="number"
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={70}
                    />
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
