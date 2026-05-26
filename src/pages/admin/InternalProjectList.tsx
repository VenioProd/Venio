import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch, getToken } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import ConfirmModal from '../../components/ConfirmModal'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import { getErrorMessage } from '../../lib/errors'

const ENTITIES = ['Venio', 'Creatio', 'Decisio', 'Formatio', 'Arrow']
const POLES = ['Dev', 'Design', 'Marketing', 'Communication', 'Commercial', 'Direction', 'RH', 'Formation']

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

interface Member { _id: string; name: string; email: string; role: string }

interface Mission {
  _id: string; title: string; description: string; status: string; dueDate: string | null
  progress: number
  assignedTo: { _id: string; name: string; email: string }[]
  internalProject: { _id: string; name: string; entity: string }
  participants: { _id: string; user: { _id: string; name: string; email: string }; progress: number; status: string; blocked: boolean; blockedReason: string }[]
  steps: { _id: string; title: string; description: string; done: boolean; waitingReview: boolean; assignedTo?: string }[]
  deliverables: { _id: string; title: string; description: string; done: boolean; assignedTo?: string }[]
  files: { _id: string; originalName: string; mimeType: string; size: number }[]
  createdAt: string
}

interface Project {
  _id: string
  name: string
  description: string
  entity: string
  poles: string[]
  members: Member[]
  status: string
  priority: string
  startDate: string | null
  endDate: string | null
  tags: string[]
  createdBy: { name: string }
}

