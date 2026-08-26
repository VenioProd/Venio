import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { SkeletonStat, SkeletonGrid } from '../../components/Skeleton'
import type { Project } from '../../types/project.types'
import { listClientActionItems } from '../../services/clientVault'
import type { ClientActionItem } from '../../types/clientVault.types'
import './ClientPortal.css'

interface TaskProgressMap {
  [projectId: string]: { total: number; done: number; percent: number }
}

const ACTION_ITEM_STYLE: Record<string, { icon: string; className: string }> = {
  DEVIS_A_SIGNER: { icon: '✍️', className: 'client-action-item-primary' },
  FACTURE_A_PAYER: { icon: '💳', className: 'client-action-item-alert' },
}

function formatDueDate(dueAt: string | null): { label: string; overdue: boolean } | null {
  if (!dueAt) return null
  const date = new Date(dueAt)
  const overdue = date.getTime() < Date.now()
  return { label: `avant le ${date.toLocaleDateString('fr-FR')}`, overdue }
}

const statusLabels: Record<string, string> = {
  EN_COURS: 'En cours',
  TERMINE: 'Terminé',
  EN_ATTENTE: 'En attente',
  ANNULE: 'Annulé',
}

const statusClass: Record<string, string> = {
  EN_COURS: 'client-status-active',
  TERMINE: 'client-status-done',
  EN_ATTENTE: 'client-status-pending',
  ANNULE: 'client-status-cancelled',
}

