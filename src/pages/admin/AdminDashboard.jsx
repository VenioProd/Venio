import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../lib/permissions'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const AdminDashboard = () => {
  const { user } = useAuth()
  const [clientCount, setClientCount] = useState(0)
  const [projectCount, setProjectCount] = useState(0)
  const [allClients, setAllClients] = useState([])
  const [allProjects, setAllProjects] = useState([])
  const [adminCount, setAdminCount] = useState(0)
  const [crmLeadCount, setCrmLeadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const canManageClients = hasPermission(user, PERMISSIONS.MANAGE_CLIENTS)
  const canViewProjects = hasPermission(user, PERMISSIONS.VIEW_PROJECTS)
  const canEditProjects = hasPermission(user, PERMISSIONS.EDIT_PROJECTS)
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

  // Actions rapides contextuelles (les liens de nav top sont dans AdminNav)
  const quickActions = [
    canEditProjects && { to: '/admin/projets/nouveau', label: '✚ Nouveau projet', secondary: true },
    canManageClients && { to: '/admin/comptes-clients/nouveau', label: '✚ Nouveau client', secondary: true },
  ].filter(Boolean)

  return (
    <div className="portal-container">
      <div className="admin-page-header">
        <div>
          <h1>Tableau de bord</h1>
          <p className="admin-page-subtitle">Bienvenue {user?.name || ''}</p>
        </div>
        {quickActions.length > 0 && (
          <div className="admin-quick-actions">
            {quickActions.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className={`portal-button${a.secondary ? ' secondary' : ''}`}
                style={{ padding: '8px 14px', fontSize: '0.88rem' }}
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
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
