import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../lib/permissions'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const AdminDashboard = () => {
  const { logout, user } = useAuth()
  const [clientCount, setClientCount] = useState(0)
  const [projectCount, setProjectCount] = useState(0)
  const [allClients, setAllClients] = useState([])
  const [allProjects, setAllProjects] = useState([])
  const [adminCount, setAdminCount] = useState(0)
  const [crmLeadCount, setCrmLeadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const canManageAdmins = hasPermission(user, PERMISSIONS.MANAGE_ADMINS)
  const canManageClients = hasPermission(user, PERMISSIONS.MANAGE_CLIENTS)
  const canViewProjects = hasPermission(user, PERMISSIONS.VIEW_PROJECTS)
  const canEditProjects = hasPermission(user, PERMISSIONS.EDIT_PROJECTS)
  const canViewCrm = hasPermission(user, PERMISSIONS.VIEW_CRM)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        if (canManageClients) {
          const users = await apiFetch('/api/admin/users?role=CLIENT')
          setClientCount(users.users?.length || 0)
        }
        if (canViewProjects) {
          const projects = await apiFetch('/api/admin/projects?archived=false')
          setProjectCount(projects.projects?.length || 0)
        }
        if (isSuperAdmin) {
          const [clientsRes, projectsRes, adminsRes, leadsRes] = await Promise.all([
            apiFetch('/api/admin/users?role=CLIENT'),
            apiFetch('/api/admin/projects?archived=all&includeClient=true'),
            apiFetch('/api/admin/admins'),
            apiFetch('/api/admin/crm/leads').catch(() => ({ leads: [] })),
          ])
          setAllClients(clientsRes.users || [])
          setAllProjects(projectsRes.projects || [])
          setAdminCount(adminsRes.users?.length || 0)
          setCrmLeadCount(leadsRes.leads?.length || 0)
        }
      } catch (err) {
        // Silent for dashboard
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [canManageClients, canViewProjects, isSuperAdmin])

  const stats = React.useMemo(() => {
    const now = new Date()
    const archivedProjects = allProjects.filter((p) => p.isArchived)
    const activeProjects = allProjects.filter((p) => !p.isArchived)
    const byStatus = activeProjects.reduce(
      (acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1
        return acc
      },
      { EN_COURS: 0, EN_ATTENTE: 0, TERMINE: 0 }
    )
    const overdueReminders = activeProjects.filter((p) => p.reminderAt && new Date(p.reminderAt) < now)
    const overdueDeadlines = activeProjects.filter((p) =>
      Array.isArray(p.deadlines) && p.deadlines.some((d) => d.dueAt && new Date(d.dueAt) < now)
    )
    const highPriority = activeProjects.filter((p) => ['HAUTE', 'URGENTE'].includes(p.priority))
    return {
      totalClients: allClients.length,
      totalProjects: allProjects.length,
      activeProjects: activeProjects.length,
      archivedProjects: archivedProjects.length,
      statusCounts: byStatus,
      overdueReminders: overdueReminders.length,
      overdueDeadlines: overdueDeadlines.length,
      highPriority: highPriority.length,
    }
  }, [allClients, allProjects])

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-header">
          <h1>Tableau de bord Admin</h1>
          <div className="admin-actions portal-actions-reveal">
            {canManageClients && (
              <Link className="portal-button portal-action-link" to="/admin/comptes-clients" title="Comptes clients">
                <span className="portal-action-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                </span>
                <span className="portal-action-label">Comptes clients</span>
              </Link>
            )}
            {canManageAdmins && (
              <Link className="portal-button portal-action-link" to="/admin/comptes-admin" title="Comptes admin">
                <span className="portal-action-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                </span>
                <span className="portal-action-label">Comptes admin</span>
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
              <Link className="portal-button portal-action-link" to="/admin/crm" title="CRM & Prospection">
                <span className="portal-action-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
                </span>
                <span className="portal-action-label">CRM & Prospection</span>
              </Link>
            )}
            <button className="portal-button secondary portal-action-link" onClick={logout} type="button" title="Se déconnecter">
              <span className="portal-action-icon" aria-hidden>
                <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              </span>
              <span className="portal-action-label">Se déconnecter</span>
            </button>
          </div>
        </div>
      </div>

      <div className="admin-stats-grid" style={{ marginTop: 24 }}>
        {canManageClients && (
          <Link to="/admin/comptes-clients" style={{ textDecoration: 'none' }}>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Comptes clients</div>
              <div className="admin-stat-value">{clientCount}</div>
            </div>
          </Link>
        )}
        {canViewProjects && (
          <div className="admin-stat-card">
            <div className="admin-stat-label">Projets actifs</div>
            <div className="admin-stat-value">{projectCount}</div>
          </div>
        )}
      </div>

      {isSuperAdmin && (
        <>
          <div className="portal-card" style={{ marginTop: 32 }}>
            <div className="admin-stats-dashboard">
              {/* Catégorie: Comptes */}
              <div className="admin-stats-category">
                <h3 className="admin-stats-category-title">Comptes</h3>
                <div className="admin-stats-list">
                  <Link to="/admin/comptes-clients" className="admin-stats-list-item">
                    <span className="admin-stats-list-label">Clients</span>
                    <span className="admin-stats-list-value admin-stats-value--clients">{stats.totalClients}</span>
                  </Link>
                  <Link to="/admin/comptes-admin" className="admin-stats-list-item">
                    <span className="admin-stats-list-label">Admins</span>
                    <span className="admin-stats-list-value admin-stats-value--admins">{adminCount}</span>
                  </Link>
                </div>
              </div>

              {/* Catégorie: Projets */}
              <div className="admin-stats-category">
                <h3 className="admin-stats-category-title">Projets</h3>
                <div className="admin-stats-list">
                  <div className="admin-stats-list-item">
                    <span className="admin-stats-list-label">Total</span>
                    <span className="admin-stats-list-value admin-stats-value--total">{stats.totalProjects}</span>
                  </div>
                  <div className="admin-stats-list-item">
                    <span className="admin-stats-list-label">Actifs</span>
                    <span className="admin-stats-list-value admin-stats-value--active">{stats.activeProjects}</span>
                  </div>
                  <div className="admin-stats-list-item">
                    <span className="admin-stats-list-label">Archivés</span>
                    <span className="admin-stats-list-value admin-stats-value--archived">{stats.archivedProjects}</span>
                  </div>
                </div>
              </div>

              {/* Catégorie: Statuts */}
              <div className="admin-stats-category">
                <h3 className="admin-stats-category-title">Statuts</h3>
                <div className="admin-stats-list">
                  <div className="admin-stats-list-item">
                    <span className="admin-stats-list-label">En cours</span>
                    <span className="admin-stats-list-value admin-stats-value--en-cours">{stats.statusCounts.EN_COURS}</span>
                  </div>
                  <div className="admin-stats-list-item">
                    <span className="admin-stats-list-label">En attente</span>
                    <span className="admin-stats-list-value admin-stats-value--en-attente">{stats.statusCounts.EN_ATTENTE}</span>
                  </div>
                  <div className="admin-stats-list-item">
                    <span className="admin-stats-list-label">Terminé</span>
                    <span className="admin-stats-list-value admin-stats-value--termine">{stats.statusCounts.TERMINE}</span>
                  </div>
                </div>
              </div>

              {/* Catégorie: Alertes & Priorités */}
              <div className="admin-stats-category">
                <h3 className="admin-stats-category-title">Alertes & Priorités</h3>
                <div className="admin-stats-list">
                  <div className="admin-stats-list-item">
                    <span className="admin-stats-list-label">Priorité haute</span>
                    <span className="admin-stats-list-value admin-stats-value--high-priority">{stats.highPriority}</span>
                  </div>
                  <div className="admin-stats-list-item">
                    <span className="admin-stats-list-label">Retards (deadlines)</span>
                    <span className="admin-stats-list-value admin-stats-value--overdue">{stats.overdueDeadlines}</span>
                  </div>
                  <div className="admin-stats-list-item">
                    <span className="admin-stats-list-label">Relances dépassées</span>
                    <span className="admin-stats-list-value admin-stats-value--overdue-reminders">{stats.overdueReminders}</span>
                  </div>
                  <Link to="/admin/crm" className="admin-stats-list-item">
                    <span className="admin-stats-list-label">Leads CRM</span>
                    <span className="admin-stats-list-value admin-stats-value--leads">{crmLeadCount}</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="portal-card" style={{ marginTop: 24 }}>
            <div className="admin-form-section" style={{ marginBottom: 0 }}>
              <h2>État des projets clients</h2>
              {loading ? (
                <div className="admin-loading">Chargement des projets...</div>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Projet</th>
                        <th>Statut</th>
                        <th>Priorité</th>
                        <th>Responsable</th>
                        <th>Budget</th>
                        <th>Dates</th>
                        <th>Relance</th>
                        <th>Archivé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allProjects.map((project) => (
                        <tr key={project._id}>
                          <td>{project.client?.name || '—'}</td>
                          <td>{project.name}</td>
                          <td>
                            <span className="admin-badge">{project.status}</span>
                          </td>
                          <td>{project.priority || '—'}</td>
                          <td>{project.responsible || '—'}</td>
                          <td>
                            {project.budget?.amount != null ? `${project.budget.amount} ${project.budget.currency || 'EUR'}` : '—'}
                          </td>
                          <td>
                            {project.startDate ? new Date(project.startDate).toLocaleDateString() : '—'} →{' '}
                            {project.endDate ? new Date(project.endDate).toLocaleDateString() : '—'}
                          </td>
                          <td>{project.reminderAt ? new Date(project.reminderAt).toLocaleDateString() : '—'}</td>
                          <td>{project.isArchived ? 'Oui' : 'Non'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default AdminDashboard
