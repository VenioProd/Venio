import { useEffect, useMemo, useState, useCallback } from 'react'
import { Plus, X, Trash2, RefreshCw } from 'lucide-react'
import { useAuth } from '../../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions'
import { useConfirm } from '../../../../hooks/useConfirm'
import {
  listDevIssues,
  createDevIssue,
  updateDevIssue,
  deleteDevIssue,
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
  type DevProject,
  type DevIssue,
  type DevIssueComment,
  type DevIssueStatus,
  type DevIssuePriority,
  type DevIssueType,
  type IssueFilters,
} from '../../../../services/dev'
import { Avatar, PriorityIcon, StatusGlyph, formatRelative } from '../shared'

interface Props {
  projects: DevProject[]
  filters: IssueFilters
  setFilters: React.Dispatch<React.SetStateAction<IssueFilters>>
  onProjectsChanged?: () => void
  refreshStatsTick: () => void
  onOpenProjectModal: () => void
}

const IssuesView = ({ projects, filters, setFilters, refreshStatsTick, onOpenProjectModal }: Props) => {
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_DEV)
  const { confirm, ConfirmDialog } = useConfirm()

  const [issues, setIssues] = useState<DevIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<DevIssue | null>(null)
  const [comments, setComments] = useState<DevIssueComment[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  const [groupBy, setGroupBy] = useState<'status' | 'priority' | 'none'>('status')

  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const [quickCreate, setQuickCreate] = useState<{
    title: string
    project: string
    type: DevIssueType
    priority: DevIssuePriority
    status: DevIssueStatus
  }>({ title: '', project: '', type: 'TASK', priority: 'NO_PRIORITY', status: 'TODO' })
  const [creating, setCreating] = useState(false)

  // sync quickCreate.project default
  useEffect(() => {
    if (projects.length && !quickCreate.project) {
      setQuickCreate((q) => ({ ...q, project: projects[0]!._id }))
    }
  }, [projects, quickCreate.project])

  const loadIssues = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listDevIssues(filters)
      setIssues(data.issues)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadIssues()
  }, [loadIssues])

  const loadIssueDetail = useCallback(async (id: string) => {
    try {
      const data = await getDevIssue(id)
      setSelectedIssue(data.issue)
      setComments(data.comments)
    } catch (e) {
      console.error(e)
    }
  }, [])

  const handleSelectIssue = (issue: DevIssue) => {
    setSelectedIssue(issue)
    setComments([])
    setCommentDraft('')
    loadIssueDetail(issue._id)
  }

  const handleCloseDetail = () => {
    setSelectedIssue(null)
    setComments([])
  }

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
      await loadIssues()
      refreshStatsTick()
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  const handlePatchIssue = async (
    id: string,
    patch: Partial<DevIssue> & { assignee?: string | null }
  ) => {
    try {
      const updated = await updateDevIssue(id, patch)
      setIssues((prev) => prev.map((i) => (i._id === id ? { ...i, ...updated } : i)))
      if (selectedIssue?._id === id) setSelectedIssue((prev) => (prev ? { ...prev, ...updated } : prev))
      refreshStatsTick()
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
      refreshStatsTick()
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

  // Group issues for display
  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'Toutes', color: undefined as string | undefined, issues, count: issues.length }]
    if (groupBy === 'priority') {
      return PRIORITY_ORDER.map((p) => ({
        key: PRIORITY_LABEL[p],
        color: PRIORITY_COLOR[p] as string | undefined,
        issues: issues.filter((i) => i.priority === p),
        count: issues.filter((i) => i.priority === p).length,
      })).filter((g) => g.count > 0)
    }
    return STATUS_ORDER.map((s) => ({
      key: STATUS_LABEL[s],
      color: STATUS_COLOR[s] as string | undefined,
      issues: issues.filter((i) => i.status === s),
      count: issues.filter((i) => i.status === s).length,
    })).filter((g) => g.count > 0)
  }, [issues, groupBy])

  const renderRow = (issue: DevIssue) => {
    const project = typeof issue.project === 'object' ? issue.project : null
    const overdue =
      issue.dueDate &&
      new Date(issue.dueDate).getTime() < Date.now() &&
      issue.status !== 'DONE' &&
      issue.status !== 'CANCELLED'
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
          <PriorityIcon priority={issue.priority} size={13} />
        </span>
        <span className="dev-row-identifier" style={project ? { color: project.color || undefined } : undefined}>
          {project ? `${project.key}-${issue.number}` : issue.identifier}
        </span>
        <span
          className="dev-row-status"
          style={{ color: STATUS_COLOR[issue.status] }}
          title={STATUS_LABEL[issue.status]}
        >
          <StatusGlyph status={issue.status} size={14} />
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
        <span className={`dev-row-date${overdue ? ' overdue' : ''}`}>
          {overdue ? 'En retard' : formatRelative(issue.updatedAt)}
        </span>
        <Avatar user={issue.assignee} size={22} />
      </div>
    )
  }

  return (
    <>
      {ConfirmDialog}

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
          onChange={(e) =>
            setFilters((f) => ({ ...f, project: e.target.value === 'all' ? undefined : e.target.value }))
          }
        >
          <option value="all">Tous projets</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.key} · {p.name}
            </option>
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
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          className="dev-select"
          value={filters.priority || 'all'}
          onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as IssueFilters['priority'] }))}
        >
          <option value="all">Toutes priorités</option>
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <select
          className="dev-select"
          value={filters.type || 'all'}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as IssueFilters['type'] }))}
        >
          <option value="all">Tous types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="dev-select"
          value={filters.assignee || 'all'}
          onChange={(e) =>
            setFilters((f) => ({ ...f, assignee: e.target.value as IssueFilters['assignee'] }))
          }
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
        <button className="dev-btn subtle" onClick={loadIssues} title="Rafraîchir">
          <RefreshCw size={13} />
        </button>
        {canManage && (
          <button
            className="dev-btn primary"
            onClick={() => setShowQuickCreate((s) => !s)}
            disabled={projects.length === 0}
            title={projects.length === 0 ? "Créez d'abord un projet" : undefined}
          >
            <Plus size={13} /> Issue
          </button>
        )}
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
                  <option key={p._id} value={p._id}>
                    {p.key}
                  </option>
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
                onChange={(e) =>
                  setQuickCreate((q) => ({ ...q, type: e.target.value as DevIssueType }))
                }
              >
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={quickCreate.priority}
                onChange={(e) =>
                  setQuickCreate((q) => ({ ...q, priority: e.target.value as DevIssuePriority }))
                }
              >
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
              <select
                value={quickCreate.status}
                onChange={(e) =>
                  setQuickCreate((q) => ({ ...q, status: e.target.value as DevIssueStatus }))
                }
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <button type="submit" className="dev-btn primary" disabled={creating || !quickCreate.title.trim()}>
                {creating ? '…' : 'Créer'}
              </button>
              <button type="button" className="dev-btn subtle" onClick={() => setShowQuickCreate(false)}>
                Annuler
              </button>
            </form>
          )}

          {loading ? (
            <div className="dev-loading">Chargement…</div>
          ) : error ? (
            <div className="dev-empty" style={{ color: '#fca5a5' }}>
              {error}
              <div style={{ marginTop: 12 }}>
                <button className="dev-btn subtle" onClick={loadIssues}>
                  Réessayer
                </button>
              </div>
            </div>
          ) : issues.length === 0 ? (
            <div className="dev-empty">
              Aucune issue.
              {projects.length === 0 && canManage && (
                <div style={{ marginTop: 12 }}>
                  <button className="dev-btn primary" onClick={onOpenProjectModal}>
                    Créer le premier projet
                  </button>
                </div>
              )}
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.key}>
                <div className="dev-list-group-header" style={{ color: group.color }}>
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
                {(typeof selectedIssue.project === 'object' ? selectedIssue.project.key : '')}-
                {selectedIssue.number}{' '}· {selectedIssue.reporter?.name || selectedIssue.reporter?.email || ''}
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
                    onChange={(e) =>
                      handlePatchIssue(selectedIssue._id, { status: e.target.value as DevIssueStatus })
                    }
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </span>

                <span className="dev-detail-meta-label">Priorité</span>
                <span className="dev-detail-meta-value">
                  <select
                    disabled={!canManage}
                    value={selectedIssue.priority}
                    onChange={(e) =>
                      handlePatchIssue(selectedIssue._id, {
                        priority: e.target.value as DevIssuePriority,
                      })
                    }
                  >
                    {PRIORITY_ORDER.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </span>

                <span className="dev-detail-meta-label">Type</span>
                <span className="dev-detail-meta-value">
                  <select
                    disabled={!canManage}
                    value={selectedIssue.type}
                    onChange={(e) =>
                      handlePatchIssue(selectedIssue._id, { type: e.target.value as DevIssueType })
                    }
                  >
                    {Object.entries(TYPE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
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
                onChange={(e) =>
                  setSelectedIssue((p) => (p ? { ...p, description: e.target.value } : p))
                }
                onBlur={() =>
                  canManage && handlePatchIssue(selectedIssue._id, { description: selectedIssue.description })
                }
              />

              <div className="dev-detail-section">Commentaires ({comments.length})</div>
              <div className="dev-comments">
                {comments.map((c) => (
                  <div key={c._id} className="dev-comment">
                    <div className="dev-comment-meta">
                      <span>
                        {c.author?.name || c.author?.email || 'Inconnu'} · {formatRelative(c.createdAt)}
                      </span>
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
                    <button
                      className="dev-btn primary"
                      onClick={handleAddComment}
                      disabled={!commentDraft.trim()}
                    >
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
    </>
  )
}

export default IssuesView
