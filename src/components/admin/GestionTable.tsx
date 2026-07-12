import { useState, useRef } from 'react'
import type { Task, TaskStatus, TaskPriority, TaskAttachment } from '../../types/task.types'

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  A_FAIRE: { label: 'A faire', color: '#64748b' },
  EN_COURS: { label: 'En cours', color: '#0ea5e9' },
  EN_REVIEW: { label: 'En review', color: '#f59e0b' },
  TERMINE: { label: 'Termine', color: '#22c55e' },
  VALIDE: { label: 'Valide', color: '#22c55e' },
  NON_VALIDE: { label: 'Non valide', color: '#ef4444' },
  A_MODIFIER: { label: 'A modifier', color: '#fb923c' },
}

// Statuts que le super admin utilise pour évaluer les tâches
const ADMIN_TASK_STATUSES: TaskStatus[] = ['EN_REVIEW', 'VALIDE', 'NON_VALIDE', 'A_MODIFIER']

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  BASSE: { label: 'Basse', color: '#64748b' },
  NORMALE: { label: 'Normale', color: '#0ea5e9' },
  HAUTE: { label: 'Haute', color: '#f59e0b' },
  URGENTE: { label: 'Urgente', color: '#ef4444' },
}

interface Props {
  tasks: Task[]
  loading: boolean
  onUpdate: (projectId: string, taskId: string, data: Record<string, unknown>) => Promise<void>
  getProjectId: (task: Task) => string
  readOnly?: boolean
  onRefresh?: () => void
}

