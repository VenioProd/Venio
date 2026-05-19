import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Activity, CircleDot, Layers3, Plus, RefreshCw, Target, Trash2, X } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import { useConfirm } from '../../../hooks/useConfirm'
import {
  listDevProjects,
  listDevIssues,
  fetchDevStats,
  fetchDevOverview,
  createDevIssue,
  updateDevIssue,
  deleteDevIssue,
  createDevProject,
  addDevIssueComment,
  getDevIssue,
  deleteDevIssueComment,
  STATUS_LABEL,
  STATUS_COLOR,
  STATUS_ORDER,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  PRIORITY_ORDER,
  TYPE_LABEL,
  TYPE_COLOR,
  computeWeightedProgress,
  type DevProject,
  type DevIssue,
  type DevIssueComment,
  type DevIssueStatus,
  type DevIssuePriority,
  type DevIssueType,
  type DevStats,
  type DevOverview,
  type IssueFilters,
} from '../../../services/dev'
import './DevWorkspace.css'

const PRIORITY_ICON: Record<DevIssuePriority, string> = {
  URGENT: '!!',
  HIGH: '⏶',
  MEDIUM: '=',
  LOW: '⏷',
  NO_PRIORITY: '·',
}

function formatRelative(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const now = Date.now()
  const diff = now - d.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return 'à l\'instant'
  if (diff < hour) return `il y a ${Math.floor(diff / minute)} min`
  if (diff < day) return `il y a ${Math.floor(diff / hour)} h`
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function userInitial(u: { name?: string; email?: string } | null | undefined): string {
  if (!u) return '?'
  const name = u.name || u.email || ''
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

interface DeepLinkParams {
  issueId?: string
  projectId?: string
}

const DevWorkspace = () => {
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_DEV)
  const { confirm, ConfirmDialog } = useConfirm()
  const params = useParams<DeepLinkParams>()
  const navigate = useNavigate()
  const location = useLocation()
  const deepIssueId = params.issueId
  const deepProjectId = params.projectId

  const [projects, setProjects] = useState<DevProject[]>([])
  const [issues, setIssues] = useState<DevIssue[]>([])
  const [overview, setOverview] = useState<DevOverview | null>(null)
  const [stats, setStats] = useState<DevStats | null>(null)

  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<IssueFilters>({
    status: 'open',
    project: deepProjectId,
  })
  const [selectedIssue, setSelectedIssue] = useState<DevIssue | null>(null)
  const [comments, setComments] = useState<DevIssueComment[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  const [groupBy, setGroupBy] = useState<'status' | 'priority' | 'none'>('status')

  const [showProjectModal, setShowProjectModal] = useState(false)
  const [projectForm, setProjectForm] = useState({ key: '', name: '', description: '', color: '#7c5cff' })
  const [projectError, setProjectError] = useState<string | null>(null)
  const [savingProject, setSavingProject] = useState(false)

  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const [quickCreate, setQuickCreate] = useState<{
    title: string
    project: string
    type: DevIssueType
    priority: DevIssuePriority
    status: DevIssueStatus
  }>({ title: '', project: '', type: 'TASK', priority: 'NO_PRIORITY', status: 'TODO' })
  const [creating, setCreating] = useState(false)

  const loadProjects = useCallback(async () => {
    try {
      const data = await listDevProjects()
      setProjects(data.projects)
      if (data.projects.length && !quickCreate.project) {
        setQuickCreate((q) => ({ ...q, project: data.projects[0]!._id }))
      }
    } catch (e) {
      console.error(e)
    }
  }, [quickCreate.project])

  const loadIssues = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listDevIssues(filters)
      setIssues(data.issues)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filters])

  const loadStats = useCallback(async () => {
    try {
      const s = await fetchDevStats(filters.project)
      setStats(s)
    } catch (e) {
      console.error(e)
    }
  }, [filters.project])

  const loadOverview = useCallback(async () => {
    try {
      const data = await fetchDevOverview()
      setOverview(data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])
  useEffect(() => { loadIssues() }, [loadIssues])
  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadOverview() }, [loadOverview])

  const loadIssueDetail = useCallback(async (id: string) => {
    try {
      const data = await getDevIssue(id)
      setSelectedIssue(data.issue)
      setComments(data.comments)
    } catch (e) {
      console.error(e)
      // Deep link to an issue that no longer exists: bounce back to workspace root.
      if (location.pathname.startsWith('/admin/dev/issues/')) navigate('/admin/dev', { replace: true })
    }
  }, [location.pathname, navigate])

  const handleSelectIssue = (issue: DevIssue) => {
    setSelectedIssue(issue)
    setComments([])
    setCommentDraft('')
    loadIssueDetail(issue._id)
    if (deepIssueId !== issue._id) {
      navigate(`/admin/dev/issues/${issue._id}`, { replace: false })
    }
  }

  const handleCloseDetail = () => {
    setSelectedIssue(null)
    setComments([])
    if (location.pathname.startsWith('/admin/dev/issues/')) {
      navigate('/admin/dev', { replace: false })
    }
  }

  // Deep link: open the issue when /admin/dev/issues/:id is navigated to.
  useEffect(() => {
    if (deepIssueId && selectedIssue?._id !== deepIssueId) {
      setSelectedIssue(null)
      setComments([])
      setCommentDraft('')
      loadIssueDetail(deepIssueId)
    }
    if (!deepIssueId && selectedIssue && location.pathname === '/admin/dev') {
      setSelectedIssue(null)
      setComments([])
    }
  }, [deepIssueId, loadIssueDetail, selectedIssue, location.pathname])

  // Deep link: scope filters to the project when /admin/dev/projects/:id is navigated to.
  useEffect(() => {
    if (deepProjectId && filters.project !== deepProjectId) {
      setFilters((f) => ({ ...f, project: deepProjectId }))
    }
  }, [deepProjectId, filters.project])

  // Mutations
  const handleQuickCreate = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!quickCreate.title.trim() || !quickCreate.project) return
    setCreating(true)
    try {
      await createDevIssue({
        title: quickCreate.title.trim(),
        project: quickCreate.project,
        type: quickCreate.type,
        priority: quickCreate.priority,
        status: quickCreate.status,
      })
      setQuickCreate((q) => ({ ...q, title: '' }))
      await Promise.all([loadIssues(), loadStats(), loadOverview()])
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  const handlePatchIssue = async (id: string, patch: Partial<DevIssue> & { assignee?: string | null }) => {
    try {
      const updated = await updateDevIssue(id, patch)
      setIssues((prev) => prev.map((i) => (i._id === id ? { ...i, ...updated } : i)))
      if (selectedIssue?._id === id) setSelectedIssue((prev) => (prev ? { ...prev, ...updated } : prev))
      Promise.all([loadStats(), loadOverview()])
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteIssue = async (id: string) => {
    if (!(await confirm({ message: 'Supprimer définitivement cette issue ?', title: 'Suppression' }))) return
    try {
      await deleteDevIssue(id)
      setIssues((prev) => prev.filter((i) => i._id !== id))
      if (selectedIssue?._id === id) handleCloseDetail()
      Promise.all([loadStats(), loadOverview()])
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddComment = async () => {
    if (!commentDraft.trim() || !selectedIssue) return
    try {
      const c = await addDevIssueComment(selectedIssue._id, commentDraft.trim())
      setComments((prev) => [...prev, c])
      setCommentDraft('')
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!selectedIssue) return
    if (!(await confirm({ message: 'Supprimer ce commentaire ?', title: 'Suppression' }))) return
    try {
      await deleteDevIssueComment(selectedIssue._id, commentId)
      setComments((prev) => prev.filter((c) => c._id !== commentId))
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    setProjectError(null)
    if (!projectForm.key.trim() || !projectForm.name.trim()) {
      setProjectError('Clé et nom requis')
      return
    }
    setSavingProject(true)
    try {
      const created = await createDevProject({
        key: projectForm.key.trim(),
        name: projectForm.name.trim(),
        description: projectForm.description.trim(),
        color: projectForm.color,
      })
      setShowProjectModal(false)
      setProjectForm({ key: '', name: '', description: '', color: '#7c5cff' })
      await loadProjects()
      setFilters((f) => ({ ...f, project: created._id }))
      setQuickCreate((q) => ({ ...q, project: created._id }))
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSavingProject(false)
    }
  }

  // Group issues for display
  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'Toutes', issues, count: issues.length }]
    if (groupBy === 'priority') {
      return PRIORITY_ORDER.map((p) => ({
        key: PRIORITY_LABEL[p],
        color: PRIORITY_COLOR[p],
        issues: issues.filter((i) => i.priority === p),
        count: issues.filter((i) => i.priority === p).length,
      })).filter((g) => g.count > 0)
    }
    return STATUS_ORDER.map((s) => ({
      key: STATUS_LABEL[s],
      color: STATUS_COLOR[s],
      issues: issues.filter((i) => i.status === s),
      count: issues.filter((i) => i.status === s).length,
    })).filter((g) => g.count > 0)
  }, [issues, groupBy])

  const projectOverview = useMemo(() => {
    if (!overview) return []
    return overview.projects.map((p) => {
      const active = (p.counts.byStatus.IN_PROGRESS || 0) + (p.counts.byStatus.IN_REVIEW || 0)
      return {
        project: { _id: p._id, key: p.key, name: p.name, color: p.color },
        total: p.counts.total,
        done: p.counts.done,
        active,
        urgent: p.counts.urgent,
        blocked: p.counts.blocked,
        percent: p.progress,
        health: p.health,
      }
    })
  }, [overview])

  const globalCompletion = stats ? computeWeightedProgress(stats.byStatus as Record<DevIssueStatus, number>) : 0

  const renderRow = (issue: DevIssue) => {
    const project = typeof issue.project === 'object' ? issue.project : null
    return (
      <div
        key={issue._id}
        className={`dev-row${selectedIssue?._id === issue._id ? ' selected' : ''}`}
        onClick={() => handleSelectIssue(issue)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleSelectIssue(issue)}
      >
        <span
          className="dev-row-priority"
          title={PRIORITY_LABEL[issue.priority]}
          style={{ ['--prio-color' as never]: PRIORITY_COLOR[issue.priority] }}
        >
          {PRIORITY_ICON[issue.priority]}
        </span>
        <span className="dev-row-identifier">
          {project ? `${project.key}-${issue.number}` : issue.identifier}
        </span>
        <span
          className="dev-row-status"
          style={{ color: STATUS_COLOR[issue.status] }}
          title={STATUS_LABEL[issue.status]}
        >
          <span className={`dev-row-status-dot${issue.status === 'DONE' || issue.status === 'CANCELLED' ? ' filled' : ''}`} />
        </span>
        <span className="dev-row-title">{issue.title}</span>
        <span className="dev-row-type" style={{ ['--type-color' as never]: TYPE_COLOR[issue.type] }}>
          {TYPE_LABEL[issue.type]}
        </span>
        <span className="dev-row-labels">
          {issue.labels.slice(0, 2).map((l) => (
            <span key={l} className="dev-row-label">{l}</span>
          ))}
          {issue.labels.length > 2 && <span className="dev-row-label">+{issue.labels.length - 2}</span>}
        </span>
        <span className="dev-row-date">{formatRelative(issue.updatedAt)}</span>
        <span
          className={`dev-row-assignee${issue.assignee ? ' filled' : ''}`}
          title={issue.assignee?.name || issue.assignee?.email || 'Non assignée'}
        >
          {issue.assignee ? userInitial(issue.assignee) : '?'}
        </span>
      </div>
    )
  }

  return (
    <div className="dev-workspace">
      {ConfirmDialog}

      <div className="dev-header">
        <div className="dev-header-left">
          <h1 className="dev-title">Suivi développement</h1>
          <span className="dev-subtitle">{stats?.totalProjects ?? 0} projet(s) · {stats?.open ?? 0} issue(s) ouverte(s)</span>
        </div>
        <div className="dev-header-actions">
          <button className="dev-btn subtle" onClick={loadIssues} title="Rafraîchir">
            <RefreshCw size={13} />
          </button>
          {canManage && (
            <>
              <button className="dev-btn subtle" onClick={() => setShowProjectModal(true)}>
                <Plus size={13} /> Projet
              </button>
              <button
                className="dev-btn primary"
                onClick={() => setShowQuickCreate((s) => !s)}
                disabled={projects.length === 0}
                title={projects.length === 0 ? 'Créez d\'abord un projet' : undefined}
              >
                <Plus size={13} /> Nouvelle issue
              </button>
            </>
          )}
        </div>
      </div>

      {stats && (
        <div className="dev-overview">
          <section className="dev-command-card">
            <div className="dev-command-card-main">
              <span className="dev-kicker">Command center</span>
              <div className="dev-command-title-row">
                <h2>{globalCompletion}%</h2>
                <span>complétion globale</span>
              </div>
              <div className="dev-progress-track" aria-label={'Complétion globale ' + globalCompletion + '%'}>
                <span style={{ width: globalCompletion + '%' }} />
              </div>
            </div>
            <div className="dev-command-metrics">
              <span><Layers3 size={14} /> {stats.totalProjects} projets</span>
              <span><CircleDot size={14} /> {stats.open} ouvertes</span>
              <span><Activity size={14} /> {stats.byStatus.IN_PROGRESS + stats.byStatus.IN_REVIEW} actives</span>
              <span><Target size={14} /> {stats.completedRecent} finies / 14j</span>
            </div>
          </section>

          {projectOverview.length > 0 && (
            <div className="dev-project-strip">
              {projectOverview.slice(0, 6).map(({ project, total, done, active, urgent, blocked, percent, health }) => (
                <button
                  key={project._id}
                  type="button"
                  className={'dev-project-card' + (filters.project === project._id ? ' selected' : '')}
                  onClick={() => {
                    const next = filters.project === project._id ? undefined : project._id
                    setFilters((f) => ({ ...f, project: next }))
                    if (next) navigate(`/admin/dev/projects/${next}`)
                    else if (location.pathname.startsWith('/admin/dev/projects/')) navigate('/admin/dev')
                  }}
                  style={{ ['--project-color' as never]: project.color || '#7c5cff' }}
                  title={`Santé: ${health}`}
                >
                  <span className="dev-project-card-key">{project.key}</span>
                  <strong>{project.name}</strong>
                  <span className="dev-project-card-meta">
                    {done}/{total} terminées · {active} actives
                  </span>
                  <span className="dev-project-progress"><span style={{ width: percent + '%' }} /></span>
                  <span className="dev-project-card-footer">
                    <span className={urgent ? 'warn' : ''}>{urgent} urgent(s)</span>
                    <span className={blocked ? 'warn' : ''}>
                      {blocked ? `${blocked} bloqué(s)` : `${percent}% progression`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="dev-toolbar">
        <input
          className="dev-search"
          placeholder="Rechercher (titre, identifiant)…"
          value={filters.q || ''}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <select
          className="dev-select"
          value={filters.project || 'all'}
          onChange={(e) => {
            const next = e.target.value === 'all' ? undefined : e.target.value
            setFilters((f) => ({ ...f, project: next }))
            if (next) navigate(`/admin/dev/projects/${next}`)
            else if (location.pathname.startsWith('/admin/dev/projects/')) navigate('/admin/dev')
          }}
        >
          <option value="all">Tous projets</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>{p.key} · {p.name}</option>
          ))}
        </select>
        <select
          className="dev-select"
          value={filters.status || 'open'}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as IssueFilters['status'] }))}
        >
          <option value="open">Ouvertes</option>
          <option value="all">Toutes</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <select
          className="dev-select"
          value={filters.priority || 'all'}
          onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as IssueFilters['priority'] }))}
        >
          <option value="all">Toutes priorités</option>
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
          ))}
        </select>
        <select
          className="dev-select"
          value={filters.type || 'all'}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as IssueFilters['type'] }))}
        >
          <option value="all">Tous types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          className="dev-select"
          value={filters.assignee || 'all'}
          onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value as IssueFilters['assignee'] }))}
        >
          <option value="all">Tous assignés</option>
          <option value="me">Moi</option>
          <option value="unassigned">Non assignées</option>
        </select>
        <select
          className="dev-select"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as 'status' | 'priority' | 'none')}
        >
          <option value="status">Groupé par statut</option>
          <option value="priority">Groupé par priorité</option>
          <option value="none">Pas de groupe</option>
        </select>
      </div>

      <div className={`dev-body${selectedIssue ? ' with-detail' : ''}`}>
        <div className="dev-list">
          {canManage && showQuickCreate && (
            <form className="dev-quick-create" onSubmit={handleQuickCreate}>
              <select
                value={quickCreate.project}
                onChange={(e) => setQuickCreate((q) => ({ ...q, project: e.target.value }))}
              >
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>{p.key}</option>
                ))}
              </select>
              <input
                className="title"
                placeholder="Titre de l'issue…"
                value={quickCreate.title}
                onChange={(e) => setQuickCreate((q) => ({ ...q, title: e.target.value }))}
                autoFocus
              />
              <select
                value={quickCreate.type}
                onChange={(e) => setQuickCreate((q) => ({ ...q, type: e.target.value as DevIssueType }))}
              >
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select
                value={quickCreate.priority}
                onChange={(e) => setQuickCreate((q) => ({ ...q, priority: e.target.value as DevIssuePriority }))}
              >
                {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
              <select
                value={quickCreate.status}
                onChange={(e) => setQuickCreate((q) => ({ ...q, status: e.target.value as DevIssueStatus }))}
              >
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <button type="submit" className="dev-btn primary" disabled={creating || !quickCreate.title.trim()}>
                {creating ? '…' : 'Créer'}
              </button>
              <button type="button" className="dev-btn subtle" onClick={() => setShowQuickCreate(false)}>Annuler</button>
            </form>
          )}

          {loading ? (
            <div className="dev-loading">Chargement…</div>
          ) : issues.length === 0 ? (
            <div className="dev-empty">
              Aucune issue.
              {projects.length === 0 && canManage && (
                <div style={{ marginTop: 12 }}>
                  <button className="dev-btn primary" onClick={() => setShowProjectModal(true)}>
                    Créer le premier projet
                  </button>
                </div>
              )}
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.key}>
                <div className="dev-list-group-header" style={{ color: (group as { color?: string }).color }}>
                  {group.key}
                  <span className="dev-list-group-count">{group.count}</span>
                </div>
                {group.issues.map(renderRow)}
              </div>
            ))
          )}
        </div>

        {selectedIssue && (
          <aside className="dev-detail">
            <div className="dev-detail-header">
              <span className="dev-detail-id">
                {(typeof selectedIssue.project === 'object' ? selectedIssue.project.key : '')}-{selectedIssue.number}
                {' '}· {selectedIssue.reporter?.name || selectedIssue.reporter?.email || ''}
              </span>
              <button className="dev-detail-close" onClick={handleCloseDetail} aria-label="Fermer">
                <X size={16} />
              </button>
            </div>
            <div className="dev-detail-body">
              <input
                className="dev-detail-title-input"
                value={selectedIssue.title}
                disabled={!canManage}
                onChange={(e) => setSelectedIssue((p) => (p ? { ...p, title: e.target.value } : p))}
                onBlur={() => canManage && handlePatchIssue(selectedIssue._id, { title: selectedIssue.title })}
              />

              <div className="dev-detail-meta">
                <span className="dev-detail-meta-label">Statut</span>
                <span className="dev-detail-meta-value">
                  <select
                    disabled={!canManage}
                    value={selectedIssue.status}
                    onChange={(e) => handlePatchIssue(selectedIssue._id, { status: e.target.value as DevIssueStatus })}
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </span>

                <span className="dev-detail-meta-label">Priorité</span>
                <span className="dev-detail-meta-value">
                  <select
                    disabled={!canManage}
                    value={selectedIssue.priority}
                    onChange={(e) => handlePatchIssue(selectedIssue._id, { priority: e.target.value as DevIssuePriority })}
                  >
                    {PRIORITY_ORDER.map((p) => (
                      <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                    ))}
                  </select>
                </span>

                <span className="dev-detail-meta-label">Type</span>
                <span className="dev-detail-meta-value">
                  <select
                    disabled={!canManage}
                    value={selectedIssue.type}
                    onChange={(e) => handlePatchIssue(selectedIssue._id, { type: e.target.value as DevIssueType })}
                  >
                    {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </span>

                <span className="dev-detail-meta-label">Labels</span>
                <span className="dev-detail-meta-value">
                  <input
                    disabled={!canManage}
                    placeholder="virgules pour séparer"
                    defaultValue={selectedIssue.labels.join(', ')}
                    onBlur={(e) => {
                      const labels = e.target.value
                        .split(',')
                        .map((l) => l.trim().toLowerCase())
                        .filter(Boolean)
                      handlePatchIssue(selectedIssue._id, { labels })
                    }}
                  />
                </span>

                <span className="dev-detail-meta-label">Échéance</span>
                <span className="dev-detail-meta-value">
                  <input
                    type="date"
                    disabled={!canManage}
                    value={selectedIssue.dueDate ? selectedIssue.dueDate.slice(0, 10) : ''}
                    onChange={(e) =>
                      handlePatchIssue(selectedIssue._id, {
                        dueDate: e.target.value || null,
                      })
                    }
                  />
                </span>

                <span className="dev-detail-meta-label">Créée</span>
                <span className="dev-detail-meta-value" style={{ fontSize: 12.5, color: '#94a3b8' }}>
                  {formatRelative(selectedIssue.createdAt)}
                </span>
              </div>

              <textarea
                className="dev-detail-description"
                placeholder="Description / contexte / liens GitHub…"
                disabled={!canManage}
                value={selectedIssue.description}
                onChange={(e) => setSelectedIssue((p) => (p ? { ...p, description: e.target.value } : p))}
                onBlur={() => canManage && handlePatchIssue(selectedIssue._id, { description: selectedIssue.description })}
              />

              <div className="dev-detail-section">Commentaires ({comments.length})</div>
              <div className="dev-comments">
                {comments.map((c) => (
                  <div key={c._id} className="dev-comment">
                    <div className="dev-comment-meta">
                      <span>{c.author?.name || c.author?.email || 'Inconnu'} · {formatRelative(c.createdAt)}</span>
                      {(canManage || c.author?._id === user?._id) && (
                        <button className="dev-comment-delete" onClick={() => handleDeleteComment(c._id)}>
                          supprimer
                        </button>
                      )}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
                  </div>
                ))}
                {comments.length === 0 && (
                  <div style={{ color: '#64748b', fontSize: 12.5 }}>Aucun commentaire</div>
                )}
              </div>

              {canManage && (
                <div className="dev-comment-form">
                  <textarea
                    placeholder="Ajouter un commentaire…"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                  />
                  <div className="dev-comment-form-actions">
                    <button className="dev-btn primary" onClick={handleAddComment} disabled={!commentDraft.trim()}>
                      Commenter
                    </button>
                  </div>
                </div>
              )}

              {canManage && (
                <div className="dev-danger-zone">
                  <button className="dev-danger-btn" onClick={() => handleDeleteIssue(selectedIssue._id)}>
                    <Trash2 size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Supprimer l'issue
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {showProjectModal && (
        <div className="dev-modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowProjectModal(false)}>
          <form className="dev-modal" onSubmit={handleCreateProject} onClick={(e) => e.stopPropagation()}>
            <h2>Nouveau projet de développement</h2>
            <div className="dev-modal-field">
              <label>Clé (préfixe identifiant, 2-8 lettres majuscules) *</label>
              <input
                value={projectForm.key}
                onChange={(e) => setProjectForm((f) => ({ ...f, key: e.target.value.toUpperCase() }))}
                placeholder="ARROW, VEN…"
                maxLength={8}
                required
              />
            </div>
            <div className="dev-modal-field">
              <label>Nom *</label>
              <input
                value={projectForm.name}
                onChange={(e) => setProjectForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Arrow SaaS, Site Venio…"
                required
              />
            </div>
            <div className="dev-modal-field">
              <label>Description</label>
              <textarea
                value={projectForm.description}
                onChange={(e) => setProjectForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="dev-modal-field">
              <label>Couleur</label>
              <input
                type="color"
                value={projectForm.color}
                onChange={(e) => setProjectForm((f) => ({ ...f, color: e.target.value }))}
              />
            </div>
            {projectError && (
              <div style={{ color: '#fca5a5', fontSize: 12.5, marginTop: 6 }}>{projectError}</div>
            )}
            <div className="dev-modal-actions">
              <button type="button" className="dev-btn subtle" onClick={() => setShowProjectModal(false)}>Annuler</button>
              <button type="submit" className="dev-btn primary" disabled={savingProject}>
                {savingProject ? 'Création…' : 'Créer le projet'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default DevWorkspace
