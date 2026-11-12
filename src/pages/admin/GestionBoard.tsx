import PageHeader from '../../components/admin/ui/PageHeader'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
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
import './Production.css'

type ViewMode = 'table' | 'kanban' | 'gantt' | 'kpi' | 'briefs'

interface ProjectOption {
  _id: string
  name: string
}

const STATUS_OPTIONS: { value: TaskStatus; labelKey: MessageKey }[] = [
  { value: 'A_FAIRE', labelKey: 'adminAccess.board.statusTodo' },
  { value: 'EN_COURS', labelKey: 'adminAccess.board.statusInProgress' },
  { value: 'EN_REVIEW', labelKey: 'adminAccess.board.statusInReview' },
  { value: 'VALIDE', labelKey: 'adminAccess.board.statusApproved' },
  { value: 'NON_VALIDE', labelKey: 'adminAccess.board.statusRejected' },
  { value: 'A_MODIFIER', labelKey: 'adminAccess.board.statusToRevise' },
  { value: 'TERMINE', labelKey: 'adminAccess.board.statusDone' },
]

const PRIORITY_OPTIONS: { value: TaskPriority; labelKey: MessageKey }[] = [
  { value: 'BASSE', labelKey: 'adminAccess.board.priorityLow' },
  { value: 'NORMALE', labelKey: 'adminAccess.board.priorityNormal' },
  { value: 'HAUTE', labelKey: 'adminAccess.board.priorityHigh' },
  { value: 'URGENTE', labelKey: 'adminAccess.board.priorityUrgent' },
]

export default function GestionBoard() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const { t: tr } = useI18n()
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
  const [tasksError, setTasksError] = useState(false)
  const [projectsError, setProjectsError] = useState(false)

  const loadTasks = useCallback(async () => {
    setTasksError(false)
    try {
      setLoading(true)
      const data = await fetchAllTasks(selectedProject || undefined)
      setTasks(data)
    } catch {
      setTasksError(true)
    } finally {
      setLoading(false)
    }
  }, [selectedProject])

  const loadProjects = useCallback(async () => {
    setProjectsError(false)
    try {
      const res = await apiFetch<any>('/api/admin/projects')
      const list = res.projects || res
      setProjects(Array.isArray(list) ? list.map((p: any) => ({ _id: p._id, name: p.name })) : [])
    } catch {
      setProjectsError(true)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  useEffect(() => {
    if (viewMode !== 'kpi' && viewMode !== 'briefs') {
      loadTasks()
    }
  }, [loadTasks, viewMode])

  // Non-super-admin : filtrer les projets à ceux qui ont des tâches assignées
  const visibleProjects = isSuperAdmin
    ? projects
    : projects.filter((p) =>
        tasks.some((t) => {
          const pid = typeof t.project === 'object' ? t.project?._id : t.project
          return pid === p._id
        }),
      )

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
    } catch {
      showToast(tr('shell.error.actionFailed'), 'error')
    }
  }

  const handleMoveTask = async (projectId: string, taskId: string, status: string, order: number) => {
    try {
      await moveTask(projectId, taskId, status, order)
      await loadTasks()
    } catch {
      showToast(tr('shell.error.actionFailed'), 'error')
    }
  }

  const getProjectId = (task: Task): string => {
    if (typeof task.project === 'object' && task.project?._id) return task.project._id
    return task.project as string
  }

  const ALL_TABS: { key: ViewMode; label: string; icon: string; superOnly?: boolean }[] = [
    { key: 'table', label: tr('adminAccess.board.tabTable'), icon: '☰' },
    { key: 'kanban', label: 'Kanban', icon: '▦' },
    { key: 'gantt', label: 'Gantt', icon: '▬' },
    { key: 'kpi', label: 'KPI', icon: '◉', superOnly: true },
    { key: 'briefs', label: 'Briefs', icon: '✉' },
  ]
  const VIEW_TABS = isSuperAdmin ? ALL_TABS : ALL_TABS.filter((t) => !t.superOnly)

  const showFilters = viewMode !== 'kpi' && viewMode !== 'briefs'

  return (
    <div className="portal-container production-page production-list production-gestion">
      {(tasksError || projectsError) && (
        <div role="alert">
          <p>{tr('shell.error.loadFailed')}</p>
          <button
            type="button"
            onClick={() => {
              if (tasksError) void loadTasks()
              if (projectsError) void loadProjects()
            }}
          >
            {tr('shell.error.retry')}
          </button>
        </div>
      )}
      <div className="gestion-header">
        <div className="production-header">
          <PageHeader
            eyebrow={tr('shell.navItem.projects')}
            title={isSuperAdmin ? tr('adminAccess.board.titleSuper') : tr('adminAccess.board.titleMine')}
          />
        </div>

        <div className="gestion-controls">
          {showFilters && (
            <CustomSelect
              className="gestion-project-select"
              value={selectedProject}
              onChange={(v) => setSelectedProject(v)}
              options={[
                {
                  value: '',
                  label: isSuperAdmin ? tr('adminAccess.board.allProjects') : tr('adminAccess.board.allMyProjects'),
                },
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
                { value: '', label: tr('adminAccess.board.allStatuses') },
                ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: tr(o.labelKey) })),
              ]}
            />

            <CustomSelect
              className="gestion-filter-select"
              value={filterPriority}
              onChange={(v) => setFilterPriority(v)}
              options={[
                { value: '', label: tr('adminAccess.board.allPriorities') },
                ...PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: tr(o.labelKey) })),
              ]}
            />

            {isSuperAdmin && assigneeOptions.length > 0 && (
              <CustomSelect
                className="gestion-filter-select"
                value={filterAssignee}
                onChange={(v) => setFilterAssignee(v)}
                options={[
                  { value: '', label: tr('adminAccess.board.allAssignees') },
                  ...assigneeOptions.map((o) => ({ value: o.value, label: o.label })),
                ]}
              />
            )}

            {hasActiveFilters && (
              <button
                className="gestion-filter-clear"
                onClick={() => {
                  setFilterStatus('')
                  setFilterPriority('')
                  setFilterAssignee('')
                }}
              >
                {tr('adminAccess.board.reset')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="gestion-content">
        {viewMode === 'table' && !tasksError && (
          <GestionTable
            tasks={filteredTasks}
            loading={loading}
            onUpdate={handleUpdateTask}
            getProjectId={getProjectId}
            readOnly={!isSuperAdmin}
            onRefresh={loadTasks}
          />
        )}
        {viewMode === 'kanban' && !tasksError && (
          <GestionKanban
            tasks={filteredTasks}
            loading={loading}
            onMove={handleMoveTask}
            onUpdate={handleUpdateTask}
            getProjectId={getProjectId}
            readOnly={!isSuperAdmin}
          />
        )}
        {viewMode === 'gantt' && !tasksError && (
          <GestionGantt
            tasks={filteredTasks}
            loading={loading}
            onUpdate={handleUpdateTask}
            getProjectId={getProjectId}
            readOnly={!isSuperAdmin}
          />
        )}
        {viewMode === 'kpi' && <GestionKpi />}
        {viewMode === 'briefs' && <GestionBriefs projects={projects} user={user} />}
      </div>
    </div>
  )
}
