import { useEffect, useState } from 'react'
import {
  Activity,
  CircleCheck,
  CircleDot,
  Inbox,
  AlertOctagon,
  TrendingUp,
  Sparkles,
  MessageSquareText,
} from 'lucide-react'
import {
  fetchDevActivity,
  STATUS_COLOR,
  STATUS_LABEL,
  type DevActivityEntry,
  type DevProject,
  type DevStats,
  type IssueFilters,
} from '../../../../services/dev'
import { Avatar, formatRelative } from '../shared'

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

  useEffect(() => {
    let cancelled = false
    setLoadingActivity(true)
    fetchDevActivity({ limit: 25 })
      .then((data) => {
        if (!cancelled) setActivity(data.entries)
      })
      .catch((e) => {
        console.error(e)
        if (!cancelled) setActivity([])
      })
      .finally(() => {
        if (!cancelled) setLoadingActivity(false)
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
  const created = stats?.created7 ?? 0
  const overdue = stats?.overdue ?? 0
  const urgent = stats?.byPriority.URGENT ?? 0

  const focusIssuesByProject = (projectId: string) => {
    setFilters((f) => ({ ...f, project: projectId, status: 'open' }))
    setView('issues')
  }

  // Top 5 projects by open issues + their progress
  const topProjects = [...projects]
    .sort((a, b) => (b.openIssues ?? 0) - (a.openIssues ?? 0))
    .slice(0, 5)

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
          hint={`${stats?.byStatus.IN_PROGRESS ?? 0} en cours · ${stats?.byStatus.IN_REVIEW ?? 0} en revue`}
        />
        <KpiCard
          label="Terminées (14j)"
          value={stats?.completed14 ?? stats?.completedRecent ?? 0}
          icon={<CircleCheck size={16} />}
          tone="emerald"
          hint={`${velocity} sur 7 jours`}
        />
        <KpiCard
          label="Velocity (7j)"
          value={velocity}
          icon={<TrendingUp size={16} />}
          tone="violet"
          hint={`${created} créées · ratio ${created > 0 ? Math.round((velocity / created) * 100) : 0}%`}
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
            <h2>Top projets</h2>
            <button className="dev-link-btn" onClick={() => setView('projects')}>
              voir tout →
            </button>
          </header>
          {topProjects.length === 0 ? (
            <div className="dev-empty" style={{ padding: '20px 0' }}>
              Aucun projet pour l'instant.
            </div>
          ) : (
            <ul className="dev-mini-projects">
              {topProjects.map((p) => (
                <li key={p._id} className="dev-mini-project" onClick={() => focusIssuesByProject(p._id)}>
                  <span className="dev-mini-project-stripe" style={{ background: p.color }} />
                  <div className="dev-mini-project-body">
                    <div className="dev-mini-project-title">
                      <span className="dev-mini-project-key" style={{ color: p.color }}>
                        {p.key}
                      </span>
                      <span className="dev-mini-project-name">{p.name}</span>
                    </div>
                    <div className="dev-mini-project-meta">
                      <span>{p.openIssues ?? 0} ouverte(s)</span>
                      {p.status !== 'ACTIVE' && (
                        <span className="dev-mini-project-status">{p.status === 'PAUSED' ? 'en pause' : 'archivé'}</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

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
          <div className="dev-empty" style={{ padding: '20px 0' }}>
            Aucune activité pour l'instant.
          </div>
        ) : (
          <ul className="dev-activity">
            {activity.map((e, idx) => (
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
  )
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  tone,
  progress,
}: {
  label: string
  value: number | string
  hint?: string
  icon: React.ReactNode
  tone: 'slate' | 'amber' | 'emerald' | 'violet' | 'rose' | 'cyan'
  progress?: number
}) {
  return (
    <div className={`dev-kpi tone-${tone}`}>
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