const emptyForm = {
  name: '',
  description: '',
  entity: 'Venio',
  poles: [] as string[],
  members: [] as string[],
  status: 'EN_COURS',
  priority: 'NORMALE',
  startDate: '',
  endDate: '',
  tags: '',
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

  // Missions state
  const [missions, setMissions] = useState<Mission[]>([])
  const [missionsLoading, setMissionsLoading] = useState(false)
  const [selectedMission, setSelectedMission] = useState<string | null>(null)
  const [missionStepInputs, setMissionStepInputs] = useState<Record<string, string>>({})
  const [stepAssigneeInputs, setStepAssigneeInputs] = useState<Record<string, string>>({})
  const [deliverableInputs, setDeliverableInputs] = useState<Record<string, { title: string; description: string; assignedTo: string }>>({})
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  // useState supprimé : stepDescInputs / setStepDescInputs jamais utilisés (cleanup TS noUnusedLocals)

  const [uploadingMission, setUploadingMission] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [showMissionForm, setShowMissionForm] = useState(false)
  const [missionForm, setMissionForm] = useState({ projectId: '', title: '', description: '', assignedTo: [] as string[], dueDate: '' })
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
    } catch { /* silent */ } finally { setLoading(false) }
  }, [filterStatus, filterEntity])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    apiFetch<{ users: Member[] }>('/api/admin/admins').then(d => setAdmins(d.users || [])).catch(() => {})
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { showToast('Le nom est requis', 'error'); return }
    setSaving(true)
    try {
      const body = {
        ...form,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      }
      if (editTarget) {
        await apiFetch(`/api/admin/internal-projects/${editTarget._id}`, { method: 'PATCH', body: JSON.stringify(body) })
        showToast('Projet mis à jour', 'success')
      } else {
        await apiFetch('/api/admin/internal-projects', { method: 'POST', body: JSON.stringify(body) })
        showToast('Projet créé', 'success')
      }
      setShowForm(false)
      setEditTarget(null)
      setForm({ ...emptyForm })
      load()
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Erreur'), 'error')
    } finally { setSaving(false) }
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
    } catch (err: unknown) { showToast(getErrorMessage(err, 'Erreur'), 'error') }
  }

  const togglePole = (pole: string) => {
    setForm(f => ({ ...f, poles: f.poles.includes(pole) ? f.poles.filter(p => p !== pole) : [...f.poles, pole] }))
  }
  const toggleMember = (id: string) => {
    setForm(f => ({ ...f, members: f.members.includes(id) ? f.members.filter(m => m !== id) : [...f.members, id] }))
  }

  useEffect(() => {
    if (viewTab !== 'missions' && viewTab !== 'arrow') return
    setMissionsLoading(true)
    apiFetch<{ missions: Mission[] }>('/api/admin/internal-projects/missions')
      .then(d => setMissions(d.missions || []))
      .catch(() => {})
      .finally(() => setMissionsLoading(false))
  }, [viewTab])

  const handleParticipantUpdate = async (missionId: string, projectId: string, userId: string, fields: { progress?: number; status?: string; blocked?: boolean; blockedReason?: string }) => {
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${projectId}/missions/${missionId}/my-progress`, {
        method: 'PATCH', body: JSON.stringify({ userId, ...fields }),
      })
      setMissions(ms => ms.map(x => x._id === missionId ? { ...data.mission, internalProject: x.internalProject } : x))
    } catch { /* silent */ }
  }

  const handleStepDescUpdate = async (missionId: string, projectId: string, mission: Mission, stepId: string, description: string) => {
    const newSteps = mission.steps.map(s => s._id === stepId ? { ...s, description } : s)
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ steps: newSteps }),
      })
      setMissions(ms => ms.map(x => x._id === missionId ? data.mission : x))
    } catch { /* silent */ }
  }

  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!missionForm.projectId) { showToast('Sélectionne un projet', 'error'); return }
    if (!missionForm.title.trim()) { showToast('Le titre est requis', 'error'); return }
    if (missionForm.assignedTo.length === 0) { showToast('Assigne la mission à au moins une personne', 'error'); return }
    setSavingMission(true)
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${missionForm.projectId}/missions`, {
        method: 'POST',
        body: JSON.stringify({
          title: missionForm.title.trim(),
          description: missionForm.description,
          assignedTo: missionForm.assignedTo,
          dueDate: missionForm.dueDate || null,
        }),
      })
      setMissions(ms => [data.mission, ...ms])
      setShowMissionForm(false)
      setMissionForm({ projectId: '', title: '', description: '', assignedTo: [], dueDate: '' })
      showToast('Mission créée', 'success')
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Erreur'), 'error')
    } finally {
      setSavingMission(false)
    }
  }

  const handleMissionStatusUpdate = async (missionId: string, projectId: string, status: string) => {
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      })
      setMissions(m => m.map(x => x._id === missionId ? { ...x, status: data.mission.status } : x))
    } catch { /* silent */ }
  }

  const handleMissionToggleStep = async (missionId: string, projectId: string, mission: Mission, stepId: string) => {
    const newSteps = mission.steps.map(s => s._id === stepId ? { ...s, done: !s.done } : s)
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ steps: newSteps }),
      })
      setMissions(m => m.map(x => x._id === missionId ? data.mission : x))
    } catch { /* silent */ }
  }

  const handleMissionAddStep = async (missionId: string, projectId: string, mission: Mission, title: string, assignedTo?: string) => {
    const newStep: any = { title, done: false }
    if (assignedTo) newStep.assignedTo = assignedTo
    const newSteps = [...mission.steps, newStep]
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ steps: newSteps }),
      })
      setMissions(m => m.map(x => x._id === missionId ? data.mission : x))
      setMissionStepInputs(s => ({ ...s, [missionId]: '' }))
      setStepAssigneeInputs(s => ({ ...s, [missionId]: '' }))
    } catch { /* silent */ }
  }

  const handleMissionFileUpload = async (missionId: string, projectId: string, file: File) => {
    setUploadingMission(missionId)
    const token = getToken() || ''
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch(`/api/admin/internal-projects/${projectId}/missions/${missionId}/files`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      })
      const data = await res.json()
      setMissions(m => m.map(x => x._id === missionId ? { ...x, files: data.mission?.files ?? x.files } : x))
    } catch { /* silent */ } finally { setUploadingMission(null) }
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
      window.open(URL.createObjectURL(blob), '_blank')
    } catch { /* silent */ }
  }

  const handleDeliverableAdd = async (missionId: string, projectId: string, mission: Mission) => {
    const input = deliverableInputs[missionId]
    if (!input?.title?.trim()) return
    const newDeliverable: any = { title: input.title.trim(), description: input.description || '', done: false }
    if (input.assignedTo) newDeliverable.assignedTo = input.assignedTo
    const newDeliverables = [...(mission.deliverables || []), newDeliverable]
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ deliverables: newDeliverables }),
      })
      setMissions(ms => ms.map(x => x._id === missionId ? data.mission : x))
      setDeliverableInputs(s => ({ ...s, [missionId]: { title: '', description: '', assignedTo: '' } }))
    } catch { /* silent */ }
  }

  const handleDeliverableToggle = async (missionId: string, projectId: string, mission: Mission, delivId: string) => {
    const newDeliverables = (mission.deliverables || []).map(d => d._id === delivId ? { ...d, done: !d.done } : d)
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ deliverables: newDeliverables }),
      })
      setMissions(ms => ms.map(x => x._id === missionId ? data.mission : x))
    } catch { /* silent */ }
  }

  const handleDeliverableDelete = async (missionId: string, projectId: string, mission: Mission, delivId: string) => {
    const newDeliverables = (mission.deliverables || []).filter(d => d._id !== delivId)
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ deliverables: newDeliverables }),
      })
      setMissions(ms => ms.map(x => x._id === missionId ? data.mission : x))
    } catch { /* silent */ }
  }

  const handleMissionProgressUpdate = async (missionId: string, projectId: string, progress: number) => {
    try {
      await apiFetch(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ progress }),
      })
      setMissions(ms => ms.map(x => x._id === missionId ? { ...x, progress } : x))
    } catch { /* silent */ }
  }

  const handleMissionDateUpdate = async (missionId: string, projectId: string, dueDate: string) => {
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ dueDate: dueDate || null }),
      })
      setMissions(m => m.map(x => x._id === missionId ? data.mission : x))
    } catch { /* silent */ }
  }

  const filtered = projects.filter(p =>
    (filterStatus === 'all' || p.status === filterStatus) &&
    (filterEntity === 'all' || p.entity === filterEntity)
  )

  const arrowProjects = projects.filter(p => p.entity === 'Arrow')
  const arrowMissions = missions.filter(m => m.internalProject?.entity === 'Arrow')
  const arrowActiveProjects = arrowProjects.filter(p => p.status !== 'TERMINE' && p.status !== 'ARCHIVE')
  const arrowBlockedMissions = arrowMissions.filter(m => (m.participants || []).some(p => p.blocked))
  const arrowCompletedMissions = arrowMissions.filter(m => m.status === 'TERMINE')
  const arrowAverageProgress = arrowMissions.length > 0
    ? Math.round(arrowMissions.reduce((sum, mission) => sum + (mission.progress ?? 0), 0) / arrowMissions.length)
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
  ].map(status => ({
    ...status,
    missions: arrowMissions.filter(m => m.status === status.value),
  }))
  const arrowScorecardStates = [
    arrowProjects.length > 0,
    arrowMissions.length > 0,
    arrowBlockedMissions.length === 0,
    arrowMissions.some(m => (m.deliverables || []).length > 0),
  ]
  const arrowDecisions = arrowPilotage.decisions.map(line => {
    const [date = '', title = '', decision = '', owner = ''] = line.split('|').map(part => part.trim())
    return { date, title, decision, owner }
  })
  const arrowCadence = arrowPilotage.cadence.map(line => {
    const [title = '', text = ''] = line.split('|').map(part => part.trim())
    return { title, text }
  })

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
              onClick={() => { setEditTarget(null); setForm({ ...emptyForm }); setShowForm(true) }}
            >
              <span className="portal-action-icon" aria-hidden>
                <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
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
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${viewTab === 'arrow' ? 'rgba(139,92,246,0.55)' : 'rgba(139,92,246,0.24)'}`,
              background: viewTab === 'arrow' ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.04)',
              color: viewTab === 'arrow' ? '#c4b5fd' : 'rgba(196,181,253,0.62)',
              transition: 'all .15s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
            Pilotage Arrow
          </button>

          <button
            onClick={() => setViewTab('projects')}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${viewTab === 'projects' ? 'rgba(14,165,233,0.45)' : 'rgba(255,255,255,0.1)'}`,
              background: viewTab === 'projects' ? 'rgba(14,165,233,0.1)' : 'transparent',
              color: viewTab === 'projects' ? '#38bdf8' : 'var(--text-secondary)',
              transition: 'all .15s',
            }}
          >Projets</button>

          <button
            onClick={() => setViewTab('missions')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1.5px solid ${viewTab === 'missions' ? 'rgba(234,179,8,0.6)' : 'rgba(234,179,8,0.28)'}`,
              background: viewTab === 'missions' ? 'rgba(234,179,8,0.12)' : 'rgba(234,179,8,0.04)',
              color: viewTab === 'missions' ? '#fde047' : 'rgba(253,224,71,0.55)',
              boxShadow: viewTab === 'missions' ? '0 0 10px rgba(234,179,8,0.12)' : 'none',
              transition: 'all .15s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
            </svg>
            Missions internes
          </button>

          {viewTab === 'missions' && (
            <button
              onClick={() => setShowMissionForm(true)}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.1)', color: '#6ee7b7', transition: 'all .15s' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Créer une mission
            </button>
          )}

          {viewTab === 'arrow' && (
            <button
              onClick={() => { setEditTarget(null); setForm({ ...emptyForm, entity: 'Arrow', poles: ['Direction', 'Dev'] }); setShowForm(true) }}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(139,92,246,0.38)', background: 'rgba(139,92,246,0.1)', color: '#c4b5fd', transition: 'all .15s' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
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
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select
              value={filterEntity}
              onChange={e => setFilterEntity(e.target.value)}
              className="portal-input"
              style={{ minWidth: 140, fontSize: 13, padding: '6px 10px' }}
            >
              <option value="all">Toutes entités</option>
              {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div className="portal-card" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
            {editTarget ? 'Modifier le projet' : 'Nouveau projet interne'}
          </h2>
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="portal-label">Nom du projet *</label>
                <input className="portal-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Plateforme Arrow" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="portal-label">Description</label>
                <textarea className="portal-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ resize: 'vertical' }} placeholder="Objectif, contexte..." />
              </div>
              <div>
                <label className="portal-label">Entité</label>
                <select className="portal-input" value={form.entity} onChange={e => setForm(f => ({ ...f, entity: e.target.value }))}>
                  {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="portal-label">Statut</label>
                <select className="portal-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="portal-label">Priorité</label>
                <select className="portal-input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="BASSE">Basse</option>
                  <option value="NORMALE">Normale</option>
                  <option value="HAUTE">Haute</option>
                  <option value="URGENTE">Urgente</option>
                </select>
              </div>
              <div>
                <label className="portal-label">Tags (virgule)</label>
                <input className="portal-input" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="design, refonte, v2..." />
              </div>
              {/* Poles */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="portal-label">Pôles concernés</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {POLES.map(pole => (
                    <button
                      key={pole}
                      type="button"
                      onClick={() => togglePole(pole)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 20,
                        border: '1px solid',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                        background: form.poles.includes(pole) ? 'rgba(14, 165, 233, 0.2)' : 'transparent',
                        borderColor: form.poles.includes(pole) ? '#0ea5e9' : 'var(--border)',
                        color: form.poles.includes(pole) ? '#38bdf8' : 'var(--text-secondary)',
                        transition: 'all .15s',
                      }}
                    >{pole}</button>
                  ))}
                </div>
              </div>
              {/* Members */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="portal-label">Membres assignés</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {admins.map(admin => (
                    <button
                      key={admin._id}
                      type="button"
                      onClick={() => toggleMember(admin._id)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 20,
                        border: '1px solid',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                        background: form.members.includes(admin._id) ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                        borderColor: form.members.includes(admin._id) ? '#10b981' : 'var(--border)',
                        color: form.members.includes(admin._id) ? '#6ee7b7' : 'var(--text-secondary)',
                        transition: 'all .15s',
                      }}
                    >{admin.name}</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="portal-button" type="submit" disabled={saving}>
                {saving ? 'Enregistrement...' : editTarget ? 'Mettre à jour' : 'Créer le projet'}
              </button>
              <button
                className="portal-button secondary"
                type="button"
                onClick={() => { setShowForm(false); setEditTarget(null); setForm({ ...emptyForm }) }}
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── ARROW PILOTAGE TAB ─── */}
      {viewTab === 'arrow' && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="portal-card" style={{ border: '1px solid rgba(139,92,246,0.18)', background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(14,165,233,0.04))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ maxWidth: 680 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: '#c4b5fd' }}>Pilotage interne</span>
                <h2 style={{ margin: '6px 0 8px', fontSize: 22, color: 'var(--text-primary)' }}>Arrow</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                  Suivre le cap, les avancées, les blocages et les apprentissages Arrow depuis les projets internes Venio.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="portal-button secondary"
                  type="button"
                  onClick={() => { setFilterEntity('Arrow'); setViewTab('projects') }}
                >
                  Voir les projets Arrow
                </button>
                <button
                  className="portal-button"
                  type="button"
                  onClick={() => setShowMissionForm(true)}
                >
                  Créer une mission
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: 12 }}>
            {[
              { label: 'Projets actifs', value: arrowActiveProjects.length, color: '#c4b5fd' },
              { label: 'Missions Arrow', value: arrowMissions.length, color: '#38bdf8' },
              { label: 'Terminées', value: arrowCompletedMissions.length, color: '#6ee7b7' },
              { label: 'Bloquées', value: arrowBlockedMissions.length, color: arrowBlockedMissions.length > 0 ? '#f87171' : '#a5b4cf' },
            ].map(card => (
              <button
                key={card.label}
                type="button"
                className="portal-card"
                onClick={() => {
                  if (card.label === 'Projets actifs') { setFilterEntity('Arrow'); setFilterStatus('EN_COURS'); setViewTab('projects'); return }
                  if (card.label === 'Terminées') { setFilterEntity('Arrow'); setFilterStatus('TERMINE'); setViewTab('projects'); return }
                  setViewTab('missions')
                }}
                style={{ padding: 16, textAlign: 'left', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 800, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: 11, color: 'rgba(165,180,207,0.45)', marginTop: 8 }}>Cliquer pour ouvrir</div>
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 18 }}>
            <div className="portal-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Objectif de la semaine</h3>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>Ce qui doit guider les décisions et les tâches Arrow.</p>
                </div>
                <button type="button" onClick={() => openArrowSectionEditor('goals')} style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)', background: 'rgba(56,189,248,0.08)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer' }}>Modifier · {arrowAverageProgress}% moyen</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {arrowPilotage.goals.map((goal, index) => (
                  <button key={`${goal}-${index}`} type="button" onClick={() => openArrowSectionEditor('goals')} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, background: index === 0 ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${index === 0 ? 'rgba(139,92,246,0.22)' : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: index === 0 ? 'rgba(139,92,246,0.14)' : 'rgba(165,180,207,0.08)', color: index === 0 ? '#c4b5fd' : '#a5b4cf', fontSize: 12, fontWeight: 700 }}>{index + 1}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45 }}>{goal}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="portal-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Scorecard</h3>
                <button type="button" onClick={() => openArrowSectionEditor('scorecard')} style={{ fontSize: 12, fontWeight: 700, color: '#c4b5fd', border: '1px solid rgba(196,181,253,0.25)', background: 'rgba(139,92,246,0.08)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer' }}>Modifier</button>
              </div>
              {arrowPilotage.scorecard.map((label, index) => {
                const state = arrowScorecardStates[index] ?? false
                return (
                <div key={`${label}-${index}`} onClick={() => index === 0 ? setViewTab('projects') : index === 1 ? setViewTab('missions') : openArrowSectionEditor('scorecard')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, color: state ? '#6ee7b7' : '#fbbf24', background: state ? 'rgba(16,185,129,0.1)' : 'rgba(251,191,36,0.1)', border: `1px solid ${state ? 'rgba(16,185,129,0.24)' : 'rgba(251,191,36,0.24)'}` }}>
                    {state ? 'OK' : 'À cadrer'}
                  </span>
                </div>
              )})}
            </div>
          </div>

          <div className="portal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Avancement opérationnel</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>Lecture rapide des missions Arrow par statut.</p>
              </div>
              {missionsLoading && <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Chargement...</span>}
            </div>
            {arrowMissions.length === 0 ? (
              <div style={{ padding: '26px 0', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 12px' }}>Aucune mission Arrow pour l’instant.</p>
                <button className="portal-button" type="button" onClick={() => setShowMissionForm(true)}>Créer la première mission</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 12 }}>
                {arrowMissionsByStatus.map(column => (
                  <div key={column.value} style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: column.color }}>{column.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{column.missions.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {column.missions.slice(0, 4).map(m => (
                        <button key={m._id} type="button" onClick={() => setSelectedMission(m._id)} style={{ width: '100%', textAlign: 'left', padding: '10px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                          <span style={{ display: 'block', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 5 }}>{m.title}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                              <span style={{ display: 'block', height: '100%', width: `${m.progress ?? 0}%`, background: column.color }} />
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.progress ?? 0}%</span>
                          </span>
                        </button>
                      ))}
                      {column.missions.length === 0 && <span style={{ fontSize: 13, color: 'rgba(165,180,207,0.35)', padding: '8px 0' }}>Vide</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div className="portal-card">
              <h3 style={{ margin: '0 0 14px', fontSize: 16, color: 'var(--text-primary)' }}>Prochaines actions</h3>
              {arrowUpcomingMissions.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Aucune action datée à suivre.</p>
              ) : arrowUpcomingMissions.map(m => {
                const isOverdue = m.dueDate && new Date(m.dueDate) < new Date()
                return (
                  <button key={m._id} type="button" onClick={() => setSelectedMission(m._id)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '10px 0', border: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                    <span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{m.title}</span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{m.internalProject?.name}</span>
                    </span>
                    <span style={{ fontSize: 12, color: isOverdue ? '#f87171' : '#a5b4cf', whiteSpace: 'nowrap' }}>
                      {m.dueDate ? new Date(m.dueDate).toLocaleDateString('fr-FR') : 'Sans date'}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="portal-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Journal des décisions</h3>
                <button type="button" onClick={() => openArrowSectionEditor('decisions')} style={{ fontSize: 12, fontWeight: 700, color: '#c4b5fd', border: '1px solid rgba(196,181,253,0.25)', background: 'rgba(139,92,246,0.08)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer' }}>Modifier</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {arrowDecisions.map((item, index) => (
                  <button key={`${item.title}-${index}`} type="button" onClick={() => openArrowSectionEditor('decisions')} style={{ padding: '11px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#c4b5fd' }}>{item.title}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.date}</span>
                    </div>
                    <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45 }}>{item.decision}</p>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Responsable : {item.owner}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="portal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Cadre de suivi</h3>
              <button type="button" onClick={() => openArrowSectionEditor('cadence')} style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)', background: 'rgba(56,189,248,0.08)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer' }}>Modifier</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', gap: 10 }}>
              {arrowCadence.map((item, index) => (
                <button key={`${item.title}-${index}`} type="button" onClick={() => openArrowSectionEditor('cadence')} style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', marginBottom: 5 }}>{item.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{item.text}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── MISSIONS TAB ─── */}
      {viewTab === 'missions' && (
        <div style={{ marginTop: 20 }}>

          {/* Récap par assigné — super admin only */}
          {isSuperAdmin && missions.length > 0 && (() => {
            const byAssignee = new Map<string, { name: string; total: number; done: number; avgProgress: number; blockedCount: number; missions: Mission[] }>()
            missions.forEach(m => {
              (m.assignedTo || []).forEach(a => {
                if (!byAssignee.has(a._id)) byAssignee.set(a._id, { name: a.name, total: 0, done: 0, avgProgress: 0, blockedCount: 0, missions: [] })
                const entry = byAssignee.get(a._id)!
                entry.total++
                if (m.status === 'TERMINE') entry.done++
                const participant = (m.participants || []).find(p => p.user?._id === a._id)
                if (participant?.blocked) entry.blockedCount++
                entry.missions.push(m)
              })
            })
            byAssignee.forEach(entry => {
              entry.avgProgress = Math.round(entry.missions.reduce((sum, m) => sum + (m.progress ?? 0), 0) / entry.missions.length)
            })
            return (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                {Array.from(byAssignee.entries()).map(([id, entry]) => (
                  <div key={id} style={{ flex: '1 1 160px', minWidth: 160, padding: '14px 16px', borderRadius: 10, background: entry.blockedCount > 0 ? 'rgba(248,113,113,0.04)' : 'rgba(255,255,255,0.03)', border: `1px solid ${entry.blockedCount > 0 ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.07)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: entry.blockedCount > 0 ? 'rgba(248,113,113,0.15)' : 'rgba(165,180,207,0.12)', border: `1px solid ${entry.blockedCount > 0 ? 'rgba(248,113,113,0.35)' : 'rgba(165,180,207,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: entry.blockedCount > 0 ? '#f87171' : '#a5b4cf', flexShrink: 0 }}>
                        {entry.name[0]?.toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{entry.name}</span>
                      {entry.blockedCount > 0 && <span style={{ fontSize: 10, color: '#f87171', flexShrink: 0 }}>🚫</span>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{entry.done}/{entry.total} terminées</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: entry.avgProgress === 100 ? '#6ee7b7' : '#38bdf8' }}>{entry.avgProgress}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: entry.avgProgress === 100 ? '#10b981' : '#38bdf8', width: `${entry.avgProgress}%`, transition: 'width .3s' }} />
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

          {missionsLoading ? (
            <div className="portal-card"><p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chargement...</p></div>
          ) : missions.length === 0 ? (
            <div className="portal-card">
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
                <div style={{ fontSize: 32, marginBottom: 10, opacity: .4 }}>◎</div>
                Aucune mission pour l'instant
              </div>
            </div>
          ) : (
            <div className="portal-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {(['Projet', 'Mission', ...(isSuperAdmin ? ['Assigné à'] : []), 'Statut', 'Progression', 'Fichiers', 'Deadline', '']).map((h, i) => (
                      <th key={i} style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.6px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {missions.map(m => {
                    const statusBg: Record<string,string> = { A_FAIRE:'rgba(234,179,8,0.12)', EN_COURS:'rgba(14,165,233,0.12)', TERMINE:'rgba(16,185,129,0.12)' }
                    const statusBorder: Record<string,string> = { A_FAIRE:'rgba(234,179,8,0.3)', EN_COURS:'rgba(14,165,233,0.3)', TERMINE:'rgba(16,185,129,0.3)' }
                    const statusColor: Record<string,string> = { A_FAIRE:'#fde047', EN_COURS:'#38bdf8', TERMINE:'#6ee7b7' }
                    const statusLabel: Record<string,string> = { A_FAIRE:'À faire', EN_COURS:'En cours', TERMINE:'Terminée' }
                    const isOverdue = m.dueDate && m.status !== 'TERMINE' && new Date(m.dueDate) < new Date()
                    const doneCount = m.steps?.filter(s => s.done).length ?? 0
                    const totalSteps = m.steps?.length ?? 0
                    const reviewCount = (m.steps || []).filter(s => s.waitingReview && !s.done).length
                    const isSelected = selectedMission === m._id
                    return (
                      <>
                        <tr key={m._id}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: isSelected ? 'rgba(56,189,248,0.04)' : 'transparent', transition: 'background .15s' }}
                          onClick={() => setSelectedMission(m._id)}
                        >
                          <td style={{ padding: '11px 14px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>{m.internalProject?.name || '—'}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{m.internalProject?.entity}</div>
                          </td>
                          <td style={{ padding: '11px 14px', maxWidth: 220 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{m.title}</span>
                              {reviewCount > 0 && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 6, background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', color: '#fde047', whiteSpace: 'nowrap' }}>🔍 {reviewCount}</span>}
                            </div>
                            {m.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{m.description}</div>}
                          </td>
                          {isSuperAdmin && (
                            <td style={{ padding: '11px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                                {(m.assignedTo || []).map(a => (
                                  <div key={a._id} title={a.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(165,180,207,0.15)', border: '1px solid rgba(165,180,207,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#a5b4cf', flexShrink: 0 }}>
                                      {a.name?.[0]?.toUpperCase()}
                                    </div>
                                    {(m.assignedTo || []).length === 1 && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.name}</span>}
                                  </div>
                                ))}
                              </div>
                            </td>
                          )}
                          <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 20, color: statusColor[m.status] || '#a5b4cf', background: statusBg[m.status] || 'rgba(255,255,255,0.05)', border: `1px solid ${statusBorder[m.status] || 'rgba(255,255,255,0.1)'}`, whiteSpace: 'nowrap' }}>
                                {statusLabel[m.status] || m.status}
                              </span>
                              {(['A_FAIRE', 'EN_COURS', 'TERMINE'] as const).filter(v => v !== m.status).map(v => (
                                <button key={v} type="button" onClick={() => handleMissionStatusUpdate(m._id, m.internalProject?._id, v)}
                                  style={{ padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                  {statusLabel[v]}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '11px 14px', minWidth: 120 }} onClick={e => e.stopPropagation()}>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                {totalSteps > 0 && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{doneCount}/{totalSteps} étapes</span>}
                                <input
                                  type="number" min={0} max={100}
                                  defaultValue={m.progress ?? 0}
                                  onBlur={e => {
                                    const v = Math.min(100, Math.max(0, Number(e.target.value)))
                                    e.target.value = String(v)
                                    handleMissionProgressUpdate(m._id, m.internalProject?._id, v)
                                  }}
                                  onClick={e => e.stopPropagation()}
                                  style={{ width: 44, fontSize: 13, fontWeight: 700, padding: '2px 4px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: (m.progress ?? 0) === 100 ? '#6ee7b7' : '#38bdf8', textAlign: 'center', cursor: 'text', marginLeft: 'auto' }}
                                  title="Cliquer pour modifier la progression (%)"
                                />
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 2 }}>%</span>
                              </div>
                              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                                <div style={{ height: '100%', borderRadius: 2, background: (m.progress ?? 0) === 100 ? '#10b981' : '#38bdf8', width: `${m.progress ?? 0}%`, transition: 'width .3s' }} />
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {(m.files?.length ?? 0) > 0 && (
                                <span style={{ fontSize: 13, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                  {m.files.length}
                                </span>
                              )}
                              <input type="file" ref={el => { fileInputRefs.current[`col_${m._id}`] = el }} style={{ display: 'none' }}
                                onChange={async e => { const file = e.target.files?.[0]; if (file) await handleMissionFileUpload(m._id, m.internalProject?._id, file); e.target.value = '' }} />
                              <button type="button"
                                onClick={e => { e.stopPropagation(); fileInputRefs.current[`col_${m._id}`]?.click() }}
                                disabled={uploadingMission === m._id}
                                title="Joindre un fichier"
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(165,180,207,0.2)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                {uploadingMission === m._id ? '...' : '+ Fichier'}
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <span style={{ fontSize: 13, color: isOverdue ? '#f87171' : 'var(--text-secondary)', fontWeight: isOverdue ? 600 : 400 }}>
                              {isOverdue && '⚠ '}{m.dueDate ? new Date(m.dueDate).toLocaleDateString('fr-FR') : '—'}
                            </span>
                          </td>
                          <td style={{ padding: '11px 8px', textAlign: 'center' }}>
                            <span style={{ fontSize: 12, color: '#38bdf8', opacity: .5 }}>›</span>
                          </td>
                        </tr>
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── PROJECTS TAB ─── */}
      {viewTab === 'projects' && <div style={{ marginTop: 20 }}>
        {loading ? (
          <div className="portal-card"><p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chargement...</p></div>
        ) : filtered.length === 0 ? (
          <div className="portal-card">
            <div className="admin-empty-state">
              <div className="admin-empty-state-icon">🏗️</div>
              <p className="admin-empty-state-text">Aucun projet interne</p>
            </div>
          </div>
        ) : (
          <div className="admin-cards-grid">
            {filtered.map(p => {
              const sc = STATUS_COLORS[p.status] || STATUS_COLORS.ARCHIVE
              return (
                <div key={p._id} className="admin-member-card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/projets-internes/${p._id}`)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(14, 165, 233, 0.12)',
                        border: '1px solid rgba(14, 165, 233, 0.3)',
                        color: '#38bdf8',
                      }}
                    >{p.entity}</span>
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
                    >{STATUS_LABELS[p.status] || p.status}</span>
                  </div>
                  <h3 className="client-card-name" style={{ marginBottom: 4 }}>{p.name}</h3>
                  {p.description && (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                      {p.description}
                    </p>
                  )}
                  {/* Poles */}
                  {p.poles.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                      {p.poles.map(pole => (
                        <span key={pole} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 12, background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.3)', color: '#c4b5fd' }}>
                          {pole}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Members */}
                  {p.members.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                      {p.members.slice(0, 4).map(m => (
                        <span key={m._id} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 12, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#6ee7b7' }}>
                          {m.name.split(' ')[0]}
                        </span>
                      ))}
                      {p.members.length > 4 && (
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>+{p.members.length - 4}</span>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: PRIORITY_COLORS[p.priority] || 'var(--text-secondary)', fontWeight: 600 }}>
                      ● {p.priority.charAt(0) + p.priority.slice(1).toLowerCase()}
                    </span>
                    {p.endDate && (
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                        Fin : {new Date(p.endDate).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>
                  <div className="admin-card-actions" style={{ marginTop: 12 }} onClick={e => e.stopPropagation()}>
                    <button
                      className="admin-card-btn admin-card-btn--edit"
                      type="button"
                      onClick={() => openEdit(p)}
                    >Modifier</button>
                    {isSuperAdmin && (
                      <button
                        className="admin-card-btn admin-card-btn--delete"
                        type="button"
                        onClick={() => setDeleteTarget(p._id)}
                      >Supprimer</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>}

      {/* ─── MODAL CRÉATION MISSION ─── */}
      {showMissionForm && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1001, backdropFilter: 'blur(3px)' }}
            onClick={() => setShowMissionForm(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 480, maxWidth: '90vw', background: '#141824', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', zIndex: 1002, padding: '28px 28px 24px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Créer une mission</h3>
              <button onClick={() => setShowMissionForm(false)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            <form onSubmit={handleCreateMission} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="portal-label">Projet *</label>
                <select className="portal-input" value={missionForm.projectId} onChange={e => setMissionForm(f => ({ ...f, projectId: e.target.value }))} required style={{ width: '100%' }}>
                  <option value="">— Choisir un projet —</option>
                  {projects.map(p => <option key={p._id} value={p._id}>{p.entity} · {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="portal-label">Titre *</label>
                <input className="portal-input" value={missionForm.title} onChange={e => setMissionForm(f => ({ ...f, title: e.target.value }))} placeholder="Titre de la mission" required style={{ width: '100%' }} />
              </div>
              <div>
                <label className="portal-label">Description</label>
                <textarea className="portal-input" value={missionForm.description} onChange={e => setMissionForm(f => ({ ...f, description: e.target.value }))} placeholder="Détails, contexte…" rows={3} style={{ width: '100%', resize: 'vertical' }} />
              </div>
              <div>
                <label className="portal-label">Assigner à * <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 11 }}>(plusieurs possibles)</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {admins.map(a => {
                    const selected = missionForm.assignedTo.includes(a._id)
                    return (
                      <button key={a._id} type="button"
                        onClick={() => setMissionForm(f => ({ ...f, assignedTo: selected ? f.assignedTo.filter(id => id !== a._id) : [...f.assignedTo, a._id] }))}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, border: `1px solid ${selected ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'}`, background: selected ? 'rgba(16,185,129,0.12)' : 'transparent', color: selected ? '#6ee7b7' : 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', transition: 'all .15s' }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: selected ? 'rgba(16,185,129,0.2)' : 'rgba(165,180,207,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{a.name[0]?.toUpperCase()}</div>
                        {a.name}
                        {selected && <span style={{ fontSize: 10 }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
                {missionForm.assignedTo.length > 0 && (
                  <div style={{ fontSize: 11, color: '#6ee7b7', marginTop: 5 }}>{missionForm.assignedTo.length} personne{missionForm.assignedTo.length > 1 ? 's' : ''} sélectionnée{missionForm.assignedTo.length > 1 ? 's' : ''}</div>
                )}
              </div>
              <div>
                <label className="portal-label">Deadline (optionnel)</label>
                <input type="date" className="portal-input" value={missionForm.dueDate} onChange={e => setMissionForm(f => ({ ...f, dueDate: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button className="portal-button" type="submit" disabled={savingMission} style={{ flex: 1 }}>
                  {savingMission ? 'Création...' : 'Créer la mission'}
                </button>
                <button className="portal-button secondary" type="button" onClick={() => setShowMissionForm(false)}>Annuler</button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ─── MODAL ÉDITION PILOTAGE ARROW ─── */}
      {editingArrowSection && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1001, backdropFilter: 'blur(3px)' }}
            onClick={() => setEditingArrowSection(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 640, maxWidth: '92vw', background: '#141824', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', zIndex: 1002, padding: '26px 28px 24px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Modifier · {ARROW_SECTION_LABELS[editingArrowSection]}</h3>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  Une ligne par élément. Décisions : date | titre | décision | responsable. Cadre : titre | contenu.
                </p>
              </div>
              <button onClick={() => setEditingArrowSection(null)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}>X</button>
            </div>
            <textarea
              className="portal-input"
              value={arrowSectionDraft}
              onChange={e => setArrowSectionDraft(e.target.value)}
              rows={editingArrowSection === 'goals' ? 7 : 10}
              style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', fontSize: 13, lineHeight: 1.55 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 14, alignItems: 'center' }}>
              <button
                className="portal-button secondary"
                type="button"
                onClick={() => setArrowSectionDraft(DEFAULT_ARROW_PILOTAGE[editingArrowSection].join('\n'))}
              >
                Restaurer le modèle
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="portal-button secondary" type="button" onClick={() => setEditingArrowSection(null)}>Annuler</button>
                <button className="portal-button" type="button" onClick={saveArrowSection} disabled={savingArrowPilotage}>
                  {savingArrowPilotage ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── MISSION DETAIL DRAWER ─── */}
      {selectedMission && (() => {
        const m = missions.find(x => x._id === selectedMission)
        if (!m) return null
        const SL: Record<string,string> = { A_FAIRE:'À faire', EN_COURS:'En cours', TERMINE:'Terminée' }
        const SC: Record<string,string> = { A_FAIRE:'#fde047', EN_COURS:'#38bdf8', TERMINE:'#6ee7b7' }
        const SBg: Record<string,string> = { A_FAIRE:'rgba(234,179,8,0.12)', EN_COURS:'rgba(14,165,233,0.12)', TERMINE:'rgba(16,185,129,0.12)' }
        const SBo: Record<string,string> = { A_FAIRE:'rgba(234,179,8,0.3)', EN_COURS:'rgba(14,165,233,0.3)', TERMINE:'rgba(16,185,129,0.3)' }
        const doneCount = m.steps?.filter(s => s.done).length ?? 0
        const totalSteps = m.steps?.length ?? 0
        const delivDone = (m.deliverables || []).filter(d => d.done).length
        const isOverdue = m.dueDate && m.status !== 'TERMINE' && new Date(m.dueDate) < new Date()


        const Section = ({ icon, title, badge, children }: { icon: string; title: string; badge?: React.ReactNode; children: React.ReactNode }) => (
          <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 14 }}>{icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--text-secondary)' }}>{title}</span>
              {badge}
            </div>
            {children}
          </div>
        )

        return (
          <>
            <div style={{ position: 'fixed', top: 90, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1001, backdropFilter: 'blur(3px)' }}
              onClick={() => setSelectedMission(null)} />
            <div style={{ position: 'fixed', top: 90, right: 0, bottom: 0, width: 560, background: '#0f1219', borderLeft: '1px solid rgba(255,255,255,0.07)', zIndex: 1002, overflowY: 'auto', display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(0,0,0,0.6)' }}>

              {/* ── HEADER ── */}
              <div style={{ padding: '22px 24px 18px', background: 'linear-gradient(180deg, rgba(14,165,233,0.06) 0%, transparent 100%)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', color: '#38bdf8' }}>{m.internalProject?.entity}</span>
                      <span style={{ fontSize: 12, color: 'rgba(165,180,207,0.5)' }}>·</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.internalProject?.name}</span>
                      {isOverdue && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}>⚠ En retard</span>}
                    </div>
                    <h2 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.3 }}>{m.title}</h2>
                    {m.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{m.description}</p>}
                  </div>
                  <button onClick={() => setSelectedMission(null)}
                    style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>✕</button>
                </div>

                {/* Statut global + deadline */}
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, color: SC[m.status], background: SBg[m.status], border: `1px solid ${SBo[m.status]}` }}>{SL[m.status]}</span>
                  {(['A_FAIRE','EN_COURS','TERMINE'] as const).filter(v => v !== m.status).map(v => (
                    <button key={v} type="button" onClick={() => handleMissionStatusUpdate(m._id, m.internalProject?._id, v)}
                      style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)', fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', transition: 'all .15s' }}>
                      {SL[v]}
                    </button>
                  ))}
                  {m.dueDate && (
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: isOverdue ? '#f87171' : 'var(--text-secondary)', fontWeight: isOverdue ? 600 : 400 }}>
                      📅 {new Date(m.dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>

              {/* ── PROGRESSION GLOBALE ── */}
              <Section icon="📊" title="Progression globale">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: (m.progress ?? 0) === 100 ? 'linear-gradient(90deg,#10b981,#6ee7b7)' : 'linear-gradient(90deg,#0ea5e9,#38bdf8)', width: `${m.progress ?? 0}%`, transition: 'width .4s' }} />
                  </div>
                  <input type="number" min={0} max={100} defaultValue={m.progress ?? 0} key={`${m._id}-${m.progress}`}
                    onBlur={e => { const v = Math.min(100,Math.max(0,Number(e.target.value))); e.target.value=String(v); handleMissionProgressUpdate(m._id, m.internalProject?._id, v) }}
                    style={{ width: 52, fontSize: 15, fontWeight: 700, padding: '3px 6px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: (m.progress??0)===100?'#6ee7b7':'#38bdf8', textAlign: 'center' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>%</span>
                </div>
                {totalSteps > 0 && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{doneCount}/{totalSteps} étapes · {(m.deliverables||[]).length > 0 && `${delivDone}/${(m.deliverables||[]).length} livrables`}</div>}
              </Section>

              {/* ── PROGRESSION INDIVIDUELLE ── */}
              {(m.participants || []).length > 0 && (() => {
                const avgProgress = Math.round((m.participants || []).reduce((s, p) => s + (p.progress ?? 0), 0) / m.participants.length)
                const blockedCount = (m.participants || []).filter(p => p.blocked).length
                return (
                  <Section icon="👥" title="Avancement par membre"
                    badge={blockedCount > 0 ? <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 8, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}>🚫 {blockedCount} bloqué{blockedCount > 1 ? 's' : ''}</span> : undefined}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(m.participants || []).map(p => {
                        const canEdit = isSuperAdmin || p.user?._id === user?._id
                        // Étapes assignées à cette personne
                        const mySteps = (m.steps || []).filter(s => s.assignedTo === p.user?._id)
                        const myStepsDone = mySteps.filter(s => s.done).length
                        // Étapes communes (non assignées)
                        const commonSteps = (m.steps || []).filter(s => !s.assignedTo)
                        const commonDone = commonSteps.filter(s => s.done).length
                        // Livrables assignés à cette personne
                        const myDelivs = (m.deliverables || []).filter(d => d.assignedTo === p.user?._id)
                        const myDelivsDone = myDelivs.filter(d => d.done).length
                        // Contribution inégale : 30+ points sous la moyenne
                        const isBehind = m.participants.length > 1 && (avgProgress - (p.progress ?? 0)) >= 30
                        // Couleur avatar selon état
                        const avatarBg = p.blocked ? 'rgba(248,113,113,0.15)' : p.status === 'TERMINE' ? 'rgba(16,185,129,0.15)' : p.user?._id === user?._id ? 'rgba(14,165,233,0.15)' : 'rgba(165,180,207,0.12)'
                        const avatarBorder = p.blocked ? 'rgba(248,113,113,0.4)' : p.status === 'TERMINE' ? 'rgba(16,185,129,0.4)' : p.user?._id === user?._id ? 'rgba(14,165,233,0.3)' : 'rgba(165,180,207,0.2)'
                        const avatarColor = p.blocked ? '#f87171' : p.status === 'TERMINE' ? '#6ee7b7' : p.user?._id === user?._id ? '#38bdf8' : '#a5b4cf'
                        const cardBorder = p.blocked ? 'rgba(248,113,113,0.25)' : isBehind ? 'rgba(251,191,36,0.2)' : p.user?._id === user?._id ? 'rgba(14,165,233,0.15)' : 'rgba(255,255,255,0.05)'
                        const cardBg = p.blocked ? 'rgba(248,113,113,0.04)' : p.user?._id === user?._id ? 'rgba(14,165,233,0.05)' : 'rgba(255,255,255,0.02)'
                        const barColor = p.blocked ? '#f87171' : p.progress === 100 ? '#10b981' : p.user?._id === user?._id ? '#38bdf8' : '#a5b4cf'

                        return (
                          <div key={p._id} style={{ borderRadius: 10, background: cardBg, border: `1px solid ${cardBorder}`, overflow: 'hidden' }}>
                            <div style={{ padding: '12px 14px' }}>
                              {/* Ligne 1 : avatar + nom + badges */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: avatarBg, border: `1.5px solid ${avatarBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: avatarColor, flexShrink: 0 }}>
                                  {p.blocked ? '🚫' : p.user?.name?.[0]?.toUpperCase()}
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{p.user?.name}</span>
                                {p.user?._id === user?._id && <span style={{ fontSize: 10, color: '#38bdf8', background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: 8, padding: '1px 6px' }}>Moi</span>}
                                {p.blocked && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.35)', color: '#f87171', fontWeight: 600 }}>🚫 Bloqué</span>}
                                {!p.blocked && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, color: SC[p.status] || '#a5b4cf', background: SBg[p.status] || 'rgba(255,255,255,0.05)', border: `1px solid ${SBo[p.status] || 'rgba(255,255,255,0.1)'}` }}>{SL[p.status] || p.status}</span>}
                                {isBehind && !p.blocked && <span title="Contribution en retard sur le groupe" style={{ fontSize: 11, padding: '2px 6px', borderRadius: 8, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}>⚠ En retard</span>}
                              </div>

                              {/* Barre de progression + % */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', borderRadius: 3, background: barColor, width: `${p.progress ?? 0}%`, transition: 'width .3s' }} />
                                </div>
                                {canEdit ? (
                                  <input type="number" min={0} max={100} defaultValue={p.progress ?? 0} key={`${p._id}-${p.progress}`}
                                    onBlur={e => { const v = Math.min(100, Math.max(0, Number(e.target.value))); e.target.value = String(v); handleParticipantUpdate(m._id, m.internalProject?._id, p.user?._id, { progress: v }) }}
                                    style={{ width: 44, fontSize: 13, fontWeight: 700, padding: '2px 4px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: p.progress === 100 ? '#6ee7b7' : '#38bdf8', textAlign: 'center' }} />
                                ) : (
                                  <span style={{ fontSize: 13, fontWeight: 700, color: p.progress === 100 ? '#6ee7b7' : '#38bdf8', minWidth: 28, textAlign: 'right' }}>{p.progress ?? 0}</span>
                                )}
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>%</span>
                              </div>

                              {/* Étapes + livrables calculés */}
                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: canEdit ? 8 : 0 }}>
                                {mySteps.length > 0 && (
                                  <span style={{ fontSize: 11, color: myStepsDone === mySteps.length ? '#6ee7b7' : 'var(--text-secondary)', background: myStepsDone === mySteps.length ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '2px 7px', border: `1px solid ${myStepsDone === mySteps.length ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                                    ✅ {myStepsDone}/{mySteps.length} étapes perso
                                  </span>
                                )}
                                {commonSteps.length > 0 && (
                                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '2px 7px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    {commonDone}/{commonSteps.length} communes
                                  </span>
                                )}
                                {myDelivs.length > 0 && (
                                  <span style={{ fontSize: 11, color: myDelivsDone === myDelivs.length ? '#c4b5fd' : 'var(--text-secondary)', background: myDelivsDone === myDelivs.length ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '2px 7px', border: `1px solid ${myDelivsDone === myDelivs.length ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                                    📦 {myDelivsDone}/{myDelivs.length} livrables
                                  </span>
                                )}
                                {mySteps.length === 0 && commonSteps.length === 0 && myDelivs.length === 0 && (m.steps || []).length === 0 && (
                                  <span style={{ fontSize: 11, color: 'rgba(165,180,207,0.35)', fontStyle: 'italic' }}>Aucune étape définie</span>
                                )}
                              </div>

                              {/* Boutons statut */}
                              {canEdit && (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {(['A_FAIRE', 'EN_COURS', 'TERMINE'] as const).map(v => (
                                    <button key={v} type="button" onClick={() => handleParticipantUpdate(m._id, m.internalProject?._id, p.user?._id, { status: v })}
                                      style={{ padding: '3px 9px', borderRadius: 12, border: `1px solid ${p.status === v ? SBo[v] : 'rgba(255,255,255,0.08)'}`, background: p.status === v ? SBg[v] : 'transparent', color: p.status === v ? SC[v] : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontWeight: p.status === v ? 600 : 400, transition: 'all .15s' }}>
                                      {SL[v]}
                                    </button>
                                  ))}
                                  {/* Bouton Bloqué */}
                                  <button type="button" onClick={() => handleParticipantUpdate(m._id, m.internalProject?._id, p.user?._id, { blocked: !p.blocked, blockedReason: p.blocked ? '' : p.blockedReason })}
                                    style={{ padding: '3px 9px', borderRadius: 12, border: `1px solid ${p.blocked ? 'rgba(248,113,113,0.4)' : 'rgba(248,113,113,0.2)'}`, background: p.blocked ? 'rgba(248,113,113,0.12)' : 'transparent', color: p.blocked ? '#f87171' : 'rgba(248,113,113,0.5)', fontSize: 11, cursor: 'pointer', fontWeight: p.blocked ? 600 : 400, marginLeft: 'auto', transition: 'all .15s' }}>
                                    {p.blocked ? '🚫 Débloqué' : '🚫 Signaler blocage'}
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Raison du blocage */}
                            {p.blocked && (
                              <div style={{ padding: '8px 14px 12px', borderTop: '1px solid rgba(248,113,113,0.15)', background: 'rgba(248,113,113,0.03)' }}>
                                {canEdit ? (
                                  <textarea
                                    defaultValue={p.blockedReason || ''}
                                    key={`blocked-${p._id}-${p.blockedReason}`}
                                    onBlur={e => handleParticipantUpdate(m._id, m.internalProject?._id, p.user?._id, { blockedReason: e.target.value })}
                                    placeholder="Décris le blocage pour que l'équipe puisse aider…"
                                    rows={2}
                                    style={{ width: '100%', fontSize: 12, padding: '6px 9px', borderRadius: 6, border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.06)', color: '#f87171', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' }}
                                  />
                                ) : p.blockedReason ? (
                                  <p style={{ fontSize: 12, color: '#f87171', margin: 0, lineHeight: 1.5 }}>"{p.blockedReason}"</p>
                                ) : (
                                  <p style={{ fontSize: 12, color: 'rgba(248,113,113,0.5)', margin: 0, fontStyle: 'italic' }}>Aucune raison précisée</p>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </Section>
                )
              })()}

              {/* ── ÉTAPES ── */}
              <Section icon="✅" title="Étapes"
                badge={totalSteps > 0 ? <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#6ee7b7' }}>{doneCount}/{totalSteps}</span> : undefined}>
                {totalSteps > 0 ? m.steps.map(step => {
                  const stepAssignee = step.assignedTo ? (m.assignedTo||[]).find(a => a._id === step.assignedTo) : null
                  const isOpen = expandedStep === step._id
                  return (
                    <div key={step._id} style={{ marginBottom: 6, borderRadius: 8, background: step.done ? 'rgba(16,185,129,0.04)' : step.waitingReview ? 'rgba(234,179,8,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${step.done ? 'rgba(16,185,129,0.15)' : step.waitingReview ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.05)'}`, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer' }} onClick={() => setExpandedStep(isOpen ? null : step._id)}>
                        <input type="checkbox" checked={step.done}
                          onChange={e => { e.stopPropagation(); handleMissionToggleStep(m._id, m.internalProject?._id, m, step._id) }}
                          onClick={e => e.stopPropagation()}
                          style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#10b981', flexShrink: 0 }} />
                        {stepAssignee && (
                          <div title={stepAssignee.name} style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#38bdf8', flexShrink: 0 }}>
                            {stepAssignee.name[0]?.toUpperCase()}
                          </div>
                        )}
                        <span style={{ fontSize: 13, flex: 1, color: step.done ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: step.done ? 'line-through' : 'none' }}>{step.title}</span>
                        {step.description && <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: .6 }}>📝</span>}
                        {step.waitingReview && !step.done && (
                          <>
                            <span style={{ fontSize: 10, color: '#fde047', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 8, padding: '1px 6px' }}>En attente</span>
                            {isSuperAdmin && (
                              <button type="button" onClick={async e => { e.stopPropagation(); try { const data = await apiFetch<{mission:Mission}>(`/api/admin/internal-projects/${m.internalProject?._id}/missions/${m._id}/steps/${step._id}/validate-step`, {method:'POST'}); setMissions(ms => ms.map(x => x._id===m._id ? data.mission : x)) } catch {} }}
                                style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.1)', color: '#6ee7b7', cursor: 'pointer' }}>✓ Valider</button>
                            )}
                          </>
                        )}
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: .5, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s', display: 'inline-block' }}>▾</span>
                      </div>
                      {isOpen && (
                        <div style={{ padding: '0 12px 10px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <textarea
                            defaultValue={step.description || ''}
                            key={`desc-${step._id}`}
                            onBlur={e => handleStepDescUpdate(m._id, m.internalProject?._id, m, step._id, e.target.value)}
                            placeholder="Ajouter des détails, notes, contexte…"
                            rows={3}
                            style={{ width: '100%', marginTop: 8, fontSize: 12, padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' }}
                          />
                        </div>
                      )}
                    </div>
                  )
                }) : <p style={{ fontSize: 13, color: 'rgba(165,180,207,0.3)', margin: 0 }}>Aucune étape définie</p>}
                {isSuperAdmin && (
                  <div style={{ marginTop: 10 }}>
                    {(m.assignedTo||[]).length > 1 && (
                      <div style={{ display: 'flex', gap: 5, marginBottom: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Pour :</span>
                        <button type="button" onClick={() => setStepAssigneeInputs(s=>({...s,[m._id]:''}))}
                          style={{ padding: '2px 8px', borderRadius: 10, border: `1px solid ${!stepAssigneeInputs[m._id]?'rgba(165,180,207,0.35)':'rgba(255,255,255,0.07)'}`, background: !stepAssigneeInputs[m._id]?'rgba(165,180,207,0.08)':'transparent', color: !stepAssigneeInputs[m._id]?'#a5b4cf':'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>Tous</button>
                        {(m.assignedTo||[]).map(a => (
                          <button key={a._id} type="button" onClick={() => setStepAssigneeInputs(s=>({...s,[m._id]:s[m._id]===a._id?'':a._id}))}
                            style={{ display:'flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:10, border:`1px solid ${stepAssigneeInputs[m._id]===a._id?'rgba(56,189,248,0.4)':'rgba(255,255,255,0.07)'}`, background:stepAssigneeInputs[m._id]===a._id?'rgba(56,189,248,0.1)':'transparent', color:stepAssigneeInputs[m._id]===a._id?'#38bdf8':'var(--text-secondary)', fontSize:11, cursor:'pointer' }}>
                            <div style={{width:13,height:13,borderRadius:'50%',background:'rgba(165,180,207,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700}}>{a.name[0]?.toUpperCase()}</div>
                            {a.name.split(' ')[0]}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="portal-input" value={missionStepInputs[m._id]||''} onChange={e=>setMissionStepInputs(s=>({...s,[m._id]:e.target.value}))}
                        onKeyDown={e=>{if(e.key==='Enter'&&missionStepInputs[m._id]?.trim())handleMissionAddStep(m._id,m.internalProject?._id,m,missionStepInputs[m._id].trim(),stepAssigneeInputs[m._id]||undefined)}}
                        placeholder="Nouvelle étape…" style={{ fontSize: 13, padding: '6px 10px', flex: 1 }} />
                      <button type="button" onClick={()=>{if(missionStepInputs[m._id]?.trim())handleMissionAddStep(m._id,m.internalProject?._id,m,missionStepInputs[m._id].trim(),stepAssigneeInputs[m._id]||undefined)}}
                        style={{ padding:'6px 12px', borderRadius:6, border:'1px solid rgba(14,165,233,0.3)', background:'rgba(14,165,233,0.08)', color:'#38bdf8', fontSize:15, cursor:'pointer' }}>+</button>
                    </div>
                  </div>
                )}
              </Section>

              {/* ── LIVRABLES ── */}
              <Section icon="📦" title="Livrables attendus"
                badge={(m.deliverables||[]).length > 0 ? <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 8, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd' }}>{delivDone}/{(m.deliverables||[]).length}</span> : undefined}>
                {(m.deliverables||[]).length === 0
                  ? <p style={{ fontSize: 13, color: 'rgba(165,180,207,0.3)', margin: 0 }}>Aucun livrable défini</p>
                  : (m.deliverables||[]).map(d => {
                      const da = d.assignedTo ? (m.assignedTo||[]).find(a=>a._id===d.assignedTo) : null
                      return (
                        <div key={d._id} style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:8, padding:'10px 12px', borderRadius:8, background:d.done?'rgba(139,92,246,0.04)':'rgba(255,255,255,0.02)', border:`1px solid ${d.done?'rgba(139,92,246,0.18)':'rgba(255,255,255,0.05)'}` }}>
                          <input type="checkbox" checked={d.done} onChange={()=>handleDeliverableToggle(m._id,m.internalProject?._id,m,d._id)}
                            style={{ cursor:'pointer', width:15, height:15, accentColor:'#8b5cf6', flexShrink:0, marginTop:2 }} />
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              {da && <div title={da.name} style={{ width:16,height:16,borderRadius:'50%',background:'rgba(139,92,246,0.15)',border:'1px solid rgba(139,92,246,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#c4b5fd',flexShrink:0 }}>{da.name[0]?.toUpperCase()}</div>}
                              <span style={{ fontSize:13, color:d.done?'var(--text-secondary)':'var(--text-primary)', textDecoration:d.done?'line-through':'none', fontWeight:500 }}>{d.title}</span>
                            </div>
                            {d.description && <p style={{ fontSize:11, color:'var(--text-secondary)', margin:'3px 0 0', lineHeight:1.4 }}>{d.description}</p>}
                          </div>
                          {isSuperAdmin && <button type="button" onClick={()=>handleDeliverableDelete(m._id,m.internalProject?._id,m,d._id)} style={{ fontSize:10, padding:'2px 6px', borderRadius:5, border:'1px solid rgba(248,113,113,0.2)', background:'rgba(248,113,113,0.05)', color:'#f87171', cursor:'pointer', flexShrink:0 }}>✕</button>}
                        </div>
                      )
                    })
                }
                {isSuperAdmin && (
                  <div style={{ marginTop: 8 }}>
                    {(m.assignedTo||[]).length > 1 && (
                      <div style={{ display:'flex', gap:5, marginBottom:7, flexWrap:'wrap', alignItems:'center' }}>
                        <span style={{ fontSize:11, color:'var(--text-secondary)' }}>Pour :</span>
                        <button type="button" onClick={()=>setDeliverableInputs(s=>({...s,[m._id]:{...(s[m._id]||{title:'',description:''}),assignedTo:''}}))}
                          style={{ padding:'2px 8px', borderRadius:10, border:`1px solid ${!deliverableInputs[m._id]?.assignedTo?'rgba(139,92,246,0.35)':'rgba(255,255,255,0.07)'}`, background:!deliverableInputs[m._id]?.assignedTo?'rgba(139,92,246,0.08)':'transparent', color:!deliverableInputs[m._id]?.assignedTo?'#c4b5fd':'var(--text-secondary)', fontSize:11, cursor:'pointer' }}>Tous</button>
                        {(m.assignedTo||[]).map(a=>(
                          <button key={a._id} type="button" onClick={()=>setDeliverableInputs(s=>({...s,[m._id]:{...(s[m._id]||{title:'',description:''}),assignedTo:s[m._id]?.assignedTo===a._id?'':a._id}}))}
                            style={{ display:'flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:10, border:`1px solid ${deliverableInputs[m._id]?.assignedTo===a._id?'rgba(139,92,246,0.4)':'rgba(255,255,255,0.07)'}`, background:deliverableInputs[m._id]?.assignedTo===a._id?'rgba(139,92,246,0.1)':'transparent', color:deliverableInputs[m._id]?.assignedTo===a._id?'#c4b5fd':'var(--text-secondary)', fontSize:11, cursor:'pointer' }}>
                            <div style={{width:13,height:13,borderRadius:'50%',background:'rgba(165,180,207,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700}}>{a.name[0]?.toUpperCase()}</div>
                            {a.name.split(' ')[0]}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{ display:'flex', gap:6 }}>
                      <input className="portal-input" value={deliverableInputs[m._id]?.title||''} onChange={e=>setDeliverableInputs(s=>({...s,[m._id]:{...(s[m._id]||{description:'',assignedTo:''}),title:e.target.value}}))}
                        onKeyDown={e=>{if(e.key==='Enter')handleDeliverableAdd(m._id,m.internalProject?._id,m)}}
                        placeholder="Livrable attendu…" style={{ fontSize:13, padding:'6px 10px', flex:1 }} />
                      <button type="button" onClick={()=>handleDeliverableAdd(m._id,m.internalProject?._id,m)}
                        style={{ padding:'6px 12px', borderRadius:6, border:'1px solid rgba(139,92,246,0.3)', background:'rgba(139,92,246,0.08)', color:'#c4b5fd', fontSize:15, cursor:'pointer' }}>+</button>
                    </div>
                    <input className="portal-input" value={deliverableInputs[m._id]?.description||''} onChange={e=>setDeliverableInputs(s=>({...s,[m._id]:{...(s[m._id]||{title:'',assignedTo:''}),description:e.target.value}}))}
                      placeholder="Description optionnelle" style={{ fontSize:12, padding:'5px 10px', width:'100%', marginTop:5, boxSizing:'border-box' }} />
                  </div>
                )}
              </Section>

              {/* ── FICHIERS ── */}
              <Section icon="📎" title="Fichiers">
                {(m.files?.length??0)===0
                  ? <p style={{ fontSize:13, color:'rgba(165,180,207,0.3)', margin:'0 0 10px' }}>Aucun fichier joint</p>
                  : <div style={{ marginBottom:10 }}>
                      {m.files.map(f=>(
                        <div key={f._id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, padding:'8px 10px', borderRadius:8, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" style={{flexShrink:0}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                          <span style={{ fontSize:13, color:'var(--text-primary)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.originalName}</span>
                          <span style={{ fontSize:11, color:'var(--text-secondary)', flexShrink:0 }}>{f.size>1048576?`${(f.size/1048576).toFixed(1)} Mo`:`${Math.round(f.size/1024)} Ko`}</span>
                          <button type="button" onClick={()=>handleMissionFileOpen(m._id,m.internalProject?._id,f._id)} style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1px solid rgba(14,165,233,0.3)', background:'rgba(14,165,233,0.08)', color:'#38bdf8', cursor:'pointer', flexShrink:0 }}>Ouvrir</button>
                          {isSuperAdmin && <button type="button" onClick={()=>handleMissionFileDelete(m._id,m.internalProject?._id,f._id)} style={{ fontSize:11, padding:'3px 7px', borderRadius:6, border:'1px solid rgba(248,113,113,0.2)', background:'rgba(248,113,113,0.05)', color:'#f87171', cursor:'pointer', flexShrink:0 }}>✕</button>}
                        </div>
                      ))}
                    </div>
                }
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input type="file" ref={el=>{fileInputRefs.current[m._id]=el}} style={{display:'none'}} onChange={async e=>{const file=e.target.files?.[0];if(file)await handleMissionFileUpload(m._id,m.internalProject?._id,file);e.target.value=''}} />
                  <button type="button" onClick={()=>fileInputRefs.current[m._id]?.click()} disabled={uploadingMission===m._id}
                    style={{ fontSize:13, padding:'7px 14px', borderRadius:8, border:'1px solid rgba(165,180,207,0.18)', background:'rgba(255,255,255,0.03)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    {uploadingMission===m._id?'Envoi…':'Joindre un fichier'}
                  </button>
                </div>
              </Section>

              {/* ── DEADLINE (SA uniquement) ── */}
              {isSuperAdmin && (
                <Section icon="📅" title="Modifier la deadline">
                  <input type="date" defaultValue={m.dueDate?m.dueDate.substring(0,10):''} key={`date-${m._id}`}
                    onBlur={e=>handleMissionDateUpdate(m._id,m.internalProject?._id,e.target.value)}
                    style={{ fontSize:13, padding:'6px 10px', borderRadius:7, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--text-primary)', cursor:'pointer' }} />
                </Section>
              )}

            </div>
          </>
        )
      })()}

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
