import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import ConfirmModal from '../../components/ConfirmModal'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import { emptyForm, type Member, type Project } from './internal-project-list/types'
import ArrowSectionEditorModal from './internal-project-list/ArrowSectionEditorModal'
import ProjectFormDrawer from './internal-project-list/ProjectFormDrawer'
import MissionDetailDrawer from './internal-project-list/MissionDetailDrawer'
import MissionFormDrawer from './internal-project-list/MissionFormDrawer'
import ArrowTab from './internal-project-list/ArrowTab'
import MissionsTab from './internal-project-list/MissionsTab'
import { InternalProjectListProvider } from './internal-project-list/Context'
import ProjectsTab from './internal-project-list/ProjectsTab'
import { useMissions } from './internal-project-list/useMissions'

const ENTITIES = ['Venio', 'Creatio', 'Decisio', 'Formatio', 'Arrow']
const POLES = ['Dev', 'Design', 'Marketing', 'Communication', 'Commercial', 'Direction', 'RH', 'Formation']

const STATUS_LABELS: Record<string, string> = {
  EN_COURS: 'En cours',
  EN_ATTENTE: 'En attente',
  TERMINE: 'Terminé',
  ARCHIVE: 'Archivé',
}
const DEFAULT_ARROW_PILOTAGE = {
  goals: [
    'Valider le cas d’usage prioritaire avec 5 retours utilisateurs',
    'Stabiliser le workflow MVP de bout en bout',
    'Transformer les apprentissages en décisions produit',
  ],
  scorecard: [
    'Workflow principal cadré',
    'Missions de validation créées',
    'Blocages visibles',
    'Premiers livrables suivis',
  ],
  decisions: [
    'Cette semaine | Premier workflow Arrow | Concentrer le suivi sur un scénario utilisateur principal avant d’élargir. | Produit',
    'À trancher | Critère MVP | Définir le seuil minimum pour considérer le prototype testable. | Équipe',
    'À revoir | Cible prioritaire | Réévaluer après les premiers tests et objections récurrentes. | Direction',
  ],
  cadence: [
    'Lundi | Priorités, responsables, livrable attendu.',
    'Mercredi | Blocages, arbitrages, ajustements.',
    'Vendredi | Résultats, apprentissages, décisions.',
    'Règle | Chaque semaine livre un résultat ou un apprentissage validé.',
  ],
}

type ArrowPilotage = typeof DEFAULT_ARROW_PILOTAGE
type ArrowPilotageSection = keyof typeof DEFAULT_ARROW_PILOTAGE

