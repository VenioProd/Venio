import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch, getToken } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import ConfirmModal from '@/components/ConfirmModal'
import { PlusIcon, ArrowRightIcon, TargetIcon } from '@/components/icons/inline-icons'
import {
  ARROW_SECTION_LABELS as _ARROW_SECTION_LABELS, // re-exported for type-checking only
  DEFAULT_ARROW_PILOTAGE,
  ENTITIES,
  STATUS_LABELS,
  emptyProjectForm,
  type ArrowPilotage,
  type ArrowPilotageSection,
  type Member,
  type Mission,
  type Project,
  type ProjectFormState,
} from './internal-projects/_components/constants'
import ArrowPilotageTab from './internal-projects/_components/ArrowPilotageTab'
import CreateMissionModal, {
  type MissionFormState,
} from './internal-projects/_components/CreateMissionModal'
import EditArrowPilotageModal from './internal-projects/_components/EditArrowPilotageModal'
import MissionDetailDrawer from './internal-projects/_components/MissionDetailDrawer'
import MissionsTab from './internal-projects/_components/MissionsTab'
import ProjectCard from './internal-projects/_components/ProjectCard'
import ProjectFormCard from './internal-projects/_components/ProjectFormCard'
import { useMissionActions } from './internal-projects/_components/useMissionActions'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

// Tiny re-export so external callers referencing this constant still resolve
// even if they had been importing it from this module previously.
export const ARROW_SECTION_LABELS = _ARROW_SECTION_LABELS

