import PageHeader from '../../components/admin/ui/PageHeader'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { apiFetch, apiUpload } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import { useToast } from '../../context/ToastContext'
import ConfirmModal from '../../components/ConfirmModal'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import './Production.css'

const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  EN_COURS: 'projB.page.statusEnCours',
  EN_ATTENTE: 'projB.page.statusEnAttente',
  TERMINE: 'projB.page.statusTermine',
  ARCHIVE: 'projB.page.statusArchive',
}
const PRIORITY_LABEL_KEYS: Record<string, MessageKey> = {
  BASSE: 'projB.page.priorityBasse',
  NORMALE: 'projB.page.priorityNormale',
  HAUTE: 'projB.page.priorityHaute',
  URGENTE: 'projB.page.priorityUrgente',
}
const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  EN_COURS: { bg: 'var(--accent-soft)', border: 'var(--accent-border)', text: 'var(--primary)' },
  EN_ATTENTE: {
    bg: 'color-mix(in srgb, var(--warning) 12%, transparent)',
    border: 'color-mix(in srgb, var(--warning) 40%, transparent)',
    text: 'var(--warning)',
  },
  TERMINE: {
    bg: 'var(--good-surface)',
    border: 'color-mix(in srgb, var(--good) 28%, transparent)',
    text: 'var(--good)',
  },
  ARCHIVE: {
    bg: 'color-mix(in srgb, var(--text-secondary) 12%, transparent)',
    border: 'color-mix(in srgb, var(--text-secondary) 35%, transparent)',
    text: 'var(--text-secondary)',
  },
}
const PRIORITY_COLORS: Record<string, string> = {
  BASSE: 'var(--good)',
  NORMALE: 'var(--text-secondary)',
  HAUTE: 'var(--warning)',
  URGENTE: 'var(--critical)',
}

import { type Project, type Mission } from './internal-project-detail/types'
import MissionDetail from './internal-project-detail/MissionDetail'
import MissionsTab from './internal-project-detail/MissionsTab'
import { LoadingState, NotFoundState, StatusSelector, OverviewTab, MetaInfo } from './internal-project-detail/parts'