export default function GestionTable({ tasks, loading, onUpdate, getProjectId, readOnly, onRefresh }: Props) {
  const [sortKey, setSortKey] = useState<string>('dueDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortTasks = (list: Task[]) => {
    return [...list].sort((a, b) => {
      let va: any, vb: any
      if (sortKey === 'title') {
        va = a.title.toLowerCase()
        vb = b.title.toLowerCase()
      } else if (sortKey === 'status') {
        va = a.status
        vb = b.status
      } else if (sortKey === 'priority') {
        const order = { BASSE: 0, NORMALE: 1, HAUTE: 2, URGENTE: 3 }
        va = order[a.priority]
        vb = order[b.priority]
      } else if (sortKey === 'assignee') {
        va = a.assignee?.name || ''
        vb = b.assignee?.name || ''
      } else if (sortKey === 'dueDate') {
        va = a.dueDate || '9999'
        vb = b.dueDate || '9999'
      } else if (sortKey === 'progress') {
        va = a.progress
        vb = b.progress
      } else {
        va = a.createdAt
        vb = b.createdAt
      }

      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }

  // Separate active and completed tasks
  // For non-super-admin (readOnly): tasks at 100% progress also go to completed
  const isCompleted = (t: Task) => t.status === 'TERMINE' || t.status === 'VALIDE' || (readOnly && t.progress === 100)
  const activeTasks = sortTasks(tasks.filter((t) => !isCompleted(t)))
  const completedTasks = sortTasks(tasks.filter((t) => isCompleted(t)))

  const getProjectName = (task: Task) => {
    if (typeof task.project === 'object' && task.project?.name) return task.project.name
    return ''
  }

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  const isOverdue = (task: Task) => {
    return task.dueDate && task.status !== 'TERMINE' && task.status !== 'VALIDE' && new Date(task.dueDate) < new Date()
  }

  const sortArrow = (key: string) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '')

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  }

  const handleUpload = async (task: Task) => {
    const files = fileRef.current?.files
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      const projectId = getProjectId(task)
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData()
        formData.append('file', files[i])
        await fetch(`/api/admin/projects/${projectId}/tasks/${task._id}/attachments`, {
          method: 'POST',
          body: formData,
        })
      }
      if (fileRef.current) fileRef.current.value = ''
      onRefresh?.()
    } catch (err) {
      console.error('Erreur upload:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = (task: Task, att: TaskAttachment) => {
    const projectId = getProjectId(task)
    window.open(`/api/admin/projects/${projectId}/tasks/${task._id}/attachments/${att._id}/download`, '_blank')
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const renderRow = (task: Task) => {
    const expanded = expandedId === task._id
    return (
      <>
        <tr
          key={task._id}
          className={`${isOverdue(task) ? 'gestion-row-overdue' : ''} ${expanded ? 'gestion-row-expanded' : ''} ${task.progress === 100 && task.status !== 'TERMINE' && task.status !== 'VALIDE' ? 'gestion-row-ready' : ''}`}
          onClick={() => toggleExpand(task._id)}
          style={{ cursor: 'pointer' }}
        >
          <td className="gestion-cell-title">
            <span className="gestion-expand-icon">{expanded ? '▾' : '▸'}</span>
            {task.title}
          </td>
          <td className="gestion-cell-project">{getProjectName(task)}</td>
          <td>
            {task.assignee ? (
              <span className="gestion-assignee-badge">
                {task.assignee.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()}
                <span className="gestion-assignee-name">{task.assignee.name}</span>
              </span>
            ) : (
              '—'
            )}
          </td>
          <td>
            {readOnly || task.progress < 100 ? (
              <span className="gestion-inline-badge" style={{ color: STATUS_CONFIG[task.status].color }}>
                {STATUS_CONFIG[task.status].label}
              </span>
            ) : (
              <select
                className="gestion-inline-select"
                value={task.status}
                style={{ color: STATUS_CONFIG[task.status].color }}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onUpdate(getProjectId(task), task._id, { status: e.target.value })}
              >
                {!ADMIN_TASK_STATUSES.includes(task.status) && (
                  <option value={task.status}>{STATUS_CONFIG[task.status].label}</option>
                )}
                {ADMIN_TASK_STATUSES.map((k) => (
                  <option key={k} value={k}>
                    {STATUS_CONFIG[k].label}
                  </option>
                ))}
              </select>
            )}
          </td>
          <td>
            {readOnly ? (
              <span className="gestion-inline-badge" style={{ color: PRIORITY_CONFIG[task.priority].color }}>
                {PRIORITY_CONFIG[task.priority].label}
              </span>
            ) : (
              <select
                className="gestion-inline-select"
                value={task.priority}
                style={{ color: PRIORITY_CONFIG[task.priority].color }}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onUpdate(getProjectId(task), task._id, { priority: e.target.value })}
              >
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            )}
          </td>
          <td className={isOverdue(task) ? 'gestion-cell-overdue' : ''}>{formatDate(task.dueDate)}</td>
          <td>{task.estimatedDuration ?? '—'}</td>
          <td>
            <div className="gestion-progress-cell">
              <div className="gestion-progress-bar">
                <div
                  className="gestion-progress-fill"
                  style={{
                    width: `${task.progress}%`,
                    background: task.progress === 100 ? '#22c55e' : 'var(--primary)',
                  }}
                />
              </div>
              {readOnly ? (
                <select
                  className="gestion-inline-select gestion-progress-select"
                  value={task.progress}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onUpdate(getProjectId(task), task._id, { progress: Number(e.target.value) })}
                >
                  {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => (
                    <option key={v} value={v}>
                      {v}%
                    </option>
                  ))}
                </select>
              ) : (
                <span className="gestion-progress-text">{task.progress}%</span>
              )}
            </div>
          </td>
        </tr>
        {expanded && (
          <tr key={`${task._id}-details`} className="gestion-details-row">
            <td colSpan={8}>
              <div className="gestion-task-details">
                {task.description && (
                  <div className="gestion-detail-section">
                    <span className="gestion-detail-label">Description</span>
                    <p className="gestion-detail-text">{task.description}</p>
                  </div>
                )}
                {task.tags && task.tags.length > 0 && (
                  <div className="gestion-detail-section">
                    <span className="gestion-detail-label">Tags</span>
                    <div className="gestion-detail-tags">
                      {task.tags.map((tag, i) => (
                        <span key={i} className="gestion-detail-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="gestion-detail-section">
                  <span className="gestion-detail-label">Livrables / Fichiers</span>
                  {task.attachments && task.attachments.length > 0 ? (
                    <div className="gestion-attachments-list">
                      {task.attachments.map((att) => (
                        <div
                          key={att._id}
                          className="gestion-attachment-item"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDownload(task, att)
                          }}
                        >
                          <span className="gestion-attachment-icon">
                            {att.mimeType.startsWith('image/') ? '🖼' : att.mimeType.includes('pdf') ? '📄' : '📎'}
                          </span>
                          <span className="gestion-attachment-name">{att.originalName}</span>
                          <span className="gestion-attachment-size">{formatFileSize(att.size)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="gestion-detail-empty">Aucun fichier</p>
                  )}
                  <div className="gestion-upload-area" onClick={(e) => e.stopPropagation()}>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      className="gestion-upload-input"
                      onChange={() => handleUpload(task)}
                      disabled={uploading}
                    />
                    <button
                      className="gestion-upload-btn"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? 'Envoi...' : '+ Ajouter un livrable'}
                    </button>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        )}
      </>
    )
  }

  if (loading) return <div className="gestion-loading">Chargement...</div>

  return (
    <div className="gestion-table-wrap">
      <table className="gestion-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('title')}>Tache{sortArrow('title')}</th>
            <th>Projet</th>
            <th onClick={() => handleSort('assignee')}>Assignee{sortArrow('assignee')}</th>
            <th onClick={() => handleSort('status')}>Statut{sortArrow('status')}</th>
            <th onClick={() => handleSort('priority')}>Priorite{sortArrow('priority')}</th>
            <th onClick={() => handleSort('dueDate')}>Deadline{sortArrow('dueDate')}</th>
            <th>Duree (h)</th>
            <th onClick={() => handleSort('progress')}>Progression{sortArrow('progress')}</th>
          </tr>
        </thead>
        <tbody>
          {activeTasks.length === 0 && completedTasks.length === 0 ? (
            <tr>
              <td colSpan={8} className="gestion-empty">
                Aucune tache
              </td>
            </tr>
          ) : (
            <>
              {activeTasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="gestion-empty">
                    Aucune tache en cours
                  </td>
                </tr>
              ) : (
                activeTasks.map(renderRow)
              )}
            </>
          )}
        </tbody>
      </table>

      {completedTasks.length > 0 && (
        <div className="gestion-completed-section">
          <button className="gestion-completed-toggle" onClick={() => setShowCompleted(!showCompleted)}>
            <span className="gestion-completed-icon">{showCompleted ? '▾' : '▸'}</span>
            Taches terminees ({completedTasks.length})
          </button>
          {showCompleted && (
            <table className="gestion-table gestion-table-completed">
              <thead>
                <tr>
                  <th>Tache</th>
                  <th>Projet</th>
                  <th>Assignee</th>
                  <th>Statut</th>
                  <th>Priorite</th>
                  <th>Deadline</th>
                  <th>Duree (h)</th>
                  <th>Progression</th>
                </tr>
              </thead>
              <tbody>{completedTasks.map(renderRow)}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