export default function InternalProjectList() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const [viewTab, setViewTab] = useState<'arrow' | 'projects' | 'missions'>('arrow')

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterEntity, setFilterEntity] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ProjectFormState>({ ...emptyProjectForm })
  const [saving, setSaving] = useState(false)
  const [admins, setAdmins] = useState<Member[]>([])
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Project | null>(null)

  // Missions state
  const [missions, setMissions] = useState<Mission[]>([])
  const [missionsLoading, setMissionsLoading] = useState(false)
  const [selectedMission, setSelectedMission] = useState<string | null>(null)
  const [missionStepInputs, setMissionStepInputs] = useState<Record<string, string>>({})
  const [stepAssigneeInputs, setStepAssigneeInputs] = useState<Record<string, string>>({})
  const [deliverableInputs, setDeliverableInputs] = useState<
    Record<string, { title: string; description: string; assignedTo: string }>
  >({})
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [showMissionForm, setShowMissionForm] = useState(false)
  const [missionForm, setMissionForm] = useState<MissionFormState>({
    projectId: '',
    title: '',
    description: '',
    assignedTo: [],
    dueDate: '',
  })
  const [savingMission, setSavingMission] = useState(false)
  const [arrowPilotage, setArrowPilotage] = useState<ArrowPilotage>(DEFAULT_ARROW_PILOTAGE)
  const [editingArrowSection, setEditingArrowSection] = useState<ArrowPilotageSection | null>(null)
  const [arrowSectionDraft, setArrowSectionDraft] = useState('')
  const [savingArrowPilotage, setSavingArrowPilotage] = useState(false)

  const loadArrowPilotage = useCallback(async () => {
    try {
      const data = await apiFetch<Partial<ArrowPilotage>>('/api/admin/arrow-pilotage')
      setArrowPilotage({
        goals: Array.isArray(data.goals) ? data.goals : DEFAULT_ARROW_PILOTAGE.goals,
        scorecard: Array.isArray(data.scorecard) ? data.scorecard : DEFAULT_ARROW_PILOTAGE.scorecard,
        decisions: Array.isArray(data.decisions) ? data.decisions : DEFAULT_ARROW_PILOTAGE.decisions,
        cadence: Array.isArray(data.cadence) ? data.cadence : DEFAULT_ARROW_PILOTAGE.cadence,
      })
    } catch {
      showToast('Pilotage Arrow indisponible pour le moment', 'error')
    }
  }, [showToast])

  useEffect(() => {
    loadArrowPilotage()
  }, [loadArrowPilotage])

  const openArrowSectionEditor = (section: ArrowPilotageSection) => {
    setEditingArrowSection(section)
    setArrowSectionDraft(arrowPilotage[section].join('\n'))
  }

  const saveArrowSection = async () => {
    if (!editingArrowSection) return
    const lines = arrowSectionDraft.split('\n').map(line => line.trim()).filter(Boolean)
    setSavingArrowPilotage(true)
    try {
      const data = await apiFetch<Partial<ArrowPilotage>>('/api/admin/arrow-pilotage', {
        method: 'PATCH',
        body: JSON.stringify({ section: editingArrowSection, values: lines }),
      })
      setArrowPilotage({
        goals: Array.isArray(data.goals) ? data.goals : DEFAULT_ARROW_PILOTAGE.goals,
        scorecard: Array.isArray(data.scorecard) ? data.scorecard : DEFAULT_ARROW_PILOTAGE.scorecard,
        decisions: Array.isArray(data.decisions) ? data.decisions : DEFAULT_ARROW_PILOTAGE.decisions,
        cadence: Array.isArray(data.cadence) ? data.cadence : DEFAULT_ARROW_PILOTAGE.cadence,
      })
      setEditingArrowSection(null)
      setArrowSectionDraft('')
      showToast('Section Arrow mise à jour', 'success')
    } catch {
      showToast('Impossible d’enregistrer la section Arrow', 'error')
    } finally {
      setSavingArrowPilotage(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus !== 'all') params.set('status', filterStatus)
      if (filterEntity !== 'all') params.set('entity', filterEntity)
      const data = await apiFetch<{ projects: Project[] }>(`/api/admin/internal-projects?${params}`)
      setProjects(data.projects || [])
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterEntity])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    apiFetch<{ users: Member[] }>('/api/admin/admins')
      .then(d => setAdmins(d.users || []))
      .catch(() => {})
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      showToast('Le nom est requis', 'error')
      return
    }
    setSaving(true)
    try {
      const body = {
        ...form,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      }
      if (editTarget) {
        await apiFetch(`/api/admin/internal-projects/${editTarget._id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        })
        showToast('Projet mis à jour', 'success')
      } else {
        await apiFetch('/api/admin/internal-projects', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        showToast('Projet créé', 'success')
      }
      setShowForm(false)
      setEditTarget(null)
      setForm({ ...emptyProjectForm })
      load()
    } catch (err: any) {
      showToast(err.message || 'Erreur', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (p: Project) => {
    setEditTarget(p)
    setForm({
      name: p.name,
      description: p.description,
      entity: p.entity,
      poles: p.poles,
      members: p.members.map(m => m._id),
      status: p.status,
      priority: p.priority,
      startDate: p.startDate ? p.startDate.slice(0, 10) : '',
      endDate: p.endDate ? p.endDate.slice(0, 10) : '',
      tags: p.tags.join(', '),
    })
    setShowForm(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await apiFetch(`/api/admin/internal-projects/${deleteTarget}`, { method: 'DELETE' })
      showToast('Projet supprimé', 'success')
      setDeleteTarget(null)
      load()
    } catch (err: any) {
      showToast(err.message || 'Erreur', 'error')
    }
  }

  const togglePole = (pole: string) => {
    setForm(f => ({
      ...f,
      poles: f.poles.includes(pole) ? f.poles.filter(p => p !== pole) : [...f.poles, pole],
    }))
  }
  const toggleMember = (id: string) => {
    setForm(f => ({
      ...f,
      members: f.members.includes(id) ? f.members.filter(m => m !== id) : [...f.members, id],
    }))
  }

  useEffect(() => {
    if (viewTab !== 'missions' && viewTab !== 'arrow') return
    setMissionsLoading(true)
    apiFetch<{ missions: Mission[] }>('/api/admin/internal-projects/missions')
      .then(d => setMissions(d.missions || []))
      .catch(() => {})
      .finally(() => setMissionsLoading(false))
  }, [viewTab])

  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!missionForm.projectId) { showToast('Sélectionne un projet', 'error'); return }
    if (!missionForm.title.trim()) { showToast('Le titre est requis', 'error'); return }
    if (missionForm.assignedTo.length === 0) {
      showToast('Assigne la mission à au moins une personne', 'error'); return
    }
    setSavingMission(true)
    try {
      const data = await apiFetch<{ mission: Mission }>(
        `/api/admin/internal-projects/${missionForm.projectId}/missions`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: missionForm.title.trim(),
            description: missionForm.description,
            assignedTo: missionForm.assignedTo,
            dueDate: missionForm.dueDate || null,
          }),
        },
      )
      setMissions(ms => [data.mission, ...ms])
      setShowMissionForm(false)
      setMissionForm({ projectId: '', title: '', description: '', assignedTo: [], dueDate: '' })
      showToast('Mission créée', 'success')
    } catch (err: any) {
      showToast(err.message || 'Erreur', 'error')
    } finally {
      setSavingMission(false)
    }
  }

  const {
    uploadingMission,
    handleParticipantUpdate,
    handleStepDescUpdate,
    handleMissionStatusUpdate,
    handleMissionToggleStep,
    handleMissionAddStep,
    handleMissionFileUpload,
    handleMissionFileDelete,
    handleMissionFileOpen,
    handleDeliverableAdd,
    handleDeliverableToggle,
    handleDeliverableDelete,
    handleMissionProgressUpdate,
    handleMissionDateUpdate,
  } = useMissionActions({
    setMissions,
    setMissionStepInputs,
    setStepAssigneeInputs,
    setDeliverableInputs,
    deliverableInputs,
  })

  const filtered = projects.filter(
    p =>
      (filterStatus === 'all' || p.status === filterStatus) &&
      (filterEntity === 'all' || p.entity === filterEntity),
  )

  const arrowProjects = projects.filter(p => p.entity === 'Arrow')
  const arrowMissions = missions.filter(m => m.internalProject?.entity === 'Arrow')
  const arrowActiveProjects = arrowProjects.filter(
    p => p.status !== 'TERMINE' && p.status !== 'ARCHIVE',
  )
  const arrowBlockedMissions = arrowMissions.filter(m =>
    (m.participants || []).some(p => p.blocked),
  )
  const arrowCompletedMissions = arrowMissions.filter(m => m.status === 'TERMINE')
  const arrowAverageProgress =
    arrowMissions.length > 0
      ? Math.round(
          arrowMissions.reduce((sum, mission) => sum + (mission.progress ?? 0), 0) /
            arrowMissions.length,
        )
      : 0
  const arrowUpcomingMissions = [...arrowMissions]
    .filter(m => m.status !== 'TERMINE')
    .sort((a, b) => {
      const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER
      const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER
      return aDate - bDate
    })
    .slice(0, 4)
  const arrowMissionsByStatus = [
    { value: 'A_FAIRE', label: 'À faire', color: '#fde047' },
    { value: 'EN_COURS', label: 'En cours', color: '#38bdf8' },
    { value: 'TERMINE', label: 'Terminé', color: '#6ee7b7' },
  ].map(status => ({ ...status, missions: arrowMissions.filter(m => m.status === status.value) }))
  const arrowScorecardStates = [
    arrowProjects.length > 0,
    arrowMissions.length > 0,
    arrowBlockedMissions.length === 0,
    arrowMissions.some(m => (m.deliverables || []).length > 0),
  ]
  const arrowDecisions = arrowPilotage.decisions.map(line => {
    const [date = '', title = '', decision = '', owner = ''] = line
      .split('|')
      .map(part => part.trim())
    return { date, title, decision, owner }
  })
  const arrowCadence = arrowPilotage.cadence.map(line => {
    const [title = '', text = ''] = line.split('|').map(part => part.trim())
    return { title, text }
  })

  const selectedMissionObj = selectedMission
    ? missions.find(x => x._id === selectedMission) ?? null
    : null

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Projets internes</span>
        </div>
        <div className="admin-header">
          <h1>Projets internes</h1>
          <div className="admin-actions portal-actions-reveal">
            <button
              className="portal-button portal-action-link"
              type="button"
              onClick={() => {
                setEditTarget(null)
                setForm({ ...emptyProjectForm })
                setShowForm(true)
              }}
            >
              <span className="portal-action-icon" aria-hidden>
                <PlusIcon size={undefined} strokeWidth={2} />
              </span>
              <span className="portal-action-label">Nouveau projet</span>
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
          <button
            onClick={() => setViewTab('arrow')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: `1px solid ${
                viewTab === 'arrow' ? 'rgba(139,92,246,0.55)' : 'rgba(139,92,246,0.24)'
              }`,
              background: viewTab === 'arrow' ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.04)',
              color: viewTab === 'arrow' ? '#c4b5fd' : 'rgba(196,181,253,0.62)',
              transition: 'all .15s',
            }}
          >
            <ArrowRightIcon size={13} />
            Pilotage Arrow
          </button>

          <button
            onClick={() => setViewTab('projects')}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: `1px solid ${
                viewTab === 'projects' ? 'rgba(14,165,233,0.45)' : 'rgba(255,255,255,0.1)'
              }`,
              background: viewTab === 'projects' ? 'rgba(14,165,233,0.1)' : 'transparent',
              color: viewTab === 'projects' ? '#38bdf8' : 'var(--text-secondary)',
              transition: 'all .15s',
            }}
          >
            Projets
          </button>

          <button
            onClick={() => setViewTab('missions')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: `1.5px solid ${
                viewTab === 'missions' ? 'rgba(234,179,8,0.6)' : 'rgba(234,179,8,0.28)'
              }`,
              background:
                viewTab === 'missions' ? 'rgba(234,179,8,0.12)' : 'rgba(234,179,8,0.04)',
              color: viewTab === 'missions' ? '#fde047' : 'rgba(253,224,71,0.55)',
              boxShadow: viewTab === 'missions' ? '0 0 10px rgba(234,179,8,0.12)' : 'none',
              transition: 'all .15s',
            }}
          >
            <TargetIcon size={13} />
            Missions internes
          </button>

          {viewTab === 'missions' && (
            <button
              onClick={() => setShowMissionForm(true)}
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: '1px solid rgba(16,185,129,0.4)',
                background: 'rgba(16,185,129,0.1)',
                color: '#6ee7b7',
                transition: 'all .15s',
              }}
            >
              <PlusIcon size={13} />
              Créer une mission
            </button>
          )}

          {viewTab === 'arrow' && (
            <button
              onClick={() => {
                setEditTarget(null)
                setForm({ ...emptyProjectForm, entity: 'Arrow', poles: ['Direction', 'Dev'] })
                setShowForm(true)
              }}
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: '1px solid rgba(139,92,246,0.38)',
                background: 'rgba(139,92,246,0.1)',
                color: '#c4b5fd',
                transition: 'all .15s',
              }}
            >
              <PlusIcon size={13} />
              Projet Arrow
            </button>
          )}
        </div>

        {/* Filters — only on projects tab */}
        {viewTab === 'projects' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="portal-input"
              style={{ minWidth: 140, fontSize: 13, padding: '6px 10px' }}
            >
              <option value="all">Tous les statuts</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select
              value={filterEntity}
              onChange={e => setFilterEntity(e.target.value)}
              className="portal-input"
              style={{ minWidth: 140, fontSize: 13, padding: '6px 10px' }}
            >
              <option value="all">Toutes entités</option>
              {ENTITIES.map(e => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <ProjectFormCard
        show={showForm}
        editTarget={editTarget}
        form={form}
        setForm={setForm}
        admins={admins}
        saving={saving}
        onSubmit={handleSave}
        onCancel={() => {
          setShowForm(false)
          setEditTarget(null)
          setForm({ ...emptyProjectForm })
        }}
        onTogglePole={togglePole}
        onToggleMember={toggleMember}
      />

      {/* ─── ARROW PILOTAGE TAB ─── */}
      {viewTab === 'arrow' && (
        <ArrowPilotageTab
          arrowPilotage={arrowPilotage}
          arrowProjects={arrowProjects}
          arrowMissions={arrowMissions}
          arrowActiveProjects={arrowActiveProjects}
          arrowBlockedMissions={arrowBlockedMissions}
          arrowCompletedMissions={arrowCompletedMissions}
          arrowAverageProgress={arrowAverageProgress}
          arrowUpcomingMissions={arrowUpcomingMissions}
          arrowMissionsByStatus={arrowMissionsByStatus}
          arrowScorecardStates={arrowScorecardStates}
          arrowDecisions={arrowDecisions}
          arrowCadence={arrowCadence}
          missionsLoading={missionsLoading}
          onOpenSectionEditor={openArrowSectionEditor}
          onSetFilterEntity={setFilterEntity}
          onSetFilterStatus={setFilterStatus}
          onSetViewTab={setViewTab}
          onShowMissionForm={() => setShowMissionForm(true)}
          onSelectMission={setSelectedMission}
        />
      )}

      {/* ─── MISSIONS TAB ─── */}
      {viewTab === 'missions' && (
        <MissionsTab
          missions={missions}
          missionsLoading={missionsLoading}
          isSuperAdmin={isSuperAdmin}
          selectedMission={selectedMission}
          uploadingMission={uploadingMission}
          fileInputRefs={fileInputRefs}
          onSelectMission={setSelectedMission}
          onStatusUpdate={handleMissionStatusUpdate}
          onProgressUpdate={handleMissionProgressUpdate}
          onFileUpload={handleMissionFileUpload}
        />
      )}

      {/* ─── PROJECTS TAB ─── */}
      {viewTab === 'projects' && (
        <div style={{ marginTop: 20 }}>
          {loading ? (
            <div className="portal-card">
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chargement...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="portal-card">
              <div className="admin-empty-state">
                <div className="admin-empty-state-icon">🏗️</div>
                <p className="admin-empty-state-text">Aucun projet interne</p>
              </div>
            </div>
          ) : (
            <div className="admin-cards-grid">
              {filtered.map(p => (
                <ProjectCard
                  key={p._id}
                  project={p}
                  isSuperAdmin={isSuperAdmin}
                  onOpen={id => navigate(`/admin/projets-internes/${id}`)}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <CreateMissionModal
        show={showMissionForm}
        projects={projects}
        admins={admins}
        missionForm={missionForm}
        setMissionForm={setMissionForm}
        savingMission={savingMission}
        onSubmit={handleCreateMission}
        onClose={() => setShowMissionForm(false)}
      />

      <EditArrowPilotageModal
        section={editingArrowSection}
        draft={arrowSectionDraft}
        saving={savingArrowPilotage}
        onChangeDraft={setArrowSectionDraft}
        onSave={saveArrowSection}
        onCancel={() => setEditingArrowSection(null)}
      />

      <MissionDetailDrawer
        mission={selectedMissionObj}
        currentUserId={user?._id}
        isSuperAdmin={isSuperAdmin}
        expandedStep={expandedStep}
        missionStepInputs={missionStepInputs}
        stepAssigneeInputs={stepAssigneeInputs}
        deliverableInputs={deliverableInputs}
        uploadingMission={uploadingMission}
        fileInputRefs={fileInputRefs}
        setExpandedStep={setExpandedStep}
        setMissionStepInputs={setMissionStepInputs}
        setStepAssigneeInputs={setStepAssigneeInputs}
        setDeliverableInputs={setDeliverableInputs}
        setMissions={setMissions}
        onClose={() => setSelectedMission(null)}
        onMissionStatusUpdate={handleMissionStatusUpdate}
        onProgressUpdate={handleMissionProgressUpdate}
        onParticipantUpdate={handleParticipantUpdate}
        onMissionToggleStep={handleMissionToggleStep}
        onMissionAddStep={handleMissionAddStep}
        onStepDescUpdate={handleStepDescUpdate}
        onDeliverableAdd={handleDeliverableAdd}
        onDeliverableToggle={handleDeliverableToggle}
        onDeliverableDelete={handleDeliverableDelete}
        onMissionFileUpload={handleMissionFileUpload}
        onMissionFileDelete={handleMissionFileDelete}
        onMissionFileOpen={handleMissionFileOpen}
        onMissionDateUpdate={handleMissionDateUpdate}
      />

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Supprimer le projet"
        message="Supprimer ce projet interne ? Cette action est irréversible."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