const ARROW_SECTION_LABELS: Record<ArrowPilotageSection, string> = {
  goals: 'Objectif de la semaine',
  scorecard: 'Scorecard',
  decisions: 'Journal des décisions',
  cadence: 'Cadre de suivi',
}

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
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [admins, setAdmins] = useState<Member[]>([])
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Project | null>(null)

  const {
    missions,
    setMissions,
    missionsLoading,
    selectedMission,
    setSelectedMission,
    missionStepInputs,
    setMissionStepInputs,
    stepAssigneeInputs,
    setStepAssigneeInputs,
    deliverableInputs,
    setDeliverableInputs,
    expandedStep,
    setExpandedStep,
    uploadingMission,
    fileInputRefs,
    showMissionForm,
    setShowMissionForm,
    missionForm,
    setMissionForm,
    savingMission,
    handleParticipantUpdate,
    handleStepDescUpdate,
    handleCreateMission,
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
  } = useMissions({ viewTab, showToast })
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
    const lines = arrowSectionDraft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
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
      .then((d) => setAdmins(d.users || []))
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
        tags: form.tags
          ? form.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
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
        await apiFetch('/api/admin/internal-projects', { method: 'POST', body: JSON.stringify(body) })
        showToast('Projet créé', 'success')
      }
      setShowForm(false)
      setEditTarget(null)
      setForm({ ...emptyForm })
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
      members: p.members.map((m) => m._id),
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
    setForm((f) => ({ ...f, poles: f.poles.includes(pole) ? f.poles.filter((p) => p !== pole) : [...f.poles, pole] }))
  }
  const toggleMember = (id: string) => {
    setForm((f) => ({ ...f, members: f.members.includes(id) ? f.members.filter((m) => m !== id) : [...f.members, id] }))
  }

  const filtered = projects.filter(
    (p) =>
      (filterStatus === 'all' || p.status === filterStatus) && (filterEntity === 'all' || p.entity === filterEntity),
  )

  const arrowProjects = projects.filter((p) => p.entity === 'Arrow')
  const arrowMissions = missions.filter((m) => m.internalProject?.entity === 'Arrow')
  const arrowActiveProjects = arrowProjects.filter((p) => p.status !== 'TERMINE' && p.status !== 'ARCHIVE')
  const arrowBlockedMissions = arrowMissions.filter((m) => (m.participants || []).some((p) => p.blocked))
  const arrowCompletedMissions = arrowMissions.filter((m) => m.status === 'TERMINE')
  const arrowAverageProgress =
    arrowMissions.length > 0
      ? Math.round(arrowMissions.reduce((sum, mission) => sum + (mission.progress ?? 0), 0) / arrowMissions.length)
      : 0
  const arrowUpcomingMissions = [...arrowMissions]
    .filter((m) => m.status !== 'TERMINE')
    .sort((a, b) => {
      const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER
      const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER
      return aDate - bDate
    })
    .slice(0, 4)
  const arrowMissionsByStatus = [
    { value: 'A_FAIRE', label: 'À faire', color: '#fde047' },
    { value: 'EN_COURS', label: 'En cours', color: '#0ea5e9' },
    { value: 'TERMINE', label: 'Terminé', color: '#6ee7b7' },
  ].map((status) => ({
    ...status,
    missions: arrowMissions.filter((m) => m.status === status.value),
  }))
  const arrowScorecardStates = [
    arrowProjects.length > 0,
    arrowMissions.length > 0,
    arrowBlockedMissions.length === 0,
    arrowMissions.some((m) => (m.deliverables || []).length > 0),
  ]
  const arrowDecisions = arrowPilotage.decisions.map((line) => {
    const [date = '', title = '', decision = '', owner = ''] = line.split('|').map((part) => part.trim())
    return { date, title, decision, owner }
  })
  const arrowCadence = arrowPilotage.cadence.map((line) => {
    const [title = '', text = ''] = line.split('|').map((part) => part.trim())
    return { title, text }
  })

  const ctx = {
    viewTab,
    setViewTab,
    projects,
    filtered,
    loading,
    filterStatus,
    setFilterStatus,
    filterEntity,
    setFilterEntity,
    setDeleteTarget,
    setEditTarget,
    setForm,
    setShowForm,
    missions,
    missionsLoading,
    setSelectedMission,
    setShowMissionForm,
    setMissionForm,
    arrowPilotage,
    arrowScorecardStates,
    setArrowScorecardStates: () => {},
    openArrowSectionEditor,
    arrowActiveProjects,
    arrowMissions,
    arrowCompletedMissions,
    arrowBlockedMissions,
    arrowAverageProgress,
    arrowMissionsByStatus,
    arrowUpcomingMissions,
    arrowDecisions,
    arrowCadence,
    selectedMission,
    handleMissionStatusUpdate,
    handleMissionProgressUpdate,
    handleMissionFileUpload,
    fileInputRefs,
    uploadingMission,
    user,
    isSuperAdmin,
    isAdminRole: isSuperAdmin,
    admins,
    navigate,
    formatDateTime: (d: string) => new Date(d).toLocaleString('fr-FR'),
  }

  return (
    <InternalProjectListProvider value={ctx}>
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
                  setForm({ ...emptyForm })
                  setShowForm(true)
                }}
              >
                <span className="portal-action-icon" aria-hidden>
                  <svg
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    stroke="currentColor"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
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
                border: `1px solid ${viewTab === 'arrow' ? 'rgba(14, 165, 233, 0.55)' : 'rgba(14, 165, 233, 0.24)'}`,
                background: viewTab === 'arrow' ? 'rgba(14, 165, 233, 0.12)' : 'rgba(14, 165, 233, 0.04)',
                color: viewTab === 'arrow' ? 'var(--primary)' : 'rgba(14, 165, 233, 0.62)',
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
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
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
                border: `1px solid ${viewTab === 'projects' ? 'rgba(14, 165, 233, 0.45)' : 'rgba(255,255,255,0.1)'}`,
                background: viewTab === 'projects' ? 'rgba(14, 165, 233, 0.1)' : 'transparent',
                color: viewTab === 'projects' ? 'var(--primary)' : 'var(--text-secondary)',
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
                border: `1.5px solid ${viewTab === 'missions' ? 'rgba(234,179,8,0.6)' : 'rgba(234,179,8,0.28)'}`,
                background: viewTab === 'missions' ? 'rgba(234,179,8,0.12)' : 'rgba(234,179,8,0.04)',
                color: viewTab === 'missions' ? '#fde047' : 'rgba(253,224,71,0.55)',
                boxShadow: viewTab === 'missions' ? '0 0 10px rgba(234,179,8,0.12)' : 'none',
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
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Créer une mission
              </button>
            )}

            {viewTab === 'arrow' && (
              <button
                onClick={() => {
                  setEditTarget(null)
                  setForm({ ...emptyForm, entity: 'Arrow', poles: ['Direction', 'Dev'] })
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
                  border: '1px solid rgba(14, 165, 233, 0.38)',
                  background: 'rgba(14, 165, 233, 0.1)',
                  color: 'var(--primary)',
                  transition: 'all .15s',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Projet Arrow
              </button>
            )}
          </div>

          {/* Filters — only on projects tab */}
          {viewTab === 'projects' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
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
                onChange={(e) => setFilterEntity(e.target.value)}
                className="portal-input"
                style={{ minWidth: 140, fontSize: 13, padding: '6px 10px' }}
              >
                <option value="all">Toutes entités</option>
                {ENTITIES.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Create/Edit form */}
        {showForm && (
          <ProjectFormDrawer
            form={form}
            setForm={setForm}
            editTarget={editTarget}
            saving={saving}
            poles={POLES}
            admins={admins}
            togglePole={togglePole}
            toggleMember={toggleMember}
            onClose={() => setShowForm(false)}
            onSubmit={handleSave}
          />
        )}

        {/* ─── ARROW PILOTAGE TAB ─── */}
        {viewTab === 'arrow' && <ArrowTab />}

        {/* ─── MISSIONS TAB ─── */}
        {viewTab === 'missions' && <MissionsTab />}

        {/* ─── PROJECTS TAB ─── */}
        {viewTab === 'projects' && (
          <ProjectsTab
            loading={loading}
            projects={filtered}
            isSuperAdmin={isSuperAdmin}
            onOpenProject={(projectId) => navigate(`/admin/projets-internes/${projectId}`)}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
          />
        )}

        {/* ─── MODAL CRÉATION MISSION ─── */}
        {showMissionForm && (
          <MissionFormDrawer
            form={missionForm}
            setForm={setMissionForm}
            projects={projects}
            admins={admins}
            saving={savingMission}
            onClose={() => setShowMissionForm(false)}
            onSubmit={handleCreateMission}
          />
        )}

        {/* ─── MODAL ÉDITION PILOTAGE ARROW ─── */}
        {editingArrowSection && (
          <ArrowSectionEditorModal
            section={editingArrowSection}
            draft={arrowSectionDraft}
            setDraft={setArrowSectionDraft}
            defaults={DEFAULT_ARROW_PILOTAGE}
            labels={ARROW_SECTION_LABELS}
            saving={savingArrowPilotage}
            onClose={() => setEditingArrowSection(null)}
            onSave={saveArrowSection}
          />
        )}

        {/* ─── MISSION DETAIL DRAWER ─── */}
        {selectedMission && (
          <MissionDetailDrawer
            ctx={{
              missions,
              selectedMission,
              setSelectedMission,
              user,
              isSuperAdmin,
              expandedStep,
              setExpandedStep,
              stepAssigneeInputs,
              setStepAssigneeInputs,
              deliverableInputs,
              setDeliverableInputs,
              uploadingMission,
              fileInputRefs,
              missionStepInputs,
              setMissionStepInputs,
              handleParticipantUpdate,
              handleStepDescUpdate,
              handleMissionStatusUpdate,
              handleMissionToggleStep,
              handleMissionAddStep,
              handleMissionDateUpdate,
              handleDeliverableAdd,
              handleDeliverableToggle,
              handleDeliverableDelete,
              handleMissionFileUpload,
              handleMissionFileOpen,
              handleMissionFileDelete,
              handleMissionProgressUpdate,
              apiFetch,
              setMissions,
              showToast,
            }}
          />
        )}

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
    </InternalProjectListProvider>
  )
}
