import React, { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../lib/permissions'
import { SkeletonRow } from '../../components/Skeleton'
import type { User } from '../../types/auth.types'
import type { Project } from '../../types/project.types'
import type { Task } from '../../types/task.types'
import type { CrmAlerts } from '../../types/crm.types'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

interface HotLead {
  _id: string
  company: string
  contactName: string
  status: string
  leadTemperature: string
  budget: number | null
}

interface DashBrief {
  _id: string
  intitule: string
  briefPriority: 'P1' | 'P2' | 'P3'
  statut: string
  deadline: string
  entity: string
  contexte?: string
  livrablesAttendus?: string
  project?: { _id: string; name: string }
}

interface DashboardData {
  myTasks: (Task & { project?: { _id: string; name: string } })[]
  myBriefs: DashBrief[]
  overdueTasks: (Task & { project?: { _id: string; name: string } })[]
  tasksByStatus: Record<string, number>
  activeProjectCount: number
  totalRevenue: number
  hotLeads: HotLead[]
  recentProjects: (Project & { client?: { _id: string; name: string } })[]
}

const PRIORITY_COLORS: Record<string, string> = {
  BASSE: '#64748b',
  NORMALE: '#0ea5e9',
  HAUTE: '#f59e0b',
  URGENTE: '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  A_FAIRE: 'A faire',
  EN_COURS: 'En cours',
  EN_REVIEW: 'En review',
  TERMINE: 'Termine',
}

const BRIEF_STATUS_LABELS: Record<string, string> = {
  A_FAIRE: 'A faire',
  EN_COURS: 'En cours',
  EN_REVIEW: 'En review',
  VALIDE: 'Valide',
  LIVRE: 'Livre',
}

const BRIEF_PRIORITY_COLORS: Record<string, string> = {
  P1: '#ef4444',
  P2: '#f59e0b',
  P3: '#64748b',
}

const PROJECT_STATUS_LABELS: Record<string, string> = {
  EN_COURS: 'En cours',
  EN_ATTENTE: 'En attente',
  TERMINE: 'Termine',
}

const AdminDashboard = () => {
  const { logout, user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [clientCount, setClientCount] = useState(0)
  const [adminCount, setAdminCount] = useState(0)
  const [crmLeadCount, setCrmLeadCount] = useState(0)
  const [crmAlerts, setCrmAlerts] = useState<CrmAlerts>({ coldLeads: [], overdueLeads: [], staleLeads: [] })
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null)
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [expandedOverdue, setExpandedOverdue] = useState<string | null>(null)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)

  const canManageAdmins = hasPermission(user, PERMISSIONS.MANAGE_ADMINS)
  const canManageClients = hasPermission(user, PERMISSIONS.MANAGE_CLIENTS)
  const canViewProjects = hasPermission(user, PERMISSIONS.VIEW_PROJECTS)
  const canEditProjects = hasPermission(user, PERMISSIONS.EDIT_PROJECTS)
  const canViewCrm = hasPermission(user, PERMISSIONS.VIEW_CRM)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const promises: Promise<unknown>[] = [
          apiFetch<DashboardData>('/api/admin/dashboard'),
        ]

        if (isSuperAdmin) {
          promises.push(
            apiFetch<{ users?: User[] }>('/api/admin/users?role=CLIENT'),
            apiFetch<{ users?: User[] }>('/api/admin/admins'),
            apiFetch<{ leads?: unknown[] }>('/api/admin/crm/leads').catch(() => ({ leads: [] })),
            apiFetch<CrmAlerts>('/api/admin/crm/alerts').catch(() => ({ coldLeads: [], overdueLeads: [], staleLeads: [] })),
            apiFetch<{ projects?: Project[] }>('/api/admin/projects?archived=all&includeClient=true'),
          )
        }

        const results = await Promise.all(promises)
        setData(results[0] as DashboardData)

        if (isSuperAdmin) {
          const clientsRes = results[1] as { users?: User[] }
          const adminsRes = results[2] as { users?: User[] }
          const leadsRes = results[3] as { leads?: unknown[] }
          const alertsRes = results[4] as CrmAlerts
          const projectsRes = results[5] as { projects?: Project[] }
          setClientCount(clientsRes.users?.length || 0)
          setAdminCount(adminsRes.users?.length || 0)
          setCrmLeadCount(leadsRes.leads?.length || 0)
          setCrmAlerts(alertsRes || { coldLeads: [], overdueLeads: [], staleLeads: [] })
          setAllProjects(projectsRes.projects || [])
        }
      } catch {
        // Silent for dashboard
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [isSuperAdmin])

  const projectStats = useMemo(() => {
    const active = allProjects.filter((p) => !p.isArchived)
    const byStatus = active.reduce(
      (acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
    return { byStatus, archived: allProjects.filter((p) => p.isArchived).length }
  }, [allProjects])

  const formatDate = (d: string | null | undefined) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  }

  return (
    <div className="portal-container">
        <div className="admin-header">
          <h1>Tableau de bord</h1>
          <div className="admin-actions portal-actions-reveal">
            {canManageClients && (
              <Link className="portal-button portal-action-link" to="/admin/comptes-clients" title="Comptes clients">
                <span className="portal-action-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                </span>
                <span className="portal-action-label">Clients</span>
              </Link>
            )}
            {canManageAdmins && (
              <Link className="portal-button portal-action-link" to="/admin/comptes-admin" title="Comptes admin">
                <span className="portal-action-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                </span>
                <span className="portal-action-label">Admin</span>
              </Link>
            )}
            {canEditProjects && (
              <Link className="portal-button secondary portal-action-link" to="/admin/projets/nouveau" title="Nouveau projet">
                <span className="portal-action-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                </span>
                <span className="portal-action-label">Nouveau projet</span>
              </Link>
            )}
            {canViewCrm && (
              <Link className="portal-button portal-action-link" to="/admin/crm" title="CRM">
                <span className="portal-action-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
                </span>
                <span className="portal-action-label">CRM</span>
              </Link>
            )}
            {(user?.role === 'SUPER_ADMIN' || user?.role === 'RH') && (
              <Link className="portal-button portal-action-link" to="/admin/qualiopi" title="Qualiopi">
                <span className="portal-action-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                </span>
                <span className="portal-action-label">Qualiopi</span>
              </Link>
            )}
            {hasPermission(user as User, PERMISSIONS.VIEW_PROJECTS) && (
            <Link className="portal-button portal-action-link" to="/admin/gestion" title="Gestion de projets">
              <span className="portal-action-icon" aria-hidden>
                <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
              </span>
              <span className="portal-action-label">Gestion</span>
            </Link>
            )}
            {user?.role === 'SUPER_ADMIN' && (
            <Link className="portal-button portal-action-link" to="/admin/tickets" title="Tickets">
              <span className="portal-action-icon" aria-hidden>
                <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              </span>
              <span className="portal-action-label">Tickets</span>
            </Link>
            )}
            <Link className="portal-button portal-action-link" to="/admin/acces-outils" title="Acces outils">
              <span className="portal-action-icon" aria-hidden>
                <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              </span>
              <span className="portal-action-label">Outils</span>
            </Link>
            <Link className="portal-button secondary portal-action-link" to="/admin/guide" title="Guide d'utilisation">
              <span className="portal-action-icon" aria-hidden>
                <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              </span>
              <span className="portal-action-label">Guide</span>
            </Link>
            <Link className="portal-profile-btn" to="/admin/profil" title="Mon profil">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            </Link>
            <button className="portal-logout-btn" onClick={logout} type="button" title="Se deconnecter">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            </button>
          </div>
        </div>

      {loading ? (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : data && (
        <>
          {/* KPI Cards */}
          <div className="admin-stats-grid" style={{ marginTop: 24 }}>
            {canViewProjects && (
              <div className="admin-stat-card">
                <div className="admin-stat-label">Projets actifs</div>
                <div className="admin-stat-value">{data.activeProjectCount}</div>
              </div>
            )}
            <div className="admin-stat-card">
              <div className="admin-stat-label">Mes taches</div>
              <div className="admin-stat-value">{data.myTasks.length}</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Mes briefs</div>
              <div className="admin-stat-value">{data.myBriefs.length}</div>
            </div>
            <div className="admin-stat-card" style={data.overdueTasks.length > 0 ? { borderColor: '#ef4444', boxShadow: '0 0 20px rgba(239,68,68,0.2), inset 0 0 30px rgba(239,68,68,0.05)' } : {}}>
              <div className="admin-stat-label" style={data.overdueTasks.length > 0 ? { color: '#fca5a5' } : {}}>Taches en retard</div>
              <div className="admin-stat-value" style={data.overdueTasks.length > 0 ? { color: '#ef4444', textShadow: '0 0 20px rgba(239,68,68,0.5)' } : {}}>
                {data.overdueTasks.length}
              </div>
            </div>
            {isSuperAdmin && (
              <div className="admin-stat-card">
                <div className="admin-stat-label">CA facture</div>
                <div className="admin-stat-value">{data.totalRevenue.toLocaleString('fr-FR')} EUR</div>
              </div>
            )}
          </div>

          {/* Two columns: My Tasks + Hot Leads */}
          <div className="dash-two-cols" style={{ marginTop: 24 }}>
            {/* My Tasks */}
            <div className="dash-col">
                <h2 className="dash-section-title">Mes taches</h2>
                {data.myTasks.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucune tache assignee</p>
                ) : (
                  <div className="dash-task-list">
                    {data.myTasks.map((task) => {
                      const isExp = expandedTask === task._id
                      return (
                        <div key={task._id}>
                          <div
                            className="dash-task-item"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setExpandedTask(isExp ? null : task._id)}
                          >
                            <span
                              className="dash-task-priority"
                              style={{ background: PRIORITY_COLORS[task.priority] || '#0ea5e9' }}
                            />
                            <div className="dash-task-info">
                              <span className="dash-task-title">{task.title}</span>
                              <span className="dash-task-project">{(task.project as { name?: string })?.name || ''}</span>
                            </div>
                            <span className="dash-task-status">{STATUS_LABELS[task.status] || task.status}</span>
                            {task.dueDate && (
                              <span className={`dash-task-due ${new Date(task.dueDate) < new Date() ? 'overdue' : ''}`}>
                                {formatDate(task.dueDate)}
                              </span>
                            )}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                              style={{ transform: isExp ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.4, flexShrink: 0 }}>
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </div>
                          {isExp && (
                            <div className="dash-brief-details">
                              {task.description && (
                                <div className="dash-brief-field">
                                  <span className="dash-brief-label">Description</span>
                                  <p>{task.description}</p>
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)' }}>
                                <span>Priorite : <strong style={{ color: PRIORITY_COLORS[task.priority] }}>{task.priority}</strong></span>
                                <span>Statut : <strong>{STATUS_LABELS[task.status] || task.status}</strong></span>
                                {task.dueDate && <span>Echeance : <strong>{new Date(task.dueDate).toLocaleDateString('fr-FR')}</strong></span>}
                                {task.tags && task.tags.length > 0 && <span>Tags : {task.tags.join(', ')}</span>}
                              </div>
                              {canViewProjects && (
                                <div style={{ marginTop: 8 }}>
                                  <Link
                                    to={`/admin/projets/${task.project?._id || task.project}?tab=tasks`}
                                    style={{ color: '#0ea5e9', fontSize: 13, textDecoration: 'none' }}
                                  >
                                    Voir le projet →
                                  </Link>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
            </div>

            {/* Hot Leads + Overdue Tasks */}
            <div className="dash-col">
                {data.hotLeads.length > 0 && (
                  <>
                    <h2 className="dash-section-title">Leads chauds</h2>
                    <div className="dash-task-list">
                      {data.hotLeads.map((lead) => (
                        <Link key={lead._id} to="/admin/crm" className="dash-task-item">
                          <span
                            className="dash-task-priority"
                            style={{ background: lead.leadTemperature === 'TRES_CHAUD' ? '#ef4444' : '#f97316' }}
                          />
                          <div className="dash-task-info">
                            <span className="dash-task-title">{lead.company}</span>
                            <span className="dash-task-project">{lead.contactName}</span>
                          </div>
                          {lead.budget && (
                            <span className="dash-task-status">{lead.budget.toLocaleString('fr-FR')} EUR</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  </>
                )}

                {data.overdueTasks.length > 0 && (
                  <>
                    <h2 className="dash-section-title" style={data.hotLeads.length > 0 ? { marginTop: 20 } : {}}>Taches en retard</h2>
                    <div className="dash-task-list">
                      {data.overdueTasks.slice(0, 5).map((task) => {
                        const isExp = expandedOverdue === task._id
                        return (
                          <div key={task._id}>
                            <div
                              className="dash-task-item"
                              style={{ cursor: 'pointer' }}
                              onClick={() => setExpandedOverdue(isExp ? null : task._id)}
                            >
                              <span className="dash-task-priority" style={{ background: '#ef4444' }} />
                              <div className="dash-task-info">
                                <span className="dash-task-title">{task.title}</span>
                                <span className="dash-task-project">{(task.project as { name?: string })?.name || ''}</span>
                              </div>
                              <span className="dash-task-due overdue">{formatDate(task.dueDate)}</span>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                style={{ transform: isExp ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.4, flexShrink: 0 }}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </div>
                            {isExp && (
                              <div className="dash-brief-details">
                                {task.description && (
                                  <div className="dash-brief-field">
                                    <span className="dash-brief-label">Description</span>
                                    <p>{task.description}</p>
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)' }}>
                                  <span>Priorite : <strong style={{ color: PRIORITY_COLORS[task.priority] }}>{task.priority}</strong></span>
                                  <span>Statut : <strong>{STATUS_LABELS[task.status] || task.status}</strong></span>
                                  {task.dueDate && <span>Echeance : <strong style={{ color: '#ef4444' }}>{new Date(task.dueDate).toLocaleDateString('fr-FR')}</strong></span>}
                                </div>
                                {canViewProjects && (
                                  <div style={{ marginTop: 8 }}>
                                    <Link
                                      to={`/admin/projets/${task.project?._id || task.project}?tab=tasks`}
                                      style={{ color: '#0ea5e9', fontSize: 13, textDecoration: 'none' }}
                                    >
                                      Voir le projet →
                                    </Link>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {data.overdueTasks.length > 5 && (
                      <div style={{ marginTop: 8, textAlign: 'right' }}>
                        <Link to="/admin/gestion" style={{ color: '#ef4444', fontSize: 13, textDecoration: 'none' }}>
                          Voir toutes ({data.overdueTasks.length}) →
                        </Link>
                      </div>
                    )}
                  </>
                )}

                {data.hotLeads.length === 0 && data.overdueTasks.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Rien a signaler</p>
                )}
            </div>
          </div>

          {/* My Briefs */}
          {data.myBriefs.length > 0 && (
            <div style={{ marginTop: 24 }}>
                <h2 className="dash-section-title">Mes briefs</h2>
                <div className="dash-task-list">
                  {data.myBriefs.map((brief) => {
                    const isExpanded = expandedBrief === brief._id
                    const isOverdue = new Date(brief.deadline) < new Date()
                    return (
                      <div key={brief._id}>
                        <div
                          className="dash-task-item"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setExpandedBrief(isExpanded ? null : brief._id)}
                        >
                          <span
                            className="dash-task-priority"
                            style={{ background: BRIEF_PRIORITY_COLORS[brief.briefPriority] || '#0ea5e9' }}
                          />
                          <div className="dash-task-info">
                            <span className="dash-task-title">{brief.intitule}</span>
                            <span className="dash-task-project">
                              {(brief.project as { name?: string })?.name || ''}
                              {brief.entity !== 'VENIO' ? ` — ${brief.entity}` : ''}
                            </span>
                          </div>
                          <span className="dash-task-status">{BRIEF_STATUS_LABELS[brief.statut] || brief.statut}</span>
                          <span className={`dash-task-due ${isOverdue ? 'overdue' : ''}`}>
                            {formatDate(brief.deadline)}
                          </span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.4, flexShrink: 0 }}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                        {isExpanded && (
                          <div className="dash-brief-details">
                            {brief.contexte && (
                              <div className="dash-brief-field">
                                <span className="dash-brief-label">Contexte</span>
                                <p>{brief.contexte}</p>
                              </div>
                            )}
                            {brief.livrablesAttendus && (
                              <div className="dash-brief-field">
                                <span className="dash-brief-label">Livrables attendus</span>
                                <p>{brief.livrablesAttendus}</p>
                              </div>
                            )}
                            <div style={{ marginTop: 8 }}>
                              <Link
                                to={`/admin/gestion?view=briefs`}
                                style={{ color: '#0ea5e9', fontSize: 13, textDecoration: 'none' }}
                              >
                                Voir tous les briefs →
                              </Link>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
            </div>
          )}

          {/* Recent Projects */}
          {data.recentProjects.length > 0 && (
            <div style={{ marginTop: 24 }}>
                <h2 className="dash-section-title">Projets recents</h2>
                <div className="dash-task-list">
                  {data.recentProjects.map((project) => {
                    const isExp = expandedProject === project._id
                    return (
                      <div key={project._id}>
                        <div
                          className="dash-task-item"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setExpandedProject(isExp ? null : project._id)}
                        >
                          <span
                            className="dash-task-priority"
                            style={{ background: PRIORITY_COLORS[project.priority || 'NORMALE'] || '#0ea5e9' }}
                          />
                          <div className="dash-task-info">
                            <span className="dash-task-title">{project.name}</span>
                            <span className="dash-task-project">{(project.client as { name?: string })?.name || ''}</span>
                          </div>
                          <span className="admin-badge">{PROJECT_STATUS_LABELS[project.status] || project.status}</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            style={{ transform: isExp ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.4, flexShrink: 0 }}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                        {isExp && (
                          <div className="dash-brief-details">
                            {project.description && (
                              <div className="dash-brief-field">
                                <span className="dash-brief-label">Description</span>
                                <p>{project.description}</p>
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)' }}>
                              {(project.assignedTo?.name || project.responsible) && <span>Responsable : <strong>{project.assignedTo?.name || project.responsible}</strong></span>}
                              {project.priority && <span>Priorite : <strong style={{ color: PRIORITY_COLORS[project.priority] }}>{project.priority}</strong></span>}
                              {project.startDate && <span>Debut : <strong>{new Date(project.startDate).toLocaleDateString('fr-FR')}</strong></span>}
                              {project.endDate && <span>Fin : <strong>{new Date(project.endDate).toLocaleDateString('fr-FR')}</strong></span>}
                            </div>
                            {canViewProjects && (
                              <div style={{ marginTop: 8 }}>
                                <Link
                                  to={`/admin/projets/${project._id}`}
                                  style={{ color: '#0ea5e9', fontSize: 13, textDecoration: 'none' }}
                                >
                                  Voir le projet →
                                </Link>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
            </div>
          )}

          {/* Super admin: full overview widgets + table */}
          {isSuperAdmin && (
            <>
              <div className="admin-widgets-grid" style={{ marginTop: 24 }}>
                <Link to="/admin/comptes-clients" className="admin-widget">
                  <div className="admin-widget-label">Clients</div>
                  <div className="admin-widget-value">{clientCount}</div>
                </Link>
                <Link to="/admin/comptes-admin" className="admin-widget">
                  <div className="admin-widget-label">Admins</div>
                  <div className="admin-widget-value">{adminCount}</div>
                </Link>
                <Link to="/admin/crm" className="admin-widget">
                  <div className="admin-widget-label">Leads CRM</div>
                  <div className="admin-widget-value">{crmLeadCount}</div>
                </Link>
                <div className="admin-widget">
                  <div className="admin-widget-label">Taches totales</div>
                  <div className="admin-widget-value">
                    {Object.values(data.tasksByStatus).reduce((a, b) => a + b, 0)}
                  </div>
                </div>
                <div className="admin-widget">
                  <div className="admin-widget-label">Archives</div>
                  <div className="admin-widget-value">{projectStats.archived}</div>
                </div>
                {Object.entries(projectStats.byStatus).map(([status, count]) => (
                  <div key={status} className="admin-widget">
                    <div className="admin-widget-label">{PROJECT_STATUS_LABELS[status] || status}</div>
                    <div className="admin-widget-value">{count}</div>
                  </div>
                ))}
                <Link to="/admin/crm" className="admin-widget admin-widget-alert admin-widget-alert-cold">
                  <div className="admin-widget-label">Leads froids</div>
                  <div className="admin-widget-value">{crmAlerts.coldLeads?.length || 0}</div>
                </Link>
                <Link to="/admin/crm" className="admin-widget admin-widget-alert admin-widget-alert-overdue">
                  <div className="admin-widget-label">Actions CRM en retard</div>
                  <div className="admin-widget-value">{crmAlerts.overdueLeads?.length || 0}</div>
                </Link>
                <Link to="/admin/crm" className="admin-widget admin-widget-alert admin-widget-alert-stale">
                  <div className="admin-widget-label">Leads bloques</div>
                  <div className="admin-widget-value">{crmAlerts.staleLeads?.length || 0}</div>
                </Link>
              </div>

              <div style={{ marginTop: 24 }}>
                  <h2 className="dash-section-title">Etat des projets clients</h2>
                  <div className="admin-table-wrapper">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Projet</th>
                          <th>Statut</th>
                          <th>Budget</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allProjects.filter(p => !p.isArchived).slice(0, 5).map((project) => (
                          <tr key={project._id}>
                            <td>{project.client?.name || '--'}</td>
                            <td>
                              <Link to={`/admin/projets/${project._id}`} style={{ color: '#818cf8', textDecoration: 'none' }}>
                                {project.name}
                              </Link>
                            </td>
                            <td><span className="admin-badge">{PROJECT_STATUS_LABELS[project.status] || project.status}</span></td>
                            <td>
                              {project.budget?.amount != null ? `${Number(project.budget.amount).toLocaleString('fr-FR')} ${project.budget.currency || 'EUR'}` : '--'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {allProjects.filter(p => !p.isArchived).length > 5 && (
                    <div style={{ marginTop: 12, textAlign: 'right' }}>
                      <Link to="/admin/gestion" style={{ color: '#0ea5e9', fontSize: 13, textDecoration: 'none' }}>
                        Voir tous les projets ({allProjects.filter(p => !p.isArchived).length}) →
                      </Link>
                    </div>
                  )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default AdminDashboard
