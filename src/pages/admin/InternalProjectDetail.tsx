import { useState, useEffect, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { apiFetch, apiUpload } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import ConfirmModal from '../../components/ConfirmModal'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const STATUS_LABELS: Record<string, string> = {
  EN_COURS: 'En cours',
  EN_ATTENTE: 'En attente',
  TERMINE: 'Terminé',
  ARCHIVE: 'Archivé',
}
const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  EN_COURS: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)', text: '#6ee7b7' },
  EN_ATTENTE: { bg: 'rgba(234, 179, 8, 0.12)', border: 'rgba(234, 179, 8, 0.4)', text: '#fde047' },
  TERMINE: { bg: 'rgba(100, 116, 180, 0.12)', border: 'rgba(100, 116, 180, 0.35)', text: '#a5b4cf' },
  ARCHIVE: { bg: 'rgba(100, 100, 100, 0.12)', border: 'rgba(100, 100, 100, 0.35)', text: '#9ca3af' },
}
const PRIORITY_COLORS: Record<string, string> = {
  BASSE: '#6ee7b7',
  NORMALE: '#a5b4cf',
  HAUTE: '#fbbf24',
  URGENTE: '#f87171',
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
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const isAdminRole = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'RH'

  const [activeTab, setActiveTab] = useState<'overview' | 'missions'>('overview')
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    if (!id) return
    setLoading(true)
    apiFetch<{ project: Project }>(`/api/admin/internal-projects/${id}`)
      .then((d) => {
        setProject(d.project)
        setEditStatus(d.project.status)
      })
      .catch(() => showToast('Projet introuvable', 'error'))
      .finally(() => setLoading(false))

    apiFetch<{ missions: Mission[] }>(`/api/admin/internal-projects/${id}/missions`)
      .then((d) => setMissions(d.missions || []))
      .catch(() => {})
      .finally(() => setMissionsLoading(false))
  }, [id])

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
      showToast('Statut mis à jour', 'success')
    } catch (err: any) {
      showToast(err.message || 'Erreur', 'error')
    } finally {
      setSavingStatus(false)
    }
  }

  const handleDelete = async () => {
    if (!project) return
    try {
      await apiFetch(`/api/admin/internal-projects/${project._id}`, { method: 'DELETE' })
      showToast('Projet supprimé', 'success')
      navigate('/admin/projets-internes')
    } catch (err: any) {
      showToast(err.message || 'Erreur', 'error')
    }
  }

  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!missionForm.title.trim()) {
      showToast('Le titre est requis', 'error')
      return
    }
    if (missionForm.assignedTo.length === 0) {
      showToast('Assigne la mission à au moins une personne', 'error')
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
      showToast('Mission créée', 'success')
    } catch (err: any) {
      showToast(err.message || 'Erreur', 'error')
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
      showToast(err.message || 'Erreur', 'error')
    }
  }

  const handleDeleteMission = async (missionId: string) => {
    try {
      await apiFetch(`/api/admin/internal-projects/${id}/missions/${missionId}`, { method: 'DELETE' })
      setMissions((m) => m.filter((x) => x._id !== missionId))
      if (selectedMission === missionId) setSelectedMission(null)
      showToast('Mission supprimée', 'success')
    } catch (err: any) {
      showToast(err.message || 'Erreur', 'error')
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
      showToast(err.message || 'Erreur', 'error')
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
      showToast(err.message || 'Erreur', 'error')
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
      showToast(err.message || 'Erreur', 'error')
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
      /* silent */
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
      showToast('Vérification demandée au Super Admin', 'success')
    } catch (err: any) {
      showToast(err.message || 'Erreur', 'error')
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
      showToast('Étape validée', 'success')
    } catch (err: any) {
      showToast(err.message || 'Erreur', 'error')
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
      /* silent */
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
      /* silent */
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
      /* silent */
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
      /* silent */
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
      /* silent */
    }
  }

  const handleUploadFile = async (missionId: string, file: File) => {
    setUploadingFile((u) => ({ ...u, [missionId]: true }))
    const formData = new FormData()
    formData.append('file', file)
    try {
      await apiUpload(`/api/admin/internal-projects/${id}/missions/${missionId}/files`, formData)
      const updated = await apiFetch<{ missions: Mission[] }>(`/api/admin/internal-projects/${id}/missions`)
      setMissions(updated.missions || [])
      showToast('Fichier ajouté', 'success')
    } catch (err: any) {
      showToast(err.message || 'Erreur', 'error')
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
      showToast('Fichier supprimé', 'success')
    } catch (err: any) {
      showToast(err.message || 'Erreur', 'error')
    }
  }

  if (loading) return <LoadingState />

  if (!project) return <NotFoundState />

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
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <Link to="/admin/projets-internes">Projets internes</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>{project.name}</span>
        </div>

        <div className="admin-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'rgba(14, 165, 233, 0.12)',
                  border: '1px solid rgba(14, 165, 233, 0.3)',
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
                  borderRadius: 4,
                  background: sc.bg,
                  border: `1px solid ${sc.border}`,
                  color: sc.text,
                }}
              >
                {STATUS_LABELS[project.status] || project.status}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: PRIORITY_COLORS[project.priority] || 'var(--text-secondary)',
                }}
              >
                ● {project.priority.charAt(0) + project.priority.slice(1).toLowerCase()}
              </span>
            </div>
            <h1 style={{ marginBottom: 6 }}>{project.name}</h1>
            {project.description && (
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 600 }}>
                {project.description}
              </p>
            )}
          </div>
          <div className="admin-actions portal-actions-reveal">
            <Link
              className="portal-button secondary portal-action-link"
              to={`/admin/projets-internes?edit=${project._id}`}
            >
              <span className="portal-action-label">Modifier</span>
            </Link>
            {isSuperAdmin && (
              <button
                className="portal-button secondary portal-action-link"
                type="button"
                onClick={() => setDeleteOpen(true)}
                style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
              >
                <span className="portal-action-label">Supprimer</span>
              </button>
            )}
          </div>
        </div>

        <MetaInfo project={project} />

        {/* Quick status change */}
        <StatusSelector
          current={editStatus}
          saving={savingStatus}
          statusLabels={STATUS_LABELS}
          statusColors={STATUS_COLORS}
          onChange={handleStatusChange}
        />
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
        <button
          onClick={() => setActiveTab('overview')}
          style={{
            padding: '7px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            border: `1px solid ${activeTab === 'overview' ? 'rgba(14, 165, 233, 0.45)' : 'rgba(255,255,255,0.1)'}`,
            background: activeTab === 'overview' ? 'rgba(14, 165, 233, 0.1)' : 'transparent',
            color: activeTab === 'overview' ? 'var(--primary)' : 'var(--text-secondary)',
            transition: 'all .15s',
          }}
        >
          Vue d'ensemble
        </button>
        <button
          onClick={() => setActiveTab('missions')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            border: `1.5px solid ${activeTab === 'missions' ? 'rgba(234,179,8,0.6)' : 'rgba(234,179,8,0.28)'}`,
            background: activeTab === 'missions' ? 'rgba(234,179,8,0.12)' : 'rgba(234,179,8,0.04)',
            color: activeTab === 'missions' ? '#fde047' : 'rgba(253,224,71,0.55)',
            boxShadow: activeTab === 'missions' ? '0 0 10px rgba(234,179,8,0.12)' : 'none',
            transition: 'all .15s',
          }}
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
          Missions internes
          {missions.length > 0 && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 10,
                background: activeTab === 'missions' ? 'rgba(234,179,8,0.25)' : 'rgba(234,179,8,0.12)',
                color: activeTab === 'missions' ? '#fde047' : 'rgba(253,224,71,0.6)',
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
      {activeTab === 'missions' && (
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
        title="Supprimer le projet"
        message={`Supprimer "${project.name}" ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  )
}
