import React, { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTabState } from '../../hooks/useTabState'
import { apiDownload, apiFetch } from '../../lib/api'
import type {
  Project,
  ProjectSection,
  ProjectItem,
  ProjectUpdate,
  ProjectDocument,
  ProjectAccessRole,
} from '../../types/project.types'
import ItemCard from '../../components/ItemCard'
import ClientProjectChat from '../../components/ClientProjectChat'
import ProjectCollaborators from '../../components/ProjectCollaborators'
import ProjectInvitations from '../../components/ProjectInvitations'
import './ClientPortal.css'

interface TaskProgress {
  total: number
  byStatus: { A_FAIRE: number; EN_COURS: number; EN_REVIEW: number; TERMINE: number }
  percent: number
}

interface ActivityEntry {
  _id: string
  action: string
  summary: string
  actor?: { name: string }
  createdAt: string
}

const statusClass: Record<string, string> = {
  EN_COURS: 'client-status-active',
  TERMINE: 'client-status-done',
  EN_ATTENTE: 'client-status-pending',
  ANNULE: 'client-status-cancelled',
}

const ClientProjectDetail = () => {
  const { id } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [accessRole, setAccessRole] = useState<ProjectAccessRole>('OWNER')
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [updates, setUpdates] = useState<ProjectUpdate[]>([])
  const [sections, setSections] = useState<ProjectSection[]>([])
  const [items, setItems] = useState<ProjectItem[]>([])
  const [taskProgress, setTaskProgress] = useState<TaskProgress | null>(null)
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')
  const [activeTab, setActiveTab] = useTabState('content')

  useEffect(() => {
    const load = async () => {
      try {
        const [projectData, sectionsData, itemsData, progressData, activityData] = await Promise.all([
          apiFetch<{
            project: Project
            documents?: ProjectDocument[]
            updates?: ProjectUpdate[]
            accessRole?: ProjectAccessRole
          }>(`/api/projects/${id}`),
          apiFetch<{ sections: ProjectSection[] }>(`/api/projects/${id}/sections`),
          apiFetch<{ items: ProjectItem[] }>(`/api/projects/${id}/items`),
          apiFetch<TaskProgress>(`/api/projects/${id}/task-progress`).catch(() => null),
          apiFetch<{ activities: ActivityEntry[] }>(`/api/projects/${id}/activity?limit=15`).catch(() => ({
            activities: [],
          })),
        ])
        setProject(projectData.project)
        setAccessRole(projectData.accessRole || 'OWNER')
        setDocuments(projectData.documents || [])
        setUpdates(projectData.updates || [])
        setSections(sectionsData.sections || [])
        setItems(itemsData.items || [])
        if (progressData) setTaskProgress(progressData)
        setActivities(activityData.activities || [])
      } catch (err: unknown) {
        setError((err as Error).message || 'Erreur chargement projet')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const loadMoreActivities = useCallback(async () => {
    if (activities.length === 0 || loadingMore) return
    setLoadingMore(true)
    try {
      const last = activities[activities.length - 1]
      const data = await apiFetch<{ activities: ActivityEntry[] }>(
        `/api/projects/${id}/activity?limit=15&before=${last.createdAt}`,
      )
      if (data.activities?.length) {
        setActivities((prev) => [...prev, ...data.activities])
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false)
    }
  }, [id, activities, loadingMore])

  const downloadDocument = async (doc: ProjectDocument) => {
    try {
      const { blob, filename } = await apiDownload(`/api/documents/${doc._id}/download`)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename ?? doc.originalName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setError((err as Error).message || 'Telechargement impossible')
    }
  }

  const downloadItem = async (itemId: string, fileName: string) => {
    try {
      const { blob, filename } = await apiDownload(`/api/projects/${id}/items/${itemId}/download`)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename ?? fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setError((err as Error).message || 'Téléchargement impossible')
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'EN_COURS':
        return 'En cours'
      case 'EN_ATTENTE':
        return 'En attente'
      case 'TERMINE':
        return 'Terminé'
      default:
        return status
    }
  }

  const getItemsBySection = (sectionId: string) => {
    return items.filter((item) => {
      const sec = item.section
      if (!sec) return false
      if (typeof sec === 'string') return sec === sectionId
      return sec._id === sectionId
    })
  }

  const getItemsWithoutSection = () => {
    return items.filter((item) => !item.section)
  }

  const getActivityLabel = (action: string) => {
    const labels: Record<string, string> = {
      STATUS_CHANGED: 'Statut modifié',
      UPDATE_POSTED: 'Mise à jour publiée',
      DOCUMENT_UPLOADED: 'Document ajouté',
      ITEM_CREATED: 'Élément ajouté',
      TASK_CREATED: 'Tâche créée',
      TASK_MOVED: 'Tâche déplacée',
    }
    return labels[action] || action
  }

  const getActivityIcon = (action: string) => {
    const icons: Record<string, string> = {
      STATUS_CHANGED: '🔄',
      UPDATE_POSTED: '📢',
      DOCUMENT_UPLOADED: '📎',
      ITEM_CREATED: '➕',
      TASK_CREATED: '✅',
      TASK_MOVED: '📋',
    }
    return icons[action] || '📌'
  }

  const formatRelativeTime = (dateStr: string) => {
    const now = new Date()
    const date = new Date(dateStr)
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return "À l'instant"
    if (diffMin < 60) return `Il y a ${diffMin} min`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `Il y a ${diffH}h`
    const diffD = Math.floor(diffH / 24)
    if (diffD < 7) return `Il y a ${diffD}j`
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  const priorityLabels: Record<string, string> = {
    BASSE: 'Basse',
    NORMALE: 'Normale',
    HAUTE: 'Haute',
    URGENTE: 'Urgente',
  }

  const statusTaskLabels: Record<string, string> = {
    A_FAIRE: 'À faire',
    EN_COURS: 'En cours',
    EN_REVIEW: 'En review',
    TERMINE: 'Terminé',
  }

  const statusTaskColors: Record<string, string> = {
    A_FAIRE: 'rgba(255, 255, 255, 0.4)',
    EN_COURS: 'var(--primary-light)',
    EN_REVIEW: '#fbbf24',
    TERMINE: '#4ade80',
  }

  return (
    <div className="portal-container client-project-detail">
      {/* Header avec breadcrumb */}
      <div
        className="client-project-breadcrumb"
        style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
      >
        <Link to="/espace-client" className="client-project-back">
          <svg
            viewBox="0 0 24 24"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            stroke="currentColor"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Mes projets</span>
        </Link>
        <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>/</span>
        <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>
          {project?.name || '...'}
        </span>
      </div>

      {loading && (
        <div className="client-dashboard-loading">
          <div className="client-dashboard-spinner" />
          <p>Chargement du projet…</p>
        </div>
      )}

      {error && (
        <div className="client-dashboard-error">
          <span className="client-dashboard-error-icon">!</span>
          <p>{error}</p>
        </div>
      )}

      {project && (
        <>
          {/* Hero du projet */}
          <div className="client-project-hero">
            <div className="client-project-hero-content">
              <div className="client-project-hero-header">
                <span className="client-project-hero-icon">◈</span>
                <span className={`client-project-hero-badge ${statusClass[project.status] || 'client-status-pending'}`}>
                  {getStatusLabel(project.status)}
                </span>
              </div>
              <h1 className="client-project-hero-title">{project.name}</h1>
              {project.description && <p className="client-project-hero-description">{project.description}</p>}
            </div>
          </div>

          {/* Onglets modernes */}
          <div className="client-project-tabs">
            <button
              className={`client-project-tab ${activeTab === 'content' ? 'active' : ''}`}
              onClick={() => setActiveTab('content')}
            >
              <svg
                viewBox="0 0 24 24"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                stroke="currentColor"
              >
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
              <span>Contenu</span>
            </button>
            <button
              className={`client-project-tab ${activeTab === 'updates' ? 'active' : ''}`}
              onClick={() => setActiveTab('updates')}
            >
              <svg
                viewBox="0 0 24 24"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                stroke="currentColor"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <span>Mises à jour</span>
            </button>
            <button
              className={`client-project-tab ${activeTab === 'progress' ? 'active' : ''}`}
              onClick={() => setActiveTab('progress')}
            >
              <svg
                viewBox="0 0 24 24"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                stroke="currentColor"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>Avancement</span>
            </button>
            <button
              className={`client-project-tab ${activeTab === 'documents' ? 'active' : ''}`}
              onClick={() => setActiveTab('documents')}
            >
              <svg
                viewBox="0 0 24 24"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                stroke="currentColor"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <span>Documents</span>
            </button>
            <button
              className={`client-project-tab ${activeTab === 'messages' ? 'active' : ''}`}
              onClick={() => setActiveTab('messages')}
            >
              <svg
                viewBox="0 0 24 24"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                stroke="currentColor"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Messages</span>
            </button>
            {accessRole === 'OWNER' && (
              <button
                className={`client-project-tab ${activeTab === 'collaborators' ? 'active' : ''}`}
                onClick={() => setActiveTab('collaborators')}
              >
                <svg
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  stroke="currentColor"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>Collaborateurs</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Contenu des onglets */}
      {activeTab === 'content' && (
        <div className="client-project-content">
          {/* Items sans section */}
          {getItemsWithoutSection().length > 0 && (
            <div className="client-project-section">
              <div className="client-project-items">
                {getItemsWithoutSection().map((item) => (
                  <ItemCard key={item._id} item={item} onDownload={downloadItem} />
                ))}
              </div>
            </div>
          )}

          {/* Sections avec leurs items */}
          {sections.map((section) => (
            <div key={section._id} className="client-project-section">
              <div className="client-project-section-header">
                <h2 className="client-project-section-title">{section.title}</h2>
                {section.description && <p className="client-project-section-description">{section.description}</p>}
              </div>
              {getItemsBySection(section._id).length === 0 ? (
                <div className="client-project-empty">
                  <span className="client-project-empty-icon">📭</span>
                  <p>Aucun élément dans cette section</p>
                </div>
              ) : (
                <div className="client-project-items">
                  {getItemsBySection(section._id).map((item) => (
                    <ItemCard key={item._id} item={item} onDownload={downloadItem} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {sections.length === 0 && getItemsWithoutSection().length === 0 && (
            <div className="client-project-empty-state">
              <div className="client-project-empty-state-icon">📁</div>
              <h3>Aucun contenu disponible</h3>
              <p>Le contenu du projet sera ajouté ici par votre équipe.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'updates' && (
        <div className="client-project-content">
          {updates.length === 0 ? (
            <div className="client-project-empty-state">
              <div className="client-project-empty-state-icon">📢</div>
              <h3>Aucune mise à jour</h3>
              <p>Les dernières nouvelles de votre projet apparaîtront ici.</p>
            </div>
          ) : (
            <div className="client-project-updates">
              {updates.map((update) => (
                <div key={update._id} className="client-project-update">
                  <div className="client-project-update-date">
                    {new Date(update.createdAt).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                  <div className="client-project-update-content">
                    <h3 className="client-project-update-title">{update.title}</h3>
                    <p className="client-project-update-description">{update.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'progress' && (
        <div className="client-project-content">
          {/* Project Info */}
          {project && (
            <div className="client-progress-info">
              <h2 className="client-progress-section-title">Informations du projet</h2>
              <div className="client-progress-info-grid">
                {project.priority && (
                  <div className="client-progress-info-item">
                    <span className="client-progress-info-label">Priorité</span>
                    <span className="client-progress-info-value">
                      {priorityLabels[project.priority] || project.priority}
                    </span>
                  </div>
                )}
                {project.startDate && (
                  <div className="client-progress-info-item">
                    <span className="client-progress-info-label">Date de début</span>
                    <span className="client-progress-info-value">
                      {new Date(project.startDate).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
                {project.endDate && (
                  <div className="client-progress-info-item">
                    <span className="client-progress-info-label">Date de fin prévue</span>
                    <span className="client-progress-info-value">
                      {new Date(project.endDate).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
                {project.deliveredAt && (
                  <div className="client-progress-info-item">
                    <span className="client-progress-info-label">Livré le</span>
                    <span className="client-progress-info-value">
                      {new Date(project.deliveredAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
              </div>
              {project.deadlines && project.deadlines.length > 0 && (
                <div className="client-progress-deadlines">
                  <h3 className="client-progress-deadlines-title">Échéances</h3>
                  {project.deadlines.map((d, i) => (
                    <div key={i} className="client-progress-deadline">
                      <span className="client-progress-deadline-label">{d.label}</span>
                      <span className="client-progress-deadline-date">
                        {new Date(d.dueAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Task Progress */}
          {taskProgress && taskProgress.total > 0 ? (
            <div className="client-progress-tasks">
              <h2 className="client-progress-section-title">Avancement des tâches</h2>
              <div className="client-progress-bar-container">
                <div className="client-progress-bar-header">
                  <span className="client-progress-bar-label">{taskProgress.percent}% complété</span>
                  <span className="client-progress-bar-count">
                    {taskProgress.byStatus.TERMINE}/{taskProgress.total} tâches
                  </span>
                </div>
                <div className="client-progress-bar">
                  <div className="client-progress-bar-fill" style={{ width: `${taskProgress.percent}%` }} />
                </div>
              </div>
              <div className="client-progress-status-grid">
                {(['A_FAIRE', 'EN_COURS', 'EN_REVIEW', 'TERMINE'] as const).map((status) => (
                  <div key={status} className="client-progress-status-item">
                    <div className="client-progress-status-dot" style={{ background: statusTaskColors[status] }} />
                    <span className="client-progress-status-label">{statusTaskLabels[status]}</span>
                    <span className="client-progress-status-count">{taskProgress.byStatus[status]}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="client-project-empty-state">
              <div className="client-project-empty-state-icon">📊</div>
              <h3>Pas de tâches pour le moment</h3>
              <p>Les tâches du projet apparaîtront ici avec leur avancement.</p>
            </div>
          )}

          {/* Activity Feed */}
          {activities.length > 0 && (
            <div className="client-progress-activity">
              <h2 className="client-progress-section-title">Activité récente</h2>
              <div className="client-activity-list">
                {activities.map((a) => (
                  <div key={a._id} className="client-activity-item">
                    <span className="client-activity-icon">{getActivityIcon(a.action)}</span>
                    <div className="client-activity-content">
                      <span className="client-activity-label">{getActivityLabel(a.action)}</span>
                      {a.summary && <span className="client-activity-summary">{a.summary}</span>}
                    </div>
                    <div className="client-activity-meta">
                      {a.actor?.name && <span className="client-activity-actor">{a.actor.name}</span>}
                      <span className="client-activity-time">{formatRelativeTime(a.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
              {activities.length >= 15 && (
                <button className="client-activity-load-more" onClick={loadMoreActivities} disabled={loadingMore}>
                  {loadingMore ? 'Chargement...' : 'Charger plus'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="client-project-content">
          {documents.length === 0 ? (
            <div className="client-project-empty-state">
              <div className="client-project-empty-state-icon">📄</div>
              <h3>Aucun document</h3>
              <p>Les documents liés à votre projet seront disponibles ici.</p>
            </div>
          ) : (
            <div className="client-project-documents">
              {documents.map((doc) => (
                <div key={doc._id} className="client-project-document">
                  <div className="client-project-document-icon">
                    <svg
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  </div>
                  <div className="client-project-document-info">
                    <h3 className="client-project-document-name">{doc.originalName}</h3>
                    <span className="client-project-document-type">{doc.type}</span>
                  </div>
                  <button
                    className="client-project-document-button"
                    type="button"
                    onClick={() => downloadDocument(doc)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Télécharger
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'messages' && id && (
        <div className="client-project-content">
          <ClientProjectChat projectId={id} canComment={accessRole !== 'VIEWER'} />
        </div>
      )}

      {activeTab === 'collaborators' && id && accessRole === 'OWNER' && (
        <div className="client-project-content">
          <ProjectCollaborators projectId={id} canManage={accessRole === 'OWNER'} />
          <ProjectInvitations projectId={id} canManage={accessRole === 'OWNER'} />
        </div>
      )}
    </div>
  )
}

export default ClientProjectDetail
