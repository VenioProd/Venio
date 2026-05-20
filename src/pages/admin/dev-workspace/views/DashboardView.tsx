import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDot,
  ExternalLink,
  Inbox,
  AlertOctagon,
  TrendingUp,
  Sparkles,
  MessageSquareText,
  Rocket,
  Target,
} from 'lucide-react'
import {
  fetchDevActivity,
  fetchDevRoadmap,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  type DevActivityEntry,
  type DevProject,
  type DevRoadmapIssueSummary,
  type DevRoadmapProject,
  type DevStats,
  type IssueFilters,
} from '../../../../services/dev'
import { Avatar, formatRelative, PriorityIcon, StatusGlyph } from '../shared'

interface Props {
  stats: DevStats | null
  projects: DevProject[]
  setFilters: React.Dispatch<React.SetStateAction<IssueFilters>>
  setView: (v: 'dashboard' | 'projects' | 'issues') => void
  refreshTick: number
}

const DashboardView = ({ stats, projects, setFilters, setView, refreshTick }: Props) => {
  const [activity, setActivity] = useState<DevActivityEntry[] | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(true)
  const [roadmap, setRoadmap] = useState<DevRoadmapProject[] | null>(null)
  const [loadingRoadmap, setLoadingRoadmap] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    setLoadingActivity(true)
    setLoadingRoadmap(true)
    Promise.allSettled([
      fetchDevActivity({ limit: 20 }),
      fetchDevRoadmap({ activeLimit: 6, upcomingLimit: 5, recentLimit: 4 }),
    ]).then(([actRes, roadRes]) => {
      if (cancelled) return
      if (actRes.status === 'fulfilled') setActivity(actRes.value.entries)
      else {
        console.error(actRes.reason)
        setActivity([])
      }
      if (roadRes.status === 'fulfilled') setRoadmap(roadRes.value.projects)
      else {
        console.error(roadRes.reason)
        setRoadmap([])
      }
      setLoadingActivity(false)
      setLoadingRoadmap(false)
    })
    return () => {
      cancelled = true
    }
  }, [refreshTick])

  const total = stats?.total ?? 0
  const open = stats?.open ?? 0
  const done = stats?.done ?? stats?.byStatus.DONE ?? 0
  const progress = stats?.progress ?? (total > 0 ? Math.round((done / total) * 100) : 0)
  const velocity = stats?.completed7 ?? 0
  const overdue = stats?.overdue ?? 0
  const urgent = stats?.byPriority.URGENT ?? 0
  const completed14 = stats?.completed14 ?? stats?.completedRecent ?? 0
  const inProgressCount = stats?.byStatus.IN_PROGRESS ?? 0
  const inReviewCount = stats?.byStatus.IN_REVIEW ?? 0

  const focusIssuesByProject = (projectId: string, status: IssueFilters['status'] = 'open') => {
    setFilters((f) => ({ ...f, project: projectId, status }))
    setView('issues')
  }

  const focusGlobalDone = () => {
    setFilters((f) => ({ ...f, project: undefined, status: 'DONE' }))
    setView('issues')
  }

  const activeIssues = useMemo<DevRoadmapIssueSummary[]>(() => {
    if (!roadmap) return []
    const all: DevRoadmapIssueSummary[] = []
    for (const r of roadmap) {
      for (const issue of r.active) {
        all.push({ ...issue })
      }
    }
    return all
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'IN_PROGRESS' ? -1 : 1
        const pa = PRIORITY_RANK[a.priority] ?? 99
        const pb = PRIORITY_RANK[b.priority] ?? 99
        if (pa !== pb) return pa - pb
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
      .slice(0, 12)
  }, [roadmap])

  const visibleRoadmap = useMemo(() => {
    if (!roadmap) return []
    return roadmap.filter((r) => r.summary.total > 0 || r.project.status === 'ACTIVE')
  }, [roadmap])

  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))

  return (
    <div className="dev-dashboard">
      <div className="dev-kpi-grid">
        <KpiCard
          label="Issues totales"
          value={total}
          icon={<Inbox size={16} />}
          tone="slate"
          hint={`${stats?.totalProjects ?? 0} projet(s)`}
        />
        <KpiCard
          label="Ouvertes"
          value={open}
          icon={<CircleDot size={16} />}
          tone="amber"
          hint={`${inProgressCount} en cours · ${inReviewCount} en revue`}
        />
        <KpiCard
          label="Résolues"
          value={done}
          icon={<CheckCircle2 size={16} />}
          tone="emerald"
          hint={`+${completed14} sur 14j · +${velocity} sur 7j`}
          onClick={focusGlobalDone}
        />
        <KpiCard
          label="Velocity (7j)"
          value={velocity}
          icon={<TrendingUp size={16} />}
          tone="violet"
          hint={`${stats?.created7 ?? 0} créées sur 7j`}
        />
        <KpiCard
          label="Urgentes"
          value={urgent}
          icon={<AlertOctagon size={16} />}
          tone="rose"
          hint={overdue > 0 ? `${overdue} en retard` : 'à jour'}
        />
        <KpiCard
          label="Progression"
          value={`${progress}%`}
          icon={<Sparkles size={16} />}
          tone="cyan"
          hint={`${done}/${total} closes`}
          progress={progress}
        />
      </div>

      <section className="dev-card dev-active-card">
        <header className="dev-card-header">
          <h2>
            <Rocket size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Travaux en cours
          </h2>
          <span className="dev-card-sub">
            {inProgressCount + inReviewCount} en mouvement
          </span>
        </header>
        {loadingRoadmap ? (
          <div className="dev-loading">Chargement…</div>
        ) : activeIssues.length === 0 ? (
          <div className="dev-empty" style={{ padding: '18px 0' }}>
            Rien en cours pour l'instant.
          </div>
        ) : (
          <ul className="dev-active-list">
            {activeIssues.map((issue) => {
              const projectMeta = roadmap?.find((r) =>
                [...r.active, ...r.upcoming, ...r.recentlyDone].some((i) => i._id === issue._id)
              )?.project
              return (
                <ActiveIssueRow
                  key={issue._id}
                  issue={issue}
                  project={projectMeta}
                  onClick={() => projectMeta && focusIssuesByProject(projectMeta._id, 'IN_PROGRESS')}
                />
              )
            })}
          </ul>
        )}
      </section>

      <section className="dev-card dev-roadmap-card">
        <header className="dev-card-header">
          <h2>
            <Target size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Feuilles de route par projet
          </h2>
          <button className="dev-link-btn" onClick={() => setView('projects')}>
            Vue projets →
          </button>
        </header>
        {loadingRoadmap ? (
          <div className="dev-loading">Chargement…</div>
        ) : visibleRoadmap.length === 0 ? (
          <div className="dev-empty" style={{ padding: '18px 0' }}>
            Aucun projet pour l'instant.
          </div>
        ) : (
          <ul className="dev-roadmap-list">
            {visibleRoadmap.map((entry) => (
              <RoadmapProjectCard
                key={entry.project._id}
                entry={entry}
                collapsed={!!collapsed[entry.project._id]}
                onToggle={() => toggle(entry.project._id)}
                onFocusOpen={() => focusIssuesByProject(entry.project._id, 'open')}
                onFocusDone={() => focusIssuesByProject(entry.project._id, 'DONE')}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="dev-dash-grid">
        <section className="dev-card">
          <header className="dev-card-header">
            <h2>Répartition des statuts</h2>
            <span className="dev-card-sub">{total} issue(s)</span>
          </header>
          <div className="dev-status-bars">
            {stats &&
              (['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'] as const).map((s) => {
                const count = stats.byStatus[s] || 0
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={s} className="dev-status-bar-row">
                    <span className="dev-status-bar-label" style={{ color: STATUS_COLOR[s] }}>
                      {STATUS_LABEL[s]}
                    </span>
                    <div className="dev-status-bar-track" title={`${pct}%`}>
                      <div
                        className="dev-status-bar-fill"
                        style={{ width: `${pct}%`, background: STATUS_COLOR[s] }}
                      />
                    </div>
                    <span className="dev-status-bar-value">{count}</span>
                  </div>
                )
              })}
            {!stats && <div className="dev-loading">Chargement…</div>}
          </div>
        </section>

        <section className="dev-card">
          <header className="dev-card-header">
            <h2>
              <Activity size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              Activité récente
            </h2>
            <span className="dev-card-sub">{activity?.length ?? 0} entrée(s)</span>
          </header>
          {loadingActivity ? (
            <div className="dev-loading">Chargement…</div>
          ) : !activity || activity.length === 0 ? (
            <div className="dev-empty" style={{ padding: '18px 0' }}>
              Aucune activité pour l'instant.
            </div>
          ) : (
            <ul className="dev-activity">
              {activity.slice(0, 12).map((e, idx) => (
                <li key={`${e.kind}-${e.issue._id}-${e.at}-${idx}`} className="dev-activity-item">
                  <span className={`dev-activity-icon kind-${e.kind}`}>
                    {e.kind === 'created' && <Sparkles size={12} />}
                    {e.kind === 'completed' && <CircleCheck size={12} />}
                    {e.kind === 'comment' && <MessageSquareText size={12} />}
                  </span>
                  <div className="dev-activity-body">
                    <div className="dev-activity-line">
                      <Avatar user={e.user} size={18} />
                      <span className="dev-activity-user">
                        {e.user?.name || e.user?.email || 'Inconnu'}
                      </span>
                      <span className="dev-activity-verb">
                        {e.kind === 'created' && 'a créé'}
                        {e.kind === 'completed' && 'a terminé'}
                        {e.kind === 'comment' && 'a commenté'}
                      </span>
                      {e.project && (
                        <span
                          className="dev-activity-ref"
                          style={{ color: e.project.color }}
                        >
                          {e.project.key}-{e.issue.number}
                        </span>
                      )}
                      <span className="dev-activity-title" title={e.issue.title}>
                        {e.issue.title}
                      </span>
                      <span className="dev-activity-when">{formatRelative(e.at)}</span>
                    </div>
                    {e.kind === 'comment' && e.body && (
                      <div className="dev-activity-quote">{e.body}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

const PRIORITY_RANK: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  NO_PRIORITY: 4,
}

function ActiveIssueRow({
  issue,
  project,
  onClick,
}: {
  issue: DevRoadmapIssueSummary
  project?: DevRoadmapProject['project']
  onClick?: () => void
}) {
  const due = issue.dueDate ? new Date(issue.dueDate) : null
  const overdue = due && due.getTime() < Date.now() && issue.status !== 'DONE'
  return (
    <li className="dev-active-row" onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : -1}>
      <StatusGlyph status={issue.status} size={14} />
      {project && (
        <span
          className="dev-active-row-key"
          style={{ background: `${project.color}1f`, color: project.color, borderColor: `${project.color}55` }}
        >
          {project.key}-{issue.number}
        </span>
      )}
      <span className="dev-active-row-title" title={issue.title}>
        {issue.title}
      </span>
      <span className="dev-active-row-priority" title={`Priorité : ${PRIORITY_LABEL[issue.priority]}`}>
        <PriorityIcon priority={issue.priority} size={12} />
      </span>
      <Avatar user={issue.assignee} size={20} />
      {due && (
        <span className={`dev-active-row-due${overdue ? ' overdue' : ''}`} title={due.toLocaleDateString('fr-FR')}>
          <CalendarClock size={11} /> {formatRelative(issue.dueDate)}
        </span>
      )}
      {issue.github?.prUrl && (
        <a
          href={issue.github.prUrl}
          target="_blank"
          rel="noreferrer"
          className="dev-active-row-pr"
          onClick={(e) => e.stopPropagation()}
          title={`PR #${issue.github.prNumber ?? ''} (${issue.github.ciStatus})`}
        >
          PR <ExternalLink size={10} />
        </a>
      )}
    </li>
  )
}

function RoadmapProjectCard({
  entry,
  collapsed,
  onToggle,
  onFocusOpen,
  onFocusDone,
}: {
  entry: DevRoadmapProject
  collapsed: boolean
  onToggle: () => void
  onFocusOpen: () => void
  onFocusDone: () => void
}) {
  const { project, summary, active, upcoming, recentlyDone } = entry
  return (
    <li
      className={`dev-roadmap-item${collapsed ? ' collapsed' : ''}${
        project.status === 'ARCHIVED' ? ' archived' : ''
      }`}
      style={{ ['--p-color' as string]: project.color }}
    >
      <header className="dev-roadmap-head" onClick={onToggle} role="button" tabIndex={0}>
        <button className="dev-roadmap-toggle" aria-label={collapsed ? 'Ouvrir' : 'Replier'}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className="dev-roadmap-key" style={{ color: project.color }}>
          {project.key}
        </span>
        <span className="dev-roadmap-name">{project.name}</span>
        {project.status !== 'ACTIVE' && (
          <span className={`dev-roadmap-status status-${project.status.toLowerCase()}`}>
            {project.status === 'PAUSED' ? 'en pause' : 'archivé'}
          </span>
        )}
        <span className="dev-roadmap-spacer" />
        <span className="dev-roadmap-counts" title="résolues / total">
          <CheckCircle2 size={11} /> {summary.done}/{summary.total}
        </span>
        {summary.overdue > 0 && (
          <span className="dev-roadmap-counts overdue" title="issues en retard">
            <AlertOctagon size={11} /> {summary.overdue}
          </span>
        )}
        <span className="dev-roadmap-progress" title={`Progression ${summary.progress}%`}>
          <span className="dev-roadmap-progress-track">
            <span
              className="dev-roadmap-progress-fill"
              style={{ width: `${summary.progress}%`, background: project.color }}
            />
          </span>
          <span className="dev-roadmap-progress-value">{summary.progress}%</span>
        </span>
      </header>

      {!collapsed && (
        <div className="dev-roadmap-body">
          <div className="dev-roadmap-col">
            <div className="dev-roadmap-col-head">
              <span>En cours</span>
              <span className="dev-roadmap-col-badge">{summary.inProgress + summary.inReview}</span>
            </div>
            {active.length === 0 ? (
              <p className="dev-roadmap-empty">Rien d'actif.</p>
            ) : (
              <ul className="dev-roadmap-issues">
                {active.map((i) => (
                  <RoadmapIssueRow key={i._id} issue={i} />
                ))}
              </ul>
            )}
          </div>

          <div className="dev-roadmap-col">
            <div className="dev-roadmap-col-head">
              <span>À venir</span>
              <span className="dev-roadmap-col-badge">{summary.todo + summary.backlog}</span>
              {upcoming.length > 0 && (
                <button className="dev-link-btn" onClick={onFocusOpen}>
                  voir tout
                </button>
              )}
            </div>
            {upcoming.length === 0 ? (
              <p className="dev-roadmap-empty">Pas d'issue planifiée.</p>
            ) : (
              <ul className="dev-roadmap-issues">
                {upcoming.map((i) => (
                  <RoadmapIssueRow key={i._id} issue={i} />
                ))}
              </ul>
            )}
          </div>

          <div className="dev-roadmap-col">
            <div className="dev-roadmap-col-head">
              <span>Résolues récemment</span>
              <span className="dev-roadmap-col-badge">{summary.done}</span>
              {recentlyDone.length > 0 && (
                <button className="dev-link-btn" onClick={onFocusDone}>
                  voir tout
                </button>
              )}
            </div>
            {recentlyDone.length === 0 ? (
              <p className="dev-roadmap-empty">Aucune issue close récemment.</p>
            ) : (
              <ul className="dev-roadmap-issues">
                {recentlyDone.map((i) => (
                  <RoadmapIssueRow key={i._id} issue={i} done />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

function RoadmapIssueRow({ issue, done }: { issue: DevRoadmapIssueSummary; done?: boolean }) {
  const due = issue.dueDate ? new Date(issue.dueDate) : null
  const overdue = due && due.getTime() < Date.now() && issue.status !== 'DONE'
  return (
    <li className={`dev-roadmap-issue${done ? ' done' : ''}`}>
      <StatusGlyph status={issue.status} size={12} />
      <span className="dev-roadmap-issue-priority">
        <PriorityIcon priority={issue.priority} size={11} />
      </span>
      <span className="dev-roadmap-issue-title" title={issue.title}>
        {issue.title}
      </span>
      <Avatar user={issue.assignee} size={16} />
      {done && issue.completedAt ? (
        <span className="dev-roadmap-issue-when">{formatRelative(issue.completedAt)}</span>
      ) : due ? (
        <span className={`dev-roadmap-issue-when${overdue ? ' overdue' : ''}`}>
          {formatRelative(issue.dueDate)}
        </span>
      ) : (
        <span className="dev-roadmap-issue-when muted">{formatRelative(issue.updatedAt)}</span>
      )}
    </li>
  )
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  tone,
  progress,
  onClick,
}: {
  label: string
  value: number | string
  hint?: string
  icon: React.ReactNode
  tone: 'slate' | 'amber' | 'emerald' | 'violet' | 'rose' | 'cyan'
  progress?: number
  onClick?: () => void
}) {
  const interactive = !!onClick
  return (
    <div
      className={`dev-kpi tone-${tone}${interactive ? ' interactive' : ''}`}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : -1}
      onKeyDown={(e) => {
        if (!interactive) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      <div className="dev-kpi-top">
        <span className="dev-kpi-icon">{icon}</span>
        <span className="dev-kpi-label">{label}</span>
      </div>
      <div className="dev-kpi-value">{value}</div>
      {hint && <div className="dev-kpi-hint">{hint}</div>}
      {typeof progress === 'number' && (
        <div className="dev-kpi-progress">
          <div className="dev-kpi-progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  )
}

export default DashboardView
