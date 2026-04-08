import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiFetch, getToken } from '../../lib/api'
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
    steps: { _id: string; title: string; done: boolean; waitingReview: boolean }[]
    files: { _id: string; originalName: string; mimeType: string; size: number }[]
    createdAt: string
  }[]>([])
  const [missionsLoading, setMissionsLoading] = useState(false)
  const [expandedMission, setExpandedMission] = useState<string | null>(null)
  const [missionStepInputs, setMissionStepInputs] = useState<Record<string, string>>({})
  const [uploadingMission, setUploadingMission] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

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

  const handleMissionStatusUpdate = async (missionId: string, projectId: string, status: string) => {
    try {
      const data = await apiFetch<{ mission: { status: string } }>(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setMissions(m => m.map(x => x._id === missionId ? { ...x, status: data.mission.status } : x))
    } catch { /* silent */ }
  }

  const handleMissionToggleStep = async (missionId: string, projectId: string, mission: typeof missions[0], stepId: string) => {
    const newSteps = mission.steps.map(s => s._id === stepId ? { ...s, done: !s.done } : s)
    try {
      const data = await apiFetch<{ mission: typeof missions[0] }>(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ steps: newSteps }),
      })
      setMissions(m => m.map(x => x._id === missionId ? data.mission : x))
    } catch { /* silent */ }
  }

  const handleMissionAddStep = async (missionId: string, projectId: string, mission: typeof missions[0], title: string) => {
    const newSteps = [...mission.steps, { title, done: false }]
    try {
      const data = await apiFetch<{ mission: typeof missions[0] }>(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ steps: newSteps }),
      })
      setMissions(m => m.map(x => x._id === missionId ? data.mission : x))
      setMissionStepInputs(s => ({ ...s, [missionId]: '' }))
    } catch { /* silent */ }
  }

  const handleMissionFileUpload = async (missionId: string, projectId: string, file: File) => {
    setUploadingMission(missionId)
    const token = getToken() || ''
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch(`/api/admin/internal-projects/${projectId}/missions/${missionId}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const data = await res.json()
      setMissions(m => m.map(x => x._id === missionId ? { ...x, files: data.mission?.files ?? x.files } : x))
    } catch { /* silent */ } finally {
      setUploadingMission(null)
    }
  }

  const handleMissionFileDelete = async (missionId: string, projectId: string, fileId: string) => {
    try {
      await apiFetch(`/api/admin/internal-projects/${projectId}/missions/${missionId}/files/${fileId}`, { method: 'DELETE' })
      setMissions(m => m.map(x => x._id === missionId ? { ...x, files: x.files.filter(f => f._id !== fileId) } : x))
    } catch { /* silent */ }
  }

  const handleMissionFileOpen = async (missionId: string, projectId: string, fileId: string) => {
    const token = getToken() || ''
    try {
      const res = await fetch(`/api/admin/internal-projects/${projectId}/missions/${missionId}/files/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch { /* silent */ }
  }

  const handleMissionDateUpdate = async (missionId: string, projectId: string, dueDate: string) => {
    try {
      const data = await apiFetch<{ mission: typeof missions[0] }>(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ dueDate: dueDate || null }),
      })
      setMissions(m => m.map(x => x._id === missionId ? data.mission : x))
    } catch { /* silent */ }
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

  const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '9px 14px',
    color: 'var(--text-secondary)', fontWeight: 700, fontSize: 10,
    textTransform: 'uppercase', letterSpacing: '.6px',
  }

  const nextBtnStyle: React.CSSProperties = {
    padding: '2px 8px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)', fontSize: 10,
    cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)',
    whiteSpace: 'nowrap', transition: 'border-color .15s',
  }

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

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="gestion-view-toggle">
              {VIEW_TABS.filter(t => t.key !== 'missions').map((tab) => (
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
            {/* Bouton Missions — totalement séparé */}
            <button
              onClick={() => setViewMode('missions')}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 14px',
                borderRadius: 10,
                border: `1.5px solid ${viewMode === 'missions' ? 'rgba(234,179,8,0.7)' : 'rgba(234,179,8,0.35)'}`,
                background: viewMode === 'missions' ? 'rgba(234,179,8,0.18)' : 'rgba(234,179,8,0.06)',
                color: viewMode === 'missions' ? '#fde047' : 'rgba(253,224,71,0.65)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                boxShadow: viewMode === 'missions' ? '0 0 12px rgba(234,179,8,0.15)' : 'none',
                transition: 'all .15s',
                whiteSpace: 'nowrap',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
              </svg>
              Missions internes
            </button>
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
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
                <div style={{ fontSize: 32, marginBottom: 10, opacity: .4 }}>◎</div>
                Aucune mission pour l'instant
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={thStyle}>Projet</th>
                    <th style={thStyle}>Mission</th>
                    {isSuperAdmin && <th style={thStyle}>Assigné à</th>}
                    <th style={thStyle}>Statut</th>
                    <th style={thStyle}>Progression</th>
                    <th style={thStyle}>Fichiers</th>
                    <th style={thStyle}>Deadline</th>
                    <th style={{ ...thStyle, width: 28 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {missions.map(m => {
                    const statusBg: Record<string, string> = { A_FAIRE: 'rgba(234,179,8,0.12)', EN_COURS: 'rgba(14,165,233,0.12)', TERMINE: 'rgba(16,185,129,0.12)' }
                    const statusBorder: Record<string, string> = { A_FAIRE: 'rgba(234,179,8,0.3)', EN_COURS: 'rgba(14,165,233,0.3)', TERMINE: 'rgba(16,185,129,0.3)' }
                    const statusColor: Record<string, string> = { A_FAIRE: '#fde047', EN_COURS: '#38bdf8', TERMINE: '#6ee7b7' }
                    const statusLabel: Record<string, string> = { A_FAIRE: 'À faire', EN_COURS: 'En cours', TERMINE: 'Terminée' }
                    const isOverdue = m.dueDate && m.status !== 'TERMINE' && new Date(m.dueDate) < new Date()
                    const doneCount = m.steps?.filter(s => s.done).length ?? 0
                    const totalSteps = m.steps?.length ?? 0
                    const pct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0
                    const isExpanded = expandedMission === m._id
                    const colCount = isSuperAdmin ? 8 : 7

                    return (
                      <>
                        <tr
                          key={m._id}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent', transition: 'background .15s' }}
                          onClick={() => setExpandedMission(isExpanded ? null : m._id)}
                        >
                          {/* Projet */}
                          <td style={{ padding: '11px 14px', verticalAlign: 'middle' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 12 }}>{m.internalProject?.name || '—'}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{m.internalProject?.entity}</div>
                          </td>

                          {/* Mission */}
                          <td style={{ padding: '11px 14px', verticalAlign: 'middle', maxWidth: 220 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{m.title}</div>
                            {m.description && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{m.description}</div>}
                          </td>

                          {/* Assigné */}
                          {isSuperAdmin && (
                            <td style={{ padding: '11px 14px', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(165,180,207,0.15)', border: '1px solid rgba(165,180,207,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#a5b4cf', flexShrink: 0 }}>
                                  {m.assignedTo?.name?.[0]?.toUpperCase()}
                                </div>
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.assignedTo?.name}</span>
                              </div>
                            </td>
                          )}

                          {/* Statut */}
                          <td style={{ padding: '11px 14px', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                              <span style={{
                                fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                                color: statusColor[m.status] || '#a5b4cf',
                                background: statusBg[m.status] || 'rgba(255,255,255,0.05)',
                                border: `1px solid ${statusBorder[m.status] || 'rgba(255,255,255,0.1)'}`,
                                whiteSpace: 'nowrap',
                              }}>
                                {statusLabel[m.status] || m.status}
                              </span>
                              {m.status === 'A_FAIRE' && (
                                <button type="button" onClick={() => handleMissionStatusUpdate(m._id, m.internalProject?._id, 'EN_COURS')}
                                  style={nextBtnStyle}>→ En cours</button>
                              )}
                              {m.status === 'EN_COURS' && (
                                <button type="button" onClick={() => handleMissionStatusUpdate(m._id, m.internalProject?._id, 'TERMINE')}
                                  style={nextBtnStyle}>→ Terminée</button>
                              )}
                            </div>
                          </td>

                          {/* Progression */}
                          <td style={{ padding: '11px 14px', verticalAlign: 'middle', minWidth: 90 }}>
                            {totalSteps > 0 ? (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{doneCount}/{totalSteps} étapes</span>
                                  <span style={{ fontSize: 10, color: pct === 100 ? '#6ee7b7' : 'var(--text-secondary)' }}>{pct}%</span>
                                </div>
                                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                                  <div style={{ height: '100%', borderRadius: 2, background: pct === 100 ? '#10b981' : '#38bdf8', width: `${pct}%`, transition: 'width .3s' }} />
                                </div>
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: 'rgba(165,180,207,0.4)' }}>—</span>
                            )}
                          </td>

                          {/* Fichiers */}
                          <td style={{ padding: '11px 14px', verticalAlign: 'middle' }}>
                            {(m.files?.length ?? 0) > 0 ? (
                              <span style={{ fontSize: 11, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                {m.files.length}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: 'rgba(165,180,207,0.4)' }}>—</span>
                            )}
                          </td>

                          {/* Deadline */}
                          <td style={{ padding: '11px 14px', verticalAlign: 'middle' }}>
                            <span style={{ fontSize: 12, color: isOverdue ? '#f87171' : 'var(--text-secondary)', fontWeight: isOverdue ? 600 : 400 }}>
                              {isOverdue && '⚠ '}{m.dueDate ? new Date(m.dueDate).toLocaleDateString('fr-FR') : '—'}
                            </span>
                          </td>

                          {/* Expand chevron */}
                          <td style={{ padding: '11px 8px', verticalAlign: 'middle', textAlign: 'center' }}>
                            <span style={{ fontSize: 10, color: 'var(--text-secondary)', transition: 'transform .2s', display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▾</span>
                          </td>
                        </tr>

                        {/* EXPANDED ROW */}
                        {isExpanded && (
                          <tr key={`${m._id}-exp`}>
                            <td colSpan={colCount} style={{ padding: '0 14px 14px', background: 'rgba(255,255,255,0.015)' }}>
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                                {/* Colonne gauche : Étapes */}
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text-secondary)', marginBottom: 10 }}>Étapes</div>
                                  {totalSteps > 0 ? (
                                    <div style={{ marginBottom: 10 }}>
                                      {m.steps.map(step => (
                                        <div key={step._id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '5px 8px', borderRadius: 6, background: step.waitingReview ? 'rgba(234,179,8,0.06)' : 'transparent', border: step.waitingReview ? '1px solid rgba(234,179,8,0.2)' : '1px solid transparent' }}>
                                          <input type="checkbox" checked={step.done}
                                            disabled={!isSuperAdmin}
                                            onChange={() => isSuperAdmin && handleMissionToggleStep(m._id, m.internalProject?._id, m, step._id)}
                                            style={{ cursor: isSuperAdmin ? 'pointer' : 'default', width: 13, height: 13, accentColor: '#10b981', flexShrink: 0 }} />
                                          <span style={{ fontSize: 12, flex: 1, color: step.done ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: step.done ? 'line-through' : 'none' }}>
                                            {step.title}
                                          </span>
                                          {step.waitingReview && !step.done && (
                                            <span style={{ fontSize: 10, color: '#fde047', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 8, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                                              En attente
                                            </span>
                                          )}
                                          {isSuperAdmin && step.waitingReview && !step.done && (
                                            <button type="button"
                                              onClick={async () => {
                                                try {
                                                  const data = await apiFetch<{ mission: typeof missions[0] }>(`/api/admin/internal-projects/${m.internalProject?._id}/missions/${m._id}/steps/${step._id}/validate-step`, { method: 'POST' })
                                                  setMissions(ms => ms.map(x => x._id === m._id ? data.mission : x))
                                                } catch { /* silent */ }
                                              }}
                                              style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.1)', color: '#6ee7b7', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                              ✓ Valider
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p style={{ fontSize: 12, color: 'rgba(165,180,207,0.4)', marginBottom: 10 }}>Aucune étape</p>
                                  )}
                                  {isSuperAdmin && (
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                      <input className="portal-input"
                                        value={missionStepInputs[m._id] || ''}
                                        onChange={e => setMissionStepInputs(s => ({ ...s, [m._id]: e.target.value }))}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' && missionStepInputs[m._id]?.trim())
                                            handleMissionAddStep(m._id, m.internalProject?._id, m, missionStepInputs[m._id].trim())
                                        }}
                                        placeholder="Nouvelle étape… (Entrée)"
                                        style={{ fontSize: 12, padding: '5px 8px', flex: 1 }} />
                                      <button type="button"
                                        onClick={() => { if (missionStepInputs[m._id]?.trim()) handleMissionAddStep(m._id, m.internalProject?._id, m, missionStepInputs[m._id].trim()) }}
                                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(14,165,233,0.3)', background: 'rgba(14,165,233,0.08)', color: '#38bdf8', fontSize: 13, cursor: 'pointer' }}>+</button>
                                    </div>
                                  )}
                                </div>

                                {/* Colonne droite : Fichiers + Deadline */}
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text-secondary)', marginBottom: 10 }}>Fichiers</div>
                                  {(m.files?.length ?? 0) === 0 ? (
                                    <p style={{ fontSize: 12, color: 'rgba(165,180,207,0.4)', marginBottom: 10 }}>Aucun fichier joint</p>
                                  ) : (
                                    <div style={{ marginBottom: 10 }}>
                                      {m.files.map(f => (
                                        <div key={f._id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, padding: '5px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                          <span style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.originalName}</span>
                                          <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>{f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} Mo` : `${Math.round(f.size / 1024)} Ko`}</span>
                                          <button type="button" onClick={e => { e.stopPropagation(); handleMissionFileOpen(m._id, m.internalProject?._id, f._id) }}
                                            style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, border: '1px solid rgba(14,165,233,0.3)', background: 'rgba(14,165,233,0.08)', color: '#38bdf8', cursor: 'pointer', flexShrink: 0 }}>
                                            Ouvrir
                                          </button>
                                          {isSuperAdmin && (
                                            <button type="button" onClick={e => { e.stopPropagation(); handleMissionFileDelete(m._id, m.internalProject?._id, f._id) }}
                                              style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.06)', color: '#f87171', cursor: 'pointer', flexShrink: 0 }}>
                                              ✕
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {/* Upload fichier */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input
                                      type="file"
                                      ref={el => { fileInputRefs.current[m._id] = el }}
                                      style={{ display: 'none' }}
                                      onChange={async e => {
                                        const file = e.target.files?.[0]
                                        if (file) await handleMissionFileUpload(m._id, m.internalProject?._id, file)
                                        e.target.value = ''
                                      }}
                                    />
                                    <button type="button"
                                      onClick={e => { e.stopPropagation(); fileInputRefs.current[m._id]?.click() }}
                                      disabled={uploadingMission === m._id}
                                      style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(165,180,207,0.2)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                      {uploadingMission === m._id ? 'Envoi...' : 'Joindre un fichier'}
                                    </button>
                                  </div>

                                  {/* Deadline (éditable SUPER_ADMIN) */}
                                  {isSuperAdmin && (
                                    <div style={{ marginTop: 14 }}>
                                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text-secondary)', marginBottom: 6 }}>Deadline</div>
                                      <input
                                        type="date"
                                        defaultValue={m.dueDate ? m.dueDate.substring(0, 10) : ''}
                                        onBlur={e => handleMissionDateUpdate(m._id, m.internalProject?._id, e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', cursor: 'pointer' }}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
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