export default function InternalProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()
  const { t } = useI18n()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const isAdminRole = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'RH'

  const [activeTab, setActiveTab] = useState<'overview' | 'missions'>('overview')
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [projectError, setProjectError] = useState(false)
  const [missionsError, setMissionsError] = useState(false)
  const [missionFormVersion, setMissionFormVersion] = useState(0)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editStatus, setEditStatus] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)

  const [missions, setMissions] = useState<Mission[]>([])
  const [missionsLoading, setMissionsLoading] = useState(true)
  const [showMissionForm, setShowMissionForm] = useState(false)
  const [missionForm, setMissionForm] = useState({
    title: '',
    description: '',
    assignedTo: [] as string[],
    dueDate: '',
  })
  const [savingMission, setSavingMission] = useState(false)

  const [stepInputs, setStepInputs] = useState<Record<string, string>>({})
  const [stepAssigneeInputs, setStepAssigneeInputs] = useState<Record<string, string>>({})
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState<Record<string, boolean>>({})
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [deliverableInputs, setDeliverableInputs] = useState<
    Record<string, { title: string; description: string; assignedTo: string }>
  >({})
  const [selectedMission, setSelectedMission] = useState<string | null>(null)

  // Vue tableau (façon Monday) — toggle + tri + filtres
  const [missionView, setMissionView] = useState<'cards' | 'table'>('table')
  type SortKey = 'title' | 'status' | 'progress' | 'dueDate' | 'steps' | 'assignee'
  const [sortKey, setSortKey] = useState<SortKey>('dueDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'A_FAIRE' | 'EN_COURS' | 'TERMINE'>('ALL')
  const [filterAssignee, setFilterAssignee] = useState<string>('ALL')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const loadProject = useCallback(async () => {
    setLoading(true)
    setProjectError(false)
    try {
      const data = await apiFetch<{ project: Project }>(`/api/admin/internal-projects/${id}`)
      setProject(data.project)
      setEditStatus(data.project.status)
    } catch {
      setProjectError(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  const loadMissions = useCallback(async () => {
    setMissionsLoading(true)
    setMissionsError(false)
    try {
      const data = await apiFetch<{ missions: Mission[] }>(`/api/admin/internal-projects/${id}/missions`)
      setMissions(data.missions || [])
    } catch {
      setMissionsError(true)
    } finally {
      setMissionsLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadProject()
    void loadMissions()
  }, [loadProject, loadMissions])

  const handleStatusChange = async (newStatus: string) => {
    if (!project) return
    setSavingStatus(true)
    try {
      const data = await apiFetch<{ project: Project }>(`/api/admin/internal-projects/${project._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      setProject(data.project)
      setEditStatus(data.project.status)
      showToast(t('projB.page.statusUpdated'), 'success')
    } catch (err: any) {
      setEditStatus(project.status)
      showToast(err.message || t('projB.page.error'), 'error')
    } finally {
      setSavingStatus(false)
    }
  }

  const handleDelete = async () => {
    if (!project) return
    try {
      await apiFetch(`/api/admin/internal-projects/${project._id}`, { method: 'DELETE' })
      showToast(t('projB.page.projectDeleted'), 'success')
      navigate('/admin/projets/internes')
    } catch (err: any) {
      showToast(err.message || t('projB.page.error'), 'error')
    }
  }

  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!missionForm.title.trim()) {
      showToast(t('projB.page.titleRequired'), 'error')
      return
    }
    if (missionForm.assignedTo.length === 0) {
      showToast(t('projB.page.assigneeRequired'), 'error')
      return
    }
    setSavingMission(true)
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions`, {
        method: 'POST',
        body: JSON.stringify({
          title: missionForm.title.trim(),
          description: missionForm.description,
          assignedTo: missionForm.assignedTo,
          dueDate: missionForm.dueDate || null,
        }),
      })
      setMissions((m) => [data.mission, ...m])
      setShowMissionForm(false)
      setMissionForm({ title: '', description: '', assignedTo: [], dueDate: '' })
      showToast(t('projB.page.missionCreated'), 'success')
    } catch (err: any) {
      showToast(err.message || t('projB.page.error'), 'error')
    } finally {
      setSavingMission(false)
    }
  }

  const handleMissionStatus = async (missionId: string, status: string) => {
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setMissions((m) => m.map((x) => (x._id === missionId ? { ...x, status: data.mission.status } : x)))
    } catch (err: any) {
      showToast(err.message || t('projB.page.error'), 'error')
    }
  }

  const handleDeleteMission = async (missionId: string) => {
    try {
      await apiFetch(`/api/admin/internal-projects/${id}/missions/${missionId}`, { method: 'DELETE' })
      setMissions((m) => m.filter((x) => x._id !== missionId))
      if (selectedMission === missionId) setSelectedMission(null)
      showToast(t('projB.page.missionDeleted'), 'success')
    } catch (err: any) {
      showToast(err.message || t('projB.page.error'), 'error')
    }
  }

  const handleToggleStep = async (missionId: string, mission: Mission, stepId: string) => {
    const newSteps = mission.steps.map((s) => (s._id === stepId ? { ...s, done: !s.done } : s))
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ steps: newSteps }),
      })
      setMissions((m) => m.map((x) => (x._id === missionId ? data.mission : x)))
    } catch (err: any) {
      showToast(err.message || t('projB.page.error'), 'error')
    }
  }

  const handleAddStep = async (missionId: string, mission: Mission, title: string, assignedTo?: string) => {
    const newStep: any = { title, done: false }
    if (assignedTo) newStep.assignedTo = assignedTo
    const newSteps = [...mission.steps, newStep]
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ steps: newSteps }),
      })
      setMissions((m) => m.map((x) => (x._id === missionId ? data.mission : x)))
      setStepInputs((s) => ({ ...s, [missionId]: '' }))
      setStepAssigneeInputs((s) => ({ ...s, [missionId]: '' }))
    } catch (err: any) {
      showToast(err.message || t('projB.page.error'), 'error')
    }
  }

  const handleDeleteStep = async (missionId: string, mission: Mission, stepId: string) => {
    const newSteps = mission.steps.filter((s) => s._id !== stepId)
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ steps: newSteps }),
      })
      setMissions((m) => m.map((x) => (x._id === missionId ? data.mission : x)))
    } catch (err: any) {
      showToast(err.message || t('projB.page.error'), 'error')
    }
  }

  const handleStepDescUpdate = async (missionId: string, mission: Mission, stepId: string, description: string) => {
    const newSteps = mission.steps.map((s) => (s._id === stepId ? { ...s, description } : s))
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ steps: newSteps }),
      })
      setMissions((m) => m.map((x) => (x._id === missionId ? data.mission : x)))
    } catch {
      showToast(t('shell.error.actionFailed'), 'error')
      setMissionFormVersion((version) => version + 1)
    }
  }

  const handleRequestReview = async (missionId: string, stepId: string) => {
    try {
      const data = await apiFetch<{ mission: Mission }>(
        `/api/admin/internal-projects/${id}/missions/${missionId}/request-review`,
        {
          method: 'POST',
          body: JSON.stringify({ stepId }),
        },
      )
      setMissions((m) => m.map((x) => (x._id === missionId ? data.mission : x)))
      showToast(t('projB.page.reviewRequested'), 'success')
    } catch (err: any) {
      showToast(err.message || t('projB.page.error'), 'error')
    }
  }

  const handleValidateStep = async (missionId: string, stepId: string) => {
    try {
      const data = await apiFetch<{ mission: Mission }>(
        `/api/admin/internal-projects/${id}/missions/${missionId}/validate-step`,
        {
          method: 'POST',
          body: JSON.stringify({ stepId }),
        },
      )
      setMissions((m) => m.map((x) => (x._id === missionId ? data.mission : x)))
      showToast(t('projB.page.stepValidated'), 'success')
    } catch (err: any) {
      showToast(err.message || t('projB.page.error'), 'error')
    }
  }

  const handleParticipantUpdate = async (
    missionId: string,
    userId: string,
    fields: { progress?: number; status?: string; blocked?: boolean; blockedReason?: string },
  ) => {
    try {
      const data = await apiFetch<{ mission: Mission }>(
        `/api/admin/internal-projects/${id}/missions/${missionId}/my-progress`,
        {
          method: 'PATCH',
          body: JSON.stringify({ userId, ...fields }),
        },
      )
      setMissions((ms) => ms.map((x) => (x._id === missionId ? data.mission : x)))
    } catch {
      showToast(t('shell.error.actionFailed'), 'error')
      setMissionFormVersion((version) => version + 1)
    }
  }

  const handleDeliverableAdd = async (missionId: string, mission: Mission) => {
    const input = deliverableInputs[missionId]
    if (!input?.title?.trim()) return
    const newDeliv: any = { title: input.title.trim(), description: input.description || '', done: false }
    if (input.assignedTo) newDeliv.assignedTo = input.assignedTo
    const newDeliverables = [...(mission.deliverables || []), newDeliv]
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ deliverables: newDeliverables }),
      })
      setMissions((ms) => ms.map((x) => (x._id === missionId ? data.mission : x)))
      setDeliverableInputs((s) => ({ ...s, [missionId]: { title: '', description: '', assignedTo: '' } }))
    } catch {
      showToast(t('shell.error.actionFailed'), 'error')
    }
  }

  const handleDeliverableToggle = async (missionId: string, mission: Mission, delivId: string) => {
    const newDeliverables = (mission.deliverables || []).map((d) => (d._id === delivId ? { ...d, done: !d.done } : d))
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ deliverables: newDeliverables }),
      })
      setMissions((ms) => ms.map((x) => (x._id === missionId ? data.mission : x)))
    } catch {
      showToast(t('shell.error.actionFailed'), 'error')
    }
  }

  const handleDeliverableDelete = async (missionId: string, mission: Mission, delivId: string) => {
    const newDeliverables = (mission.deliverables || []).filter((d) => d._id !== delivId)
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ deliverables: newDeliverables }),
      })
      setMissions((ms) => ms.map((x) => (x._id === missionId ? data.mission : x)))
    } catch {
      showToast(t('shell.error.actionFailed'), 'error')
    }
  }

  const handleProgressUpdate = async (missionId: string, progress: number) => {
    try {
      await apiFetch(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ progress }),
      })
      setMissions((ms) => ms.map((x) => (x._id === missionId ? { ...x, progress } : x)))
    } catch {
      showToast(t('shell.error.actionFailed'), 'error')
      setMissionFormVersion((version) => version + 1)
    }
  }

  const handleUploadFile = async (missionId: string, file: File) => {
    setUploadingFile((u) => ({ ...u, [missionId]: true }))
    const formData = new FormData()
    formData.append('file', file)
    try {
      await apiUpload(`/api/admin/internal-projects/${id}/missions/${missionId}/files`, formData)
      await loadMissions()
      showToast(t('projB.page.fileAdded'), 'success')
    } catch (err: any) {
      showToast(err.message || t('projB.page.error'), 'error')
    } finally {
      setUploadingFile((u) => ({ ...u, [missionId]: false }))
    }
  }

  const handleDeleteFile = async (missionId: string, fileId: string) => {
    try {
      await apiFetch(`/api/admin/internal-projects/${id}/missions/${missionId}/files/${fileId}`, { method: 'DELETE' })
      setMissions((m) =>
        m.map((x) => (x._id === missionId ? { ...x, files: x.files.filter((f) => f._id !== fileId) } : x)),
      )
      showToast(t('projB.page.fileDeleted'), 'success')
    } catch (err: any) {
      showToast(err.message || t('projB.page.error'), 'error')
    }
  }

  if (loading) return <LoadingState />

  if (!project)
    return projectError ? (
      <div role="alert" className="portal-container">
        <p>{t('shell.error.loadFailed')}</p>
        <button type="button" onClick={loadProject}>
          {t('shell.error.retry')}
        </button>
      </div>
    ) : (
      <NotFoundState />
    )

  const sc = STATUS_COLORS[project.status] || STATUS_COLORS.ARCHIVE

  const STATUS_RANK: Record<string, number> = { A_FAIRE: 0, EN_COURS: 1, TERMINE: 2 }
  const displayMissions = missions
    .filter((m) => filterStatus === 'ALL' || m.status === filterStatus)
    .filter((m) => filterAssignee === 'ALL' || (m.assignedTo || []).some((a) => a._id === filterAssignee))
    .slice()
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'title':
          return a.title.localeCompare(b.title) * dir
        case 'status':
          return ((STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0)) * dir
        case 'progress':
          return ((a.progress ?? 0) - (b.progress ?? 0)) * dir
        case 'steps': {
          const ra = (a.steps?.length ?? 0) ? a.steps.filter((s) => s.done).length / a.steps.length : 0
          const rb = (b.steps?.length ?? 0) ? b.steps.filter((s) => s.done).length / b.steps.length : 0
          return (ra - rb) * dir
        }
        case 'assignee': {
          const na = (a.assignedTo || [])[0]?.name || ''
          const nb = (b.assignedTo || [])[0]?.name || ''
          return na.localeCompare(nb) * dir
        }
        case 'dueDate': {
          const ta = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
          const tb = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
          return (ta - tb) * dir
        }
        default:
          return 0
      }
    })

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  const renderMissionDetail = (mission: Mission) => (
    <MissionDetail
      key={`${mission._id}-${missionFormVersion}`}
      projectId={id}
      mission={mission}
      isSuperAdmin={isSuperAdmin}
      currentUserId={user?._id}
      onProgressUpdate={handleProgressUpdate}
      onParticipantUpdate={handleParticipantUpdate}
      expandedStep={expandedStep}
      setExpandedStep={setExpandedStep}
      stepInputs={stepInputs}
      setStepInputs={setStepInputs}
      stepAssigneeInputs={stepAssigneeInputs}
      setStepAssigneeInputs={setStepAssigneeInputs}
      onToggleStep={handleToggleStep}
      onAddStep={handleAddStep}
      onDeleteStep={handleDeleteStep}
      onStepDescriptionUpdate={handleStepDescUpdate}
      onRequestReview={handleRequestReview}
      onValidateStep={handleValidateStep}
      deliverableInputs={deliverableInputs}
      setDeliverableInputs={setDeliverableInputs}
      onAddDeliverable={handleDeliverableAdd}
      onToggleDeliverable={handleDeliverableToggle}
      onDeleteDeliverable={handleDeliverableDelete}
      onFileInputRef={(missionId, input) => {
        fileInputRefs.current[missionId] = input
      }}
      onSelectFile={(missionId) => fileInputRefs.current[missionId]?.click()}
      uploadingFile={uploadingFile}
      onUploadFile={handleUploadFile}
      onDeleteFile={handleDeleteFile}
      onMissionStatusChange={handleMissionStatus}
      onDeleteMission={handleDeleteMission}
    />
  )

  return (
    <div className="portal-container production-page production-internal-detail">
      {(projectError || missionsError) && (
        <div role="alert">
          <p>{t('shell.error.loadFailed')}</p>
          <button
            type="button"
            onClick={() => {
              if (projectError) void loadProject()
              if (missionsError) void loadMissions()
            }}
          >
            {t('shell.error.retry')}
          </button>
        </div>
      )}
      <div className="portal-card">
        <PageHeader
          eyebrow={t('shell.navItem.internalProjects')}
          title={project.name}
          subtitle={
            <>
              {
                <span
                  className="production-summary"
                  style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 'var(--r-sm)',
                      background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                      color: 'var(--primary)',
                    }}
                  >
                    {project.entity}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 'var(--r-sm)',
                      background: sc.bg,
                      border: `1px solid ${sc.border}`,
                      color: sc.text,
                    }}
                  >
                    {STATUS_LABEL_KEYS[project.status] ? t(STATUS_LABEL_KEYS[project.status]) : project.status}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: PRIORITY_COLORS[project.priority] || 'var(--text-secondary)',
                    }}
                  >
                    ●{' '}
                    {PRIORITY_LABEL_KEYS[project.priority]
                      ? t(PRIORITY_LABEL_KEYS[project.priority])
                      : project.priority.charAt(0) + project.priority.slice(1).toLowerCase()}
                  </span>
                </span>
              }
              {project.description && <span className="production-description">{project.description}</span>}
            </>
          }
          actions={
            <div className="admin-actions portal-actions-reveal">
              <Link className="portal-button secondary" to="/admin/projets/internes">
                {t('projB.page.breadcrumbProjects')}
              </Link>
              <Link
                className="portal-button secondary portal-action-link"
                to={`/admin/projets/internes?edit=${project._id}`}
              >
                <span className="portal-action-label">{t('common.edit')}</span>
              </Link>
              {isSuperAdmin && (
                <button
                  className="portal-button secondary portal-action-link"
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  style={{
                    color: 'var(--critical)',
                    borderColor: 'color-mix(in srgb, var(--critical) 30%, transparent)',
                  }}
                >
                  <span className="portal-action-label">{t('common.delete')}</span>
                </button>
              )}
            </div>
          }
        />

        <MetaInfo project={project} />

        {/* Quick status change */}
        <StatusSelector
          current={editStatus}
          saving={savingStatus}
          statusLabelKeys={STATUS_LABEL_KEYS}
          statusColors={STATUS_COLORS}
          onChange={handleStatusChange}
        />
      </div>

      {/* Tab bar */}
      <div className="production-tabs">
        <button
          onClick={() => setActiveTab('overview')}
          className={`production-tab ${activeTab === 'overview' ? 'active' : ''}`}
          aria-pressed={activeTab === 'overview'}
        >
          {t('projB.page.tabOverview')}
        </button>
        <button
          onClick={() => setActiveTab('missions')}
          className={`production-tab ${activeTab === 'missions' ? 'active' : ''}`}
          aria-pressed={activeTab === 'missions'}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
          </svg>
          {t('projB.page.tabMissions')}
          {missions.length > 0 && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 'var(--r-md)',
                background:
                  activeTab === 'missions'
                    ? 'color-mix(in srgb, var(--warning) 25%, transparent)'
                    : 'color-mix(in srgb, var(--warning) 12%, transparent)',
                color:
                  activeTab === 'missions' ? 'var(--warning)' : 'color-mix(in srgb, var(--warning) 60%, transparent)',
              }}
            >
              {missions.length}
            </span>
          )}
        </button>
      </div>

      {/* ─── TAB: VUE D'ENSEMBLE ─── */}
      {activeTab === 'overview' && (
        <OverviewTab project={project} missions={missions} onGoToMissions={() => setActiveTab('missions')} />
      )}

      {/* ─── TAB: MISSIONS ─── */}
      {activeTab === 'missions' && !missionsError && (
        <MissionsTab
          project={project}
          missions={missions}
          missionsLoading={missionsLoading}
          isAdminRole={isAdminRole}
          showMissionForm={showMissionForm}
          setShowMissionForm={setShowMissionForm}
          missionForm={missionForm}
          setMissionForm={setMissionForm}
          savingMission={savingMission}
          onCreateMission={handleCreateMission}
          missionView={missionView}
          setMissionView={setMissionView}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterAssignee={filterAssignee}
          setFilterAssignee={setFilterAssignee}
          sortArrow={sortArrow}
          toggleSort={toggleSort}
          sortKey={sortKey}
          displayMissions={displayMissions}
          selectedMission={selectedMission}
          setSelectedMission={setSelectedMission}
          renderMissionDetail={renderMissionDetail}
        />
      )}

      <ConfirmModal
        isOpen={deleteOpen}
        title={t('projB.page.deleteTitle')}
        message={t('projB.page.deleteMessage', { name: project.name })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  )
}
