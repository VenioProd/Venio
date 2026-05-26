import { useEffect, useState } from 'react'
import { ChevronRight, FolderKanban, Plus, RefreshCw, Users } from 'lucide-react'
import {
  fetchDevProjectDetail,
  STATUS_COLOR,
  STATUS_LABEL,
  type DevProject,
  type DevProjectDetail,
  type IssueFilters,
} from '@/services/dev'
import { Avatar, formatRelative, StatusGlyph } from '../shared'

interface Props {
  projects: DevProject[]
  loading: boolean
  setFilters: React.Dispatch<React.SetStateAction<IssueFilters>>
  setView: (v: 'dashboard' | 'projects' | 'issues') => void
  onCreateProject: () => void
  onReload: () => void
  canManage: boolean
}

const ProjectsView = ({ projects, loading, setFilters, setView, onCreateProject, onReload, canManage }: Props) => {
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DevProjectDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    if (!openProjectId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    fetchDevProjectDetail(openProjectId)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => {
        console.error(e)
        if (!cancelled) setDetail(null)
      })
      .finally(() => !cancelled && setDetailLoading(false))
    return () => {
      cancelled = true
    }
  }, [openProjectId])

  const focusIssues = (projectId: string) => {
    setFilters((f) => ({ ...f, project: projectId, status: 'open' }))
    setView('issues')
  }

  if (loading && projects.length === 0) {
    return <div className="dev-loading">Chargement des projets…</div>
  }

  if (projects.length === 0) {
    return (
      <div className="dev-empty">
        <FolderKanban size={32} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.5 }} />
        Aucun projet de développement.
        {canManage && (
          <div style={{ marginTop: 12 }}>
            <button className="dev-btn primary" onClick={onCreateProject}>
              <Plus size={13} /> Créer le premier projet
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="dev-projects">
      <div className="dev-projects-toolbar">
        <span className="dev-projects-count">
          {projects.length} projet{projects.length > 1 ? 's' : ''}
        </span>
        <button className="dev-btn subtle" onClick={onReload} title="Rafraîchir">
          <RefreshCw size={13} />
        </button>
        {canManage && (
          <button className="dev-btn primary" onClick={onCreateProject}>
            <Plus size={13} /> Nouveau projet
          </button>
        )}
      </div>

      <div className="dev-projects-grid">
        {projects.map((p) => (
          <ProjectCard key={p._id} project={p} onOpen={() => setOpenProjectId(p._id)} onFocusIssues={() => focusIssues(p._id)} />
        ))}
      </div>

      {openProjectId && (
        <div
          className="dev-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenProjectId(null)}
        >
          <div
            className="dev-project-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading || !detail ? (
              <div className="dev-loading">Chargement…</div>
            ) : (
              <ProjectDetailContent
                detail={detail}
                onClose={() => setOpenProjectId(null)}
                onFocusIssues={() => {
                  focusIssues(detail.project._id)
                  setOpenProjectId(null)
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectCard({
  project,
  onOpen,
  onFocusIssues,
}: {
  project: DevProject
  onOpen: () => void
  onFocusIssues: () => void
}) {
  const open = project.openIssues ?? 0
  return (
    <article className="dev-project-card" onClick={onOpen} role="button" tabIndex={0}>
      <span className="dev-project-card-stripe" style={{ background: project.color }} />
      <header className="dev-project-card-header">
        <div className="dev-project-card-titles">
          <span className="dev-project-card-key" style={{ background: `${project.color}22`, color: project.color, borderColor: `${project.color}55` }}>
            {project.key}
          </span>
          <h3 className="dev-project-card-name">{project.name}</h3>
        </div>
        <span className={`dev-project-status status-${project.status.toLowerCase()}`}>
          {project.status === 'ACTIVE' && 'Actif'}
          {project.status === 'PAUSED' && 'En pause'}
          {project.status === 'ARCHIVED' && 'Archivé'}
        </span>
      </header>

      {project.description && <p className="dev-project-card-desc">{project.description}</p>}

      <div className="dev-project-card-stats">
        <div className="dev-project-card-stat">
          <span className="dev-project-card-stat-value">{open}</span>
          <span className="dev-project-card-stat-label">ouvertes</span>
        </div>
        <div className="dev-project-card-stat">
          <span className="dev-project-card-stat-value">{project.members?.length ?? 0}</span>
          <span className="dev-project-card-stat-label">
            <Users size={11} style={{ verticalAlign: -1, marginRight: 3 }} />
            membres
          </span>
        </div>
        <div className="dev-project-card-stat">
          <span className="dev-project-card-stat-value">{formatRelative(project.updatedAt)}</span>
          <span className="dev-project-card-stat-label">mise à jour</span>
        </div>
      </div>

      <footer className="dev-project-card-footer">
        <div className="dev-project-card-people">
          {project.lead ? (
            <>
              <Avatar user={project.lead} size={20} />
              <span className="dev-project-card-lead">
                {project.lead.name || project.lead.email}
              </span>
            </>
          ) : (
            <span className="dev-project-card-lead muted">Pas de lead</span>
          )}
        </div>
        <button
          className="dev-btn subtle"
          onClick={(e) => {
            e.stopPropagation()
            onFocusIssues()
          }}
        >
          Voir issues <ChevronRight size={11} />
        </button>
      </footer>
    </article>
  )
}

function ProjectDetailContent({
  detail,
  onClose,
  onFocusIssues,
}: {
  detail: DevProjectDetail
  onClose: () => void
  onFocusIssues: () => void
}) {
  const { project, stats, recentIssues } = detail
  return (
    <>
      <header
        className="dev-project-drawer-header"
        style={{ borderTopColor: project.color }}
      >
        <div>
          <div className="dev-project-drawer-key" style={{ color: project.color }}>
            {project.key}
          </div>
          <h2 className="dev-project-drawer-name">{project.name}</h2>
          {project.description && (
            <p className="dev-project-drawer-desc">{project.description}</p>
          )}
        </div>
        <button className="dev-detail-close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </header>

      <section className="dev-project-drawer-progress">
        <div className="dev-project-drawer-progress-head">
          <span>Progression</span>
          <strong>{stats.progress}%</strong>
        </div>
        <div className="dev-progress-track">
          <div
            className="dev-progress-fill"
            style={{ width: `${stats.progress}%`, background: project.color }}
          />
        </div>
        <div className="dev-project-drawer-progress-foot">
          <span>{stats.done} terminée(s)</span>
          <span>{stats.open} en cours</span>
          <span>{stats.total} total</span>
        </div>
      </section>

      {/* KPIs drawer ordonnés par actionabilité : en retard d'abord, vélocité ensuite. */}
      <section className="dev-project-drawer-kpis">
        <DrawerKpi label="En retard" value={stats.overdue} tone={stats.overdue > 0 ? 'rose' : undefined} />
        <DrawerKpi label="Terminées (14j)" value={stats.completed14} />
        <DrawerKpi label="Velocity (7j)" value={stats.completed7} />
        <DrawerKpi label="Créées (7j)" value={stats.created7} />
      </section>

      <section className="dev-project-drawer-section">
        <h4>Statuts</h4>
        <div className="dev-status-bars">
          {(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'] as const).map((s) => {
            const count = stats.byStatus[s] || 0
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
            return (
              <div key={s} className="dev-status-bar-row">
                <span className="dev-status-bar-label" style={{ color: STATUS_COLOR[s] }}>
                  {STATUS_LABEL[s]}
                </span>
                <div className="dev-status-bar-track">
                  <div
                    className="dev-status-bar-fill"
                    style={{ width: `${pct}%`, background: STATUS_COLOR[s] }}
                  />
                </div>
                <span className="dev-status-bar-value">{count}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="dev-project-drawer-section">
        <h4>Dernières issues</h4>
        {recentIssues.length === 0 ? (
          <div className="dev-empty" style={{ padding: '12px 0' }}>
            Aucune issue.
          </div>
        ) : (
          <ul className="dev-project-drawer-issues">
            {recentIssues.map((issue) => (
              <li key={issue._id} className="dev-project-drawer-issue">
                <StatusGlyph status={issue.status} size={13} />
                <span className="dev-project-drawer-issue-id" style={{ color: project.color }}>
                  {project.key}-{issue.number}
                </span>
                <span className="dev-project-drawer-issue-title">{issue.title}</span>
                <Avatar user={issue.assignee} size={18} />
                <span className="dev-project-drawer-issue-when">{formatRelative(issue.updatedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="dev-project-drawer-footer">
        <button className="dev-btn primary" onClick={onFocusIssues}>
          Ouvrir les issues du projet
        </button>
      </footer>
    </>
  )
}

function DrawerKpi({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'rose'
}) {
  return (
    <div className={`dev-drawer-kpi${tone ? ` tone-${tone}` : ''}`}>
      <div className="dev-drawer-kpi-value">{value}</div>
      <div className="dev-drawer-kpi-label">{label}</div>
    </div>
  )
}

export default ProjectsView
