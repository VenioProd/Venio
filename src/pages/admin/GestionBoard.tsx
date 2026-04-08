import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/api'
import { fetchAllTasks } from '../../services/gestion'
import { updateTask, moveTask } from '../../services/adminTasks'
import type { Task, TaskStatus, TaskPriority } from '../../types/task.types'
import GestionTable from '../../components/admin/GestionTable'
import GestionKanban from '../../components/admin/GestionKanban'
import GestionGantt from '../../components/admin/GestionGantt'
import GestionKpi from '../../components/admin/GestionKpi'
import GestionBriefs from '../../components/admin/GestionBriefs'
import CustomSelect from '../../components/admin/CustomSelect'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import '../../styles/gestion.css'

type ViewMode = 'table' | 'kanban' | 'gantt' | 'kpi' | 'briefs' | 'missions'

interface ProjectOption {
  _id: string
  name: string
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'A_FAIRE', label: 'A faire' },
  { value: 'EN_COURS', label: 'En cours' },
  { value: 'EN_REVIEW', label: 'En review' },
  { value: 'VALIDE', label: 'Valide' },
  { value: 'NON_VALIDE', label: 'Non valide' },
  { value: 'A_MODIFIER', label: 'A modifier' },
  { value: 'TERMINE', label: 'Termine' },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'BASSE', label: 'Basse' },
  { value: 'NORMALE', label: 'Normale' },
  { value: 'HAUTE', label: 'Haute' },
  { value: 'URGENTE', label: 'Urgente' },
]