const ClientDashboard = () => {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')
  const [taskProgress, setTaskProgress] = useState<TaskProgressMap>({})
  const [actionItems, setActionItems] = useState<ClientActionItem[]>([])
  const [search, setSearch] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [sortBy, setSortBy] = useState<string>('recent')

  useEffect(() => {
    const load = async () => {
      try {
        const [projectsData, progressData, actionItemsData] = await Promise.all([
          apiFetch<{ projects: Project[] }>('/api/projects'),
          apiFetch<{ progress: TaskProgressMap }>('/api/projects/task-progress-all').catch(() => ({ progress: {} })),
          listClientActionItems().catch(() => ({ items: [] })),
        ])
        setProjects(projectsData.projects || [])
        setTaskProgress(progressData.progress || {})
        setActionItems(actionItemsData.items || [])
      } catch (err: unknown) {
        setError((err as Error).message || 'Erreur chargement projets')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const activeProjects = projects.filter((p) => p.status === 'EN_COURS')
  const completedProjects = projects.filter((p) => p.status === 'TERMINE')
  const pendingProjects = projects.filter((p) => p.status === 'EN_ATTENTE')

  const filteredProjects = useMemo(() => {
    let result = [...projects]
    if (statusFilter !== 'ALL') {
      result = result.filter((p) => p.status === statusFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          (p.summary || '').toLowerCase().includes(q),
      )
    }
    if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === 'status') {
      const order: Record<string, number> = { EN_COURS: 0, EN_ATTENTE: 1, TERMINE: 2, ANNULE: 3 }
      result.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))
    }
    return result
  }, [projects, statusFilter, search, sortBy])

  return (
    <div className="portal-container client-dashboard">
      <section className="client-dashboard-hero">
        <div className="client-dashboard-hero-content">
          <h1 className="client-dashboard-title">Bonjour, {user?.name?.split(' ')[0] || 'vous'} 👋</h1>
          <p className="client-dashboard-subtitle">Retrouvez ici vos projets et les documents associés.</p>
        </div>
        <div className="client-dashboard-hero-decoration">
          <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <path
              fill="currentColor"
              d="M45.3,-58.8C57.5,-48.2,65.4,-32.7,68.9,-16.3C72.4,0.1,71.5,17.4,64.3,31.8C57.1,46.2,43.6,57.7,28.3,63.8C13,69.9,-4.1,70.6,-20.3,66.3C-36.5,62,-51.8,52.7,-61.3,39.3C-70.8,25.9,-74.5,8.4,-72.3,-8.2C-70.1,-24.8,-62,-40.5,-49.8,-51.1C-37.6,-61.7,-21.2,-67.2,-3.8,-62.5C13.6,-57.8,33.1,-69.4,45.3,-58.8Z"
              transform="translate(100 100)"
            />
          </svg>
        </div>
      </section>

      {!loading && !error && actionItems.length > 0 && (
        <section className="client-dashboard-todo" style={{ padding: '0 24px', marginBottom: 24 }}>
          <h2 className="client-dashboard-section-title">
            À faire — {actionItems.length} action{actionItems.length > 1 ? 's' : ''} attendue
            {actionItems.length > 1 ? 's' : ''} de votre part
          </h2>
          <div className="portal-list" style={{ marginTop: 12 }}>
            {actionItems.map((item, index) => {
              const style = ACTION_ITEM_STYLE[item.type] || { icon: '📌', className: 'client-action-item-neutral' }
              const due = formatDueDate(item.dueAt)
              return (
                <div
                  key={`${item.type}-${index}`}
                  className={`portal-card ${style.className}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span aria-hidden style={{ fontSize: 20 }}>
                      {style.icon}
                    </span>
                    <div>
                      <h3 style={{ margin: 0 }}>{item.title}</h3>
                      {item.detail && (
                        <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>{item.detail}</p>
                      )}
                      {due && (
                        <p
                          style={{
                            margin: '4px 0 0',
                            fontSize: 13,
                            color: due.overdue ? '#f87171' : 'var(--text-secondary)',
                          }}
                        >
                          {due.label}
                        </p>
                      )}
                    </div>
                  </div>
                  <Link className="portal-button" to={item.link}>
                    Voir
                  </Link>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {loading && (
        <div style={{ padding: '0 24px' }}>
          <div className="client-dashboard-stats">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonStat key={i} />
            ))}
          </div>
          <div style={{ marginTop: 32 }}>
            <SkeletonGrid count={3} className="client-dashboard-grid" />
          </div>
        </div>
      )}

      {error && (
        <div className="client-dashboard-error">
          <span className="client-dashboard-error-icon">!</span>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="client-dashboard-stats">
            <div className="client-dashboard-stat">
              <div className="client-dashboard-stat-icon">
                <svg
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  stroke="currentColor"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="client-dashboard-stat-content">
                <span className="client-dashboard-stat-value">{projects.length}</span>
                <span className="client-dashboard-stat-label">
                  {projects.length <= 1 ? 'projet total' : 'projets totaux'}
                </span>
              </div>
            </div>
            <div className="client-dashboard-stat">
              <div className="client-dashboard-stat-icon active">
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
              </div>
              <div className="client-dashboard-stat-content">
                <span className="client-dashboard-stat-value">{activeProjects.length}</span>
                <span className="client-dashboard-stat-label">en cours</span>
              </div>
            </div>
            <div className="client-dashboard-stat">
              <div className="client-dashboard-stat-icon done">
                <svg
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  stroke="currentColor"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="client-dashboard-stat-content">
                <span className="client-dashboard-stat-value">{completedProjects.length}</span>
                <span className="client-dashboard-stat-label">terminés</span>
              </div>
            </div>
            <div className="client-dashboard-stat">
              <div className="client-dashboard-stat-icon pending">
                <svg
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  stroke="currentColor"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="client-dashboard-stat-content">
                <span className="client-dashboard-stat-value">{pendingProjects.length}</span>
                <span className="client-dashboard-stat-label">en attente</span>
              </div>
            </div>
          </div>

          <section className="client-dashboard-projects">
            <div className="client-dashboard-section-header">
              <h2 className="client-dashboard-section-title">Mes projets</h2>
              <p className="client-dashboard-section-subtitle">Suivez l'avancement de vos projets en temps réel</p>
            </div>

            {projects.length > 0 && (
              <div
                className="client-dashboard-filters"
                style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}
              >
                <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '200px' }}>
                  <svg
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '16px',
                      height: '16px',
                      stroke: 'var(--text-secondary)',
                      fill: 'none',
                      strokeWidth: 2,
                      strokeLinecap: 'round',
                      strokeLinejoin: 'round',
                    }}
                    viewBox="0 0 24 24"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    className="portal-input"
                    type="text"
                    placeholder="Rechercher un projet..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ paddingLeft: '36px' }}
                  />
                </div>
                <select
                  className="portal-input"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ flex: '0 0 auto', width: 'auto', minWidth: '140px' }}
                >
                  <option value="ALL">Tous les statuts</option>
                  <option value="EN_COURS">En cours</option>
                  <option value="EN_ATTENTE">En attente</option>
                  <option value="TERMINE">Terminé</option>
                  <option value="ANNULE">Annulé</option>
                </select>
                <select
                  className="portal-input"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{ flex: '0 0 auto', width: 'auto', minWidth: '140px' }}
                >
                  <option value="recent">Plus récents</option>
                  <option value="name">Nom A-Z</option>
                  <option value="status">Par statut</option>
                </select>
              </div>
            )}

            {projects.length === 0 ? (
              <div className="client-dashboard-empty">
                <div className="client-dashboard-empty-icon">📁</div>
                <h3>Aucun projet pour le moment</h3>
                <p>Vos projets apparaîtront ici dès qu'ils seront partagés avec vous.</p>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="client-dashboard-empty">
                <div className="client-dashboard-empty-icon">🔍</div>
                <h3>Aucun résultat</h3>
                <p>Aucun projet ne correspond à vos critères de recherche.</p>
              </div>
            ) : (
              <div className="client-dashboard-grid">
                {filteredProjects.map((project) => (
                  <div key={project._id} className="client-project-card-wrapper">
                    <Link to={`/espace-client/projets/${project._id}`} className="client-project-card">
                      <div className="client-project-card-header">
                        <span className="client-project-card-icon">◈</span>
                        <span
                          className={`client-project-card-badge ${statusClass[project.status] || 'client-status-pending'}`}
                        >
                          {statusLabels[project.status] || project.status}
                        </span>
                      </div>
                      <h3 className="client-project-card-title">{project.name}</h3>
                      {project.summary && <p className="client-project-card-summary">{project.summary}</p>}
                      <p className="client-project-card-desc">{project.description || 'Aucune description'}</p>
                      {project.serviceTypes && project.serviceTypes.length > 0 && (
                        <div className="client-project-card-tags">
                          {project.serviceTypes.slice(0, 3).map((service, idx) => (
                            <span key={idx} className="client-project-card-tag">
                              {service}
                            </span>
                          ))}
                          {project.serviceTypes.length > 3 && (
                            <span className="client-project-card-tag-more">+{project.serviceTypes.length - 3}</span>
                          )}
                        </div>
                      )}
                      {taskProgress[project._id] && taskProgress[project._id].total > 0 && (
                        <div className="client-project-card-progress">
                          <div className="client-project-card-progress-header">
                            <span className="client-project-card-progress-label">Avancement</span>
                            <span className="client-project-card-progress-value">
                              {taskProgress[project._id].percent}%
                            </span>
                          </div>
                          <div className="client-project-card-progress-bar">
                            <div
                              className="client-project-card-progress-fill"
                              style={{ width: `${taskProgress[project._id].percent}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <div className="client-project-card-footer">
                        <span className="client-project-card-cta">
                          Voir le détail
                          <span className="client-project-card-cta-arrow">→</span>
                        </span>
                      </div>
                    </Link>
                    {/* Hors de la carte : imbriquer une ancre dans une autre est invalide. */}
                    <Link
                      to={`/espace-client/projets/${project._id}/facturation`}
                      className="client-project-card-billing-link"
                    >
                      Devis et factures
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default ClientDashboard
