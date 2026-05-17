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
  const [myInternalProjects, setMyInternalProjects] = useState<{ _id: string; name: string; entity: string; status: string; poles: string[] }[]>([])
  const [myMissions, setMyMissions] = useState<{ _id: string; title: string; description: string; status: string; dueDate: string | null; steps: { _id: string; title: string; done: boolean }[]; internalProject: { _id: string; name: string; entity: string } }[]>([])

  const canManageAdmins = hasPermission(user, PERMISSIONS.MANAGE_ADMINS)
  const canManageClients = hasPermission(user, PERMISSIONS.MANAGE_CLIENTS)
  const canViewProjects = hasPermission(user, PERMISSIONS.VIEW_PROJECTS)
  const canEditProjects = hasPermission(user, PERMISSIONS.EDIT_PROJECTS)
  const canViewCrm = hasPermission(user, PERMISSIONS.VIEW_CRM)
  const canViewMessaging = hasPermission(user, PERMISSIONS.VIEW_MESSAGING)
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
    // Load internal projects assigned to current user (fire-and-forget, doesn't block dashboard)
    apiFetch<{ projects: { _id: string; name: string; entity: string; status: string; poles: string[]; members: { _id: string }[] }[] }>('/api/admin/internal-projects')
      .then(d => {
        const userId = (user as any)?._id || (user as any)?.id || ''
        const mine = (d.projects || []).filter(p =>
          p.members?.some(m => m._id === userId || m === userId)
        )
        setMyInternalProjects(mine)
      })
      .catch(() => {})
    apiFetch<{ missions: typeof myMissions }>('/api/admin/internal-projects/missions')
      .then(d => setMyMissions(d.missions || []))
      .catch(() => {})
  }, [isSuperAdmin, user])

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
        <div className="admin-page-header">
          <div>
            <h1>Tableau de bord</h1>
            <p className="admin-page-subtitle">Vue d'ensemble de votre activité Venio.</p>
          </div>
          <div className="admin-quick-actions">
            {canEditProjects && (
              <Link className="portal-button secondary" to="/admin/projets/nouveau">
                ✚ Nouveau projet
              </Link>
            )}
            {canManageClients && (
              <Link className="portal-button" to="/admin/comptes-clients/nouveau">
                ✚ Nouveau client
              </Link>
            )}
            {canViewMessaging && (
              <Link className="portal-button" to="/admin/messages">
                Messages
              </Link>
            )}
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
                      {data.overdueTasks.slice(0, 3).map((task) => {
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
                    {data.overdueTasks.length > 3 && (
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

          {/* My Missions */}
          {myMissions.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h2 className="dash-section-title">Mes missions</h2>
              <div className="dash-task-list">
                {myMissions.filter(m => m.status !== 'TERMINE').slice(0, 5).map(m => {
                  const mColors: Record<string, string> = { A_FAIRE: '#fde047', EN_COURS: '#38bdf8', TERMINE: '#6ee7b7' }
                  const mLabels: Record<string, string> = { A_FAIRE: 'À faire', EN_COURS: 'En cours', TERMINE: 'Terminée' }
                  const isOverdue = m.dueDate && new Date(m.dueDate) < new Date()
                  return (
                    <a key={m._id} href="/admin/gestion?view=missions" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}
                      className="dash-task-item">
                      <span className="dash-task-priority" style={{ background: mColors[m.status] || '#a5b4cf' }} />
                      <div className="dash-task-info">
                        <span className="dash-task-title">{m.title}</span>
                        <span className="dash-task-project">{m.internalProject?.name} — {m.internalProject?.entity}</span>
                      </div>
                      <span className="admin-badge" style={{ color: mColors[m.status], borderColor: 'rgba(255,255,255,0.1)' }}>{mLabels[m.status]}</span>
                      {m.dueDate && (
                        <span className={`dash-task-due ${isOverdue ? 'overdue' : ''}`}>
                          {new Date(m.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                      {m.steps?.length > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {m.steps.filter(s => s.done).length}/{m.steps.length} étapes
                        </span>
                      )}
                    </a>
                  )
                })}
              </div>
              <div style={{ marginTop: 8, textAlign: 'right' }}>
                <a href="/admin/gestion?view=missions" style={{ color: '#0ea5e9', fontSize: 13, textDecoration: 'none' }}>
                  Voir toutes ({myMissions.length}) →
                </a>
              </div>
            </div>
          )}

          {/* My Internal Projects */}
          {myInternalProjects.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h2 className="dash-section-title">Mes projets internes</h2>
              <div className="dash-task-list">
                {myInternalProjects.slice(0, 5).map(p => (
                  <Link
                    key={p._id}
                    to={`/admin/projets-internes/${p._id}`}
                    className="dash-task-item"
                    style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}
                  >
                    <span className="dash-task-priority" style={{ background: p.status === 'EN_COURS' ? '#10b981' : p.status === 'EN_ATTENTE' ? '#eab308' : '#64748b' }} />
                    <div className="dash-task-info">
                      <span className="dash-task-title">{p.name}</span>
                      <span className="dash-task-project">{p.entity}{p.poles.length > 0 ? ` — ${p.poles.join(', ')}` : ''}</span>
                    </div>
                    <span className="admin-badge">{p.status === 'EN_COURS' ? 'En cours' : p.status === 'EN_ATTENTE' ? 'En attente' : p.status === 'TERMINE' ? 'Terminé' : 'Archivé'}</span>
                  </Link>
                ))}
              </div>
              {myInternalProjects.length > 5 && (
                <div style={{ marginTop: 8, textAlign: 'right' }}>
                  <Link to="/admin/projets-internes" style={{ color: '#0ea5e9', fontSize: 13, textDecoration: 'none' }}>
                    Voir tous ({myInternalProjects.length}) →
                  </Link>
                </div>
              )}
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
                <Link to="/admin/comptabilite" className="admin-widget">
                  <div className="admin-widget-label">Comptabilité</div>
                  <div className="admin-widget-value" style={{ fontSize: '20px' }}>Tableau de bord</div>
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
                        {allProjects.filter(p => !p.isArchived).slice(0, 3).map((project) => (
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
                  {allProjects.filter(p => !p.isArchived).length > 3 && (
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