export default function GestionBoard() {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const [searchParams] = useSearchParams()
  const initialView = (searchParams.get('view') as ViewMode) || 'table'
  const [viewMode, setViewMode] = useState<ViewMode>(initialView)
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterPriority, setFilterPriority] = useState<string>('')
  const [filterAssignee, setFilterAssignee] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [missions, setMissions] = useState<{
    _id: string; title: string; description: string; status: string; dueDate: string | null
    assignedTo: { _id: string; name: string; email: string }
    internalProject: { _id: string; name: string; entity: string }
    createdAt: string
  }[]>([])
  const [missionsLoading, setMissionsLoading] = useState(false)

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchAllTasks(selectedProject || undefined)
      setTasks(data)
    } catch (err) {
      console.error('Erreur chargement taches:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedProject])

  useEffect(() => {
    apiFetch('/api/admin/projects').then((res: any) => {
      const list = res.projects || res
      setProjects(Array.isArray(list) ? list.map((p: any) => ({ _id: p._id, name: p.name })) : [])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (viewMode !== 'kpi' && viewMode !== 'briefs' && viewMode !== 'missions') {
      loadTasks()
    }
    if (viewMode === 'missions') {
      setMissionsLoading(true)
      apiFetch<{ missions: typeof missions }>('/api/admin/internal-projects/missions')
        .then(d => setMissions(d.missions || []))
        .catch(() => {})
        .finally(() => setMissionsLoading(false))
    }
  }, [loadTasks, viewMode])

  // Non-super-admin : filtrer les projets à ceux qui ont des tâches assignées
  const visibleProjects = isSuperAdmin
    ? projects
    : projects.filter((p) => tasks.some((t) => {
        const pid = typeof t.project === 'object' ? t.project?._id : t.project
        return pid === p._id
      }))

  // Liste des assignés uniques pour le filtre
  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>()
    tasks.forEach((t) => {
      if (t.assignee) map.set(t.assignee._id || (t.assignee as any), t.assignee.name)
    })
    return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }))
  }, [tasks])

  // Filtrage côté client
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatus && t.status !== filterStatus) return false
      if (filterPriority && t.priority !== filterPriority) return false
      if (filterAssignee && (!t.assignee || t.assignee._id !== filterAssignee)) return false
      return true
    })
  }, [tasks, filterStatus, filterPriority, filterAssignee])

  const hasActiveFilters = filterStatus || filterPriority || filterAssignee

  const handleUpdateTask = async (projectId: string, taskId: string, data: Record<string, unknown>) => {
    try {
      await updateTask(projectId, taskId, data as any)
      await loadTasks()
    } catch (err) {
      console.error('Erreur mise a jour:', err)
    }
  }

  const handleMoveTask = async (projectId: string, taskId: string, status: string, order: number) => {
    try {
      await moveTask(projectId, taskId, status, order)
      await loadTasks()
    } catch (err) {
      console.error('Erreur deplacement:', err)
    }
  }

  const getProjectId = (task: Task): string => {
    if (typeof task.project === 'object' && task.project?._id) return task.project._id
    return task.project as string
  }

  const ALL_TABS: { key: ViewMode; label: string; icon: string; superOnly?: boolean }[] = [
    { key: 'table', label: 'Tableau', icon: '☰' },
    { key: 'kanban', label: 'Kanban', icon: '▦' },
    { key: 'gantt', label: 'Gantt', icon: '▬' },
    { key: 'kpi', label: 'KPI', icon: '◉', superOnly: true },
    { key: 'briefs', label: 'Briefs', icon: '✉' },
    { key: 'missions', label: 'Missions', icon: '◎' },
  ]
  const VIEW_TABS = isSuperAdmin ? ALL_TABS : ALL_TABS.filter((t) => !t.superOnly)

  const showFilters = viewMode !== 'kpi' && viewMode !== 'briefs' && viewMode !== 'missions'

  return (
    <div className="portal-container">
      <div className="gestion-header">
        <div className="gestion-header-top">
          <Link to="/admin" className="ticket-back-btn">← Retour</Link>
          <h1 className="gestion-title">{isSuperAdmin ? 'Gestion de projets' : 'Mes projets & taches'}</h1>
        </div>

        <div className="gestion-controls">
          {showFilters && (
            <CustomSelect
              className="gestion-project-select"
              value={selectedProject}
              onChange={(v) => setSelectedProject(v)}
              options={[
                { value: '', label: isSuperAdmin ? 'Tous les projets' : 'Tous mes projets' },
                ...visibleProjects.map((p) => ({ value: p._id, label: p.name })),
              ]}
            />
          )}

          <div className="gestion-view-toggle">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.key}
                className={`gestion-view-btn ${viewMode === tab.key ? 'active' : ''}`}
                onClick={() => setViewMode(tab.key)}
                title={tab.label}
              >
                <span className="gestion-view-icon">{tab.icon}</span>
                <span className="gestion-view-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {showFilters && (
          <div className="gestion-filters">
            <CustomSelect
              className="gestion-filter-select"
              value={filterStatus}
              onChange={(v) => setFilterStatus(v)}
              options={[
                { value: '', label: 'Tous les statuts' },
                ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              ]}
            />

            <CustomSelect
              className="gestion-filter-select"
              value={filterPriority}
              onChange={(v) => setFilterPriority(v)}
              options={[
                { value: '', label: 'Toutes les priorites' },
                ...PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              ]}
            />

            {isSuperAdmin && assigneeOptions.length > 0 && (
              <CustomSelect
                className="gestion-filter-select"
                value={filterAssignee}
                onChange={(v) => setFilterAssignee(v)}
                options={[
                  { value: '', label: 'Tous les assignes' },
                  ...assigneeOptions.map((o) => ({ value: o.value, label: o.label })),
                ]}
              />
            )}

            {hasActiveFilters && (
              <button
                className="gestion-filter-clear"
                onClick={() => { setFilterStatus(''); setFilterPriority(''); setFilterAssignee('') }}
              >
                Reinitialiser
              </button>
            )}
          </div>
        )}
      </div>

      <div className="gestion-content">
        {viewMode === 'table' && (
          <GestionTable
            tasks={filteredTasks}
            loading={loading}
            onUpdate={handleUpdateTask}
            getProjectId={getProjectId}
            readOnly={!isSuperAdmin}
            onRefresh={loadTasks}
          />
        )}
        {viewMode === 'kanban' && (
          <GestionKanban
            tasks={filteredTasks}
            loading={loading}
            onMove={handleMoveTask}
            onUpdate={handleUpdateTask}
            getProjectId={getProjectId}
            readOnly={!isSuperAdmin}
          />
        )}
        {viewMode === 'gantt' && (
          <GestionGantt
            tasks={filteredTasks}
            loading={loading}
            onUpdate={handleUpdateTask}
            getProjectId={getProjectId}
            readOnly={!isSuperAdmin}
          />
        )}
        {viewMode === 'kpi' && (
          <GestionKpi />
        )}
        {viewMode === 'briefs' && (
          <GestionBriefs
            projects={projects}
            user={user}
          />
        )}
        {viewMode === 'missions' && (
          <div style={{ padding: '16px 0' }}>
            {missionsLoading ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chargement...</p>
            ) : missions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 14 }}>Aucune mission pour l'instant</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px' }}>Projet</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px' }}>Mission</th>
                    {isSuperAdmin && <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px' }}>Assigné à</th>}
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px' }}>Statut</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px' }}>Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {missions.map(m => {
                    const statusColors: Record<string, string> = { A_FAIRE: '#fde047', EN_COURS: '#38bdf8', TERMINE: '#6ee7b7' }
                    const statusLabels: Record<string, string> = { A_FAIRE: 'À faire', EN_COURS: 'En cours', TERMINE: 'Terminée' }
                    const isOverdue = m.dueDate && m.status !== 'TERMINE' && new Date(m.dueDate) < new Date()
                    return (
                      <tr key={m._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>{m.internalProject?.name || '—'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.internalProject?.entity}</div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.title}</div>
                          {m.description && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{m.description}</div>}
                        </td>
                        {isSuperAdmin && <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{m.assignedTo?.name}</td>}
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, color: statusColors[m.status] || '#a5b4cf', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            {statusLabels[m.status] || m.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: isOverdue ? '#f87171' : 'var(--text-secondary)', fontSize: 12 }}>
                          {m.dueDate ? new Date(m.dueDate).toLocaleDateString('fr-FR') : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
