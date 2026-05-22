import { useState, useEffect, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ApiError, apiDownload, apiFetch, apiUpload } from '../../lib/api'
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

const MSC: Record<string, string> = { A_FAIRE: '#fde047', EN_COURS: '#38bdf8', TERMINE: '#6ee7b7' }
const MSBg: Record<string, string> = { A_FAIRE: 'rgba(234,179,8,0.12)', EN_COURS: 'rgba(14,165,233,0.12)', TERMINE: 'rgba(16,185,129,0.12)' }
const MSBo: Record<string, string> = { A_FAIRE: 'rgba(234,179,8,0.3)', EN_COURS: 'rgba(14,165,233,0.3)', TERMINE: 'rgba(16,185,129,0.3)' }
const MSL: Record<string, string> = { A_FAIRE: 'À faire', EN_COURS: 'En cours', TERMINE: 'Terminée' }

interface Member { _id: string; name: string; email: string; role: string }
interface Project {
  _id: string; name: string; description: string; entity: string; poles: string[]; members: Member[]
  status: string; priority: string; startDate: string | null; endDate: string | null; tags: string[]
  createdBy: { name: string }; createdAt: string; updatedAt: string
}

interface Mission {
  _id: string
  title: string
  description: string
  assignedTo: { _id: string; name: string; email: string }[]
  participants: { _id: string; user: { _id: string; name: string; email: string }; progress: number; status: string; blocked: boolean; blockedReason: string }[]
  status: 'A_FAIRE' | 'EN_COURS' | 'TERMINE'
  progress: number
  dueDate: string | null
  steps: { _id: string; title: string; description: string; done: boolean; waitingReview: boolean; assignedTo?: string }[]
  deliverables: { _id: string; title: string; description: string; done: boolean; assignedTo?: string }[]
  files: { _id: string; originalName: string; mimeType: string; size: number }[]
  createdBy: { name: string }
  createdAt: string
}

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
  const [missionForm, setMissionForm] = useState({ title: '', description: '', assignedTo: [] as string[], dueDate: '' })
  const [savingMission, setSavingMission] = useState(false)

  const [stepInputs, setStepInputs] = useState<Record<string, string>>({})
  const [stepAssigneeInputs, setStepAssigneeInputs] = useState<Record<string, string>>({})
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState<Record<string, boolean>>({})
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [deliverableInputs, setDeliverableInputs] = useState<Record<string, { title: string; description: string; assignedTo: string }>>({})
  const [selectedMission, setSelectedMission] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    apiFetch<{ project: Project }>(`/api/admin/internal-projects/${id}`)
      .then(d => { setProject(d.project); setEditStatus(d.project.status) })
      .catch(() => showToast('Projet introuvable', 'error'))
      .finally(() => setLoading(false))

    apiFetch<{ missions: Mission[] }>(`/api/admin/internal-projects/${id}/missions`)
      .then(d => setMissions(d.missions || []))
      .catch(() => {})
      .finally(() => setMissionsLoading(false))
  }, [id])

  const handleStatusChange = async (newStatus: string) => {
    if (!project) return
    setSavingStatus(true)
    try {
      const data = await apiFetch<{ project: Project }>(`/api/admin/internal-projects/${project._id}`, {
        method: 'PATCH', body: JSON.stringify({ status: newStatus }),
      })
      setProject(data.project); setEditStatus(data.project.status)
      showToast('Statut mis à jour', 'success')
    } catch (err: any) { showToast(err.message || 'Erreur', 'error') }
    finally { setSavingStatus(false) }
  }

  const handleDelete = async () => {
    if (!project) return
    try {
      await apiFetch(`/api/admin/internal-projects/${project._id}`, { method: 'DELETE' })
      showToast('Projet supprimé', 'success')
      navigate('/admin/projets-internes')
    } catch (err: any) { showToast(err.message || 'Erreur', 'error') }
  }

  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!missionForm.title.trim()) { showToast('Le titre est requis', 'error'); return }
    if (missionForm.assignedTo.length === 0) { showToast('Assigne la mission à au moins une personne', 'error'); return }
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
      setMissions(m => [data.mission, ...m])
      setShowMissionForm(false)
      setMissionForm({ title: '', description: '', assignedTo: [], dueDate: '' })
      showToast('Mission créée', 'success')
    } catch (err: any) { showToast(err.message || 'Erreur', 'error') }
    finally { setSavingMission(false) }
  }

  const handleMissionStatus = async (missionId: string, status: string) => {
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      })
      setMissions(m => m.map(x => x._id === missionId ? { ...x, status: data.mission.status } : x))
    } catch (err: any) { showToast(err.message || 'Erreur', 'error') }
  }

  const handleDeleteMission = async (missionId: string) => {
    try {
      await apiFetch(`/api/admin/internal-projects/${id}/missions/${missionId}`, { method: 'DELETE' })
      setMissions(m => m.filter(x => x._id !== missionId))
      if (selectedMission === missionId) setSelectedMission(null)
      showToast('Mission supprimée', 'success')
    } catch (err: any) { showToast(err.message || 'Erreur', 'error') }
  }

  const handleToggleStep = async (missionId: string, mission: Mission, stepId: string) => {
    const newSteps = mission.steps.map(s => s._id === stepId ? { ...s, done: !s.done } : s)
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ steps: newSteps }),
      })
      setMissions(m => m.map(x => x._id === missionId ? data.mission : x))
    } catch (err: any) { showToast(err.message || 'Erreur', 'error') }
  }

  const handleAddStep = async (missionId: string, mission: Mission, title: string, assignedTo?: string) => {
    const newStep: any = { title, done: false }
    if (assignedTo) newStep.assignedTo = assignedTo
    const newSteps = [...mission.steps, newStep]
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ steps: newSteps }),
      })
      setMissions(m => m.map(x => x._id === missionId ? data.mission : x))
      setStepInputs(s => ({ ...s, [missionId]: '' }))
      setStepAssigneeInputs(s => ({ ...s, [missionId]: '' }))
    } catch (err: any) { showToast(err.message || 'Erreur', 'error') }
  }

  const handleDeleteStep = async (missionId: string, mission: Mission, stepId: string) => {
    const newSteps = mission.steps.filter(s => s._id !== stepId)
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ steps: newSteps }),
      })
      setMissions(m => m.map(x => x._id === missionId ? data.mission : x))
    } catch (err: any) { showToast(err.message || 'Erreur', 'error') }
  }

  const handleStepDescUpdate = async (missionId: string, mission: Mission, stepId: string, description: string) => {
    const newSteps = mission.steps.map(s => s._id === stepId ? { ...s, description } : s)
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ steps: newSteps }),
      })
      setMissions(m => m.map(x => x._id === missionId ? data.mission : x))
    } catch { /* silent */ }
  }

  const handleRequestReview = async (missionId: string, stepId: string) => {
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}/request-review`, {
        method: 'POST', body: JSON.stringify({ stepId }),
      })
      setMissions(m => m.map(x => x._id === missionId ? data.mission : x))
      showToast('Vérification demandée au Super Admin', 'success')
    } catch (err: any) { showToast(err.message || 'Erreur', 'error') }
  }

  const handleValidateStep = async (missionId: string, stepId: string) => {
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}/validate-step`, {
        method: 'POST', body: JSON.stringify({ stepId }),
      })
      setMissions(m => m.map(x => x._id === missionId ? data.mission : x))
      showToast('Étape validée', 'success')
    } catch (err: any) { showToast(err.message || 'Erreur', 'error') }
  }

  const handleParticipantUpdate = async (missionId: string, userId: string, fields: { progress?: number; status?: string; blocked?: boolean; blockedReason?: string }) => {
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}/my-progress`, {
        method: 'PATCH', body: JSON.stringify({ userId, ...fields }),
      })
      setMissions(ms => ms.map(x => x._id === missionId ? data.mission : x))
    } catch { /* silent */ }
  }

  const handleDeliverableAdd = async (missionId: string, mission: Mission) => {
    const input = deliverableInputs[missionId]
    if (!input?.title?.trim()) return
    const newDeliv: any = { title: input.title.trim(), description: input.description || '', done: false }
    if (input.assignedTo) newDeliv.assignedTo = input.assignedTo
    const newDeliverables = [...(mission.deliverables || []), newDeliv]
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ deliverables: newDeliverables }),
      })
      setMissions(ms => ms.map(x => x._id === missionId ? data.mission : x))
      setDeliverableInputs(s => ({ ...s, [missionId]: { title: '', description: '', assignedTo: '' } }))
    } catch { /* silent */ }
  }

  const handleDeliverableToggle = async (missionId: string, mission: Mission, delivId: string) => {
    const newDeliverables = (mission.deliverables || []).map(d => d._id === delivId ? { ...d, done: !d.done } : d)
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ deliverables: newDeliverables }),
      })
      setMissions(ms => ms.map(x => x._id === missionId ? data.mission : x))
    } catch { /* silent */ }
  }

  const handleDeliverableDelete = async (missionId: string, mission: Mission, delivId: string) => {
    const newDeliverables = (mission.deliverables || []).filter(d => d._id !== delivId)
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ deliverables: newDeliverables }),
      })
      setMissions(ms => ms.map(x => x._id === missionId ? data.mission : x))
    } catch { /* silent */ }
  }

  const handleProgressUpdate = async (missionId: string, progress: number) => {
    try {
      await apiFetch(`/api/admin/internal-projects/${id}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ progress }),
      })
      setMissions(ms => ms.map(x => x._id === missionId ? { ...x, progress } : x))
    } catch { /* silent */ }
  }

  const handleUploadFile = async (missionId: string, file: File) => {
    setUploadingFile(u => ({ ...u, [missionId]: true }))
    const formData = new FormData()
    formData.append('file', file)
    try {
      await apiUpload(`/api/admin/internal-projects/${id}/missions/${missionId}/files`, formData)
      const updated = await apiFetch<{ missions: Mission[] }>(`/api/admin/internal-projects/${id}/missions`)
      setMissions(updated.missions || [])
      showToast('Fichier ajouté', 'success')
    } catch (err: any) {
      const msg = err instanceof ApiError ? ((err.payload as { error?: string } | null)?.error || err.message) : err?.message
      showToast(msg || 'Erreur', 'error')
    }
    finally { setUploadingFile(u => ({ ...u, [missionId]: false })) }
  }

  const handleDeleteFile = async (missionId: string, fileId: string) => {
    try {
      await apiFetch(`/api/admin/internal-projects/${id}/missions/${missionId}/files/${fileId}`, { method: 'DELETE' })
      setMissions(m => m.map(x => x._id === missionId ? { ...x, files: x.files.filter(f => f._id !== fileId) } : x))
      showToast('Fichier supprimé', 'success')
    } catch (err: any) { showToast(err.message || 'Erreur', 'error') }
  }

  if (loading) return (
    <div className="portal-container">
      <div className="portal-card"><p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chargement...</p></div>
    </div>
  )

  if (!project) return (
    <div className="portal-container">
      <div className="portal-card"><p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Projet introuvable.</p></div>
    </div>
  )

  const sc = STATUS_COLORS[project.status] || STATUS_COLORS.ARCHIVE

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link><span>/</span>
          <Link to="/admin/projets-internes">Projets internes</Link><span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>{project.name}</span>
        </div>

        <div className="admin-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'rgba(14, 165, 233, 0.12)', border: '1px solid rgba(14, 165, 233, 0.3)', color: '#38bdf8' }}>{project.entity}</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text }}>{STATUS_LABELS[project.status] || project.status}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: PRIORITY_COLORS[project.priority] || 'var(--text-secondary)' }}>
                ● {project.priority.charAt(0) + project.priority.slice(1).toLowerCase()}
              </span>
            </div>
            <h1 style={{ marginBottom: 6 }}>{project.name}</h1>
            {project.description && (
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 600 }}>{project.description}</p>
            )}
          </div>
          <div className="admin-actions portal-actions-reveal">
            <Link className="portal-button secondary portal-action-link" to={`/admin/projets-internes?edit=${project._id}`}>
              <span className="portal-action-label">Modifier</span>
            </Link>
            {isSuperAdmin && (
              <button className="portal-button secondary portal-action-link" type="button" onClick={() => setDeleteOpen(true)} style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}>
                <span className="portal-action-label">Supprimer</span>
              </button>
            )}
          </div>
        </div>

        {/* Meta info */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginTop: 24 }}>
          {project.startDate && (
            <div className="portal-card" style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>Début</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{new Date(project.startDate).toLocaleDateString('fr-FR')}</div>
            </div>
          )}
          {project.endDate && (
            <div className="portal-card" style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>Fin prévue</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{new Date(project.endDate).toLocaleDateString('fr-FR')}</div>
            </div>
          )}
          <div className="portal-card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>Créé par</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{project.createdBy?.name || '—'}</div>
          </div>
          <div className="portal-card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>Mise à jour</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{new Date(project.updatedAt).toLocaleDateString('fr-FR')}</div>
          </div>
        </div>

        {/* Quick status change */}
        <div style={{ marginTop: 20 }}>
          <label className="portal-label">Changer le statut</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {Object.entries(STATUS_LABELS).map(([v, l]) => {
              const c = STATUS_COLORS[v]
              return (
                <button key={v} type="button" disabled={savingStatus || editStatus === v} onClick={() => handleStatusChange(v)}
                  style={{ padding: '5px 14px', borderRadius: 20, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: editStatus === v ? 'default' : 'pointer', background: editStatus === v ? c.bg : 'transparent', borderColor: editStatus === v ? c.border : 'var(--border)', color: editStatus === v ? c.text : 'var(--text-secondary)', opacity: savingStatus ? 0.6 : 1, transition: 'all .15s' }}>
                  {l}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
        <button onClick={() => setActiveTab('overview')}
          style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${activeTab === 'overview' ? 'rgba(14,165,233,0.45)' : 'rgba(255,255,255,0.1)'}`, background: activeTab === 'overview' ? 'rgba(14,165,233,0.1)' : 'transparent', color: activeTab === 'overview' ? '#38bdf8' : 'var(--text-secondary)', transition: 'all .15s' }}>
          Vue d'ensemble
        </button>
        <button onClick={() => setActiveTab('missions')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${activeTab === 'missions' ? 'rgba(234,179,8,0.6)' : 'rgba(234,179,8,0.28)'}`, background: activeTab === 'missions' ? 'rgba(234,179,8,0.12)' : 'rgba(234,179,8,0.04)', color: activeTab === 'missions' ? '#fde047' : 'rgba(253,224,71,0.55)', boxShadow: activeTab === 'missions' ? '0 0 10px rgba(234,179,8,0.12)' : 'none', transition: 'all .15s' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
          </svg>
          Missions internes
          {missions.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: activeTab === 'missions' ? 'rgba(234,179,8,0.25)' : 'rgba(234,179,8,0.12)', color: activeTab === 'missions' ? '#fde047' : 'rgba(253,224,71,0.6)' }}>
              {missions.length}
            </span>
          )}
        </button>
      </div>

      {/* ─── TAB: VUE D'ENSEMBLE ─── */}
      {activeTab === 'overview' && (
        <>
          {project.poles.length > 0 && (
            <div className="portal-card" style={{ marginTop: 16 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>Pôles</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {project.poles.map(pole => (
                  <span key={pole} style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.3)', color: '#c4b5fd' }}>{pole}</span>
                ))}
              </div>
            </div>
          )}
          <div className="portal-card" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>Membres ({project.members.length})</h2>
            {project.members.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Aucun membre assigné directement (accessible via pôle)</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {project.members.map(m => (
                  <div key={m._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(16,185,129,0.3), rgba(5,150,105,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#6ee7b7' }}>
                      {(m.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {project.tags.length > 0 && (
            <div className="portal-card" style={{ marginTop: 16 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>Tags</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {project.tags.map(tag => (
                  <span key={tag} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 12, background: 'rgba(100,116,180,0.12)', border: '1px solid rgba(100,116,180,0.25)', color: '#a5b4cf' }}>#{tag}</span>
                ))}
              </div>
            </div>
          )}
          {missions.length > 0 && (
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <button type="button" onClick={() => setActiveTab('missions')}
                style={{ fontSize: 12, color: 'rgba(253,224,71,0.7)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Voir les {missions.length} mission{missions.length > 1 ? 's' : ''} de ce projet →
              </button>
            </div>
          )}
        </>
      )}

      {/* ─── TAB: MISSIONS ─── */}
      {activeTab === 'missions' && (
        <div className="portal-card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Missions ({missions.length})</h2>
            {isAdminRole && (
              <button type="button" onClick={() => setShowMissionForm(f => !f)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.08)', color: '#6ee7b7', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nouvelle mission
              </button>
            )}
          </div>

          {isAdminRole && showMissionForm && (
            <form onSubmit={handleCreateMission} style={{ marginBottom: 16, padding: '16px', borderRadius: 10, background: 'rgba(14,165,233,0.04)', border: '1px solid rgba(14,165,233,0.15)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="portal-label">Titre *</label>
                  <input className="portal-input" value={missionForm.title} onChange={e => setMissionForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Créer les maquettes landing page" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="portal-label">Description</label>
                  <textarea className="portal-input" value={missionForm.description} onChange={e => setMissionForm(f => ({ ...f, description: e.target.value }))} rows={2} style={{ resize: 'vertical' }} placeholder="Détails de la mission..." />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="portal-label">Assigner à * <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 11 }}>(plusieurs possibles)</span></label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {project.members.map(a => {
                      const selected = missionForm.assignedTo.includes(a._id)
                      return (
                        <button key={a._id} type="button"
                          onClick={() => setMissionForm(f => ({ ...f, assignedTo: selected ? f.assignedTo.filter(i => i !== a._id) : [...f.assignedTo, a._id] }))}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, border: `1px solid ${selected ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'}`, background: selected ? 'rgba(16,185,129,0.12)' : 'transparent', color: selected ? '#6ee7b7' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', transition: 'all .15s' }}>
                          <div style={{ width: 18, height: 18, borderRadius: '50%', background: selected ? 'rgba(16,185,129,0.2)' : 'rgba(165,180,207,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{a.name[0]?.toUpperCase()}</div>
                          {a.name}
                          {selected && <span style={{ fontSize: 10 }}>✓</span>}
                        </button>
                      )
                    })}
                  </div>
                  {missionForm.assignedTo.length > 0 && (
                    <div style={{ fontSize: 11, color: '#6ee7b7', marginTop: 4 }}>{missionForm.assignedTo.length} personne{missionForm.assignedTo.length > 1 ? 's' : ''} sélectionnée{missionForm.assignedTo.length > 1 ? 's' : ''}</div>
                  )}
                </div>
                <div>
                  <label className="portal-label">Deadline</label>
                  <input type="date" className="portal-input" value={missionForm.dueDate} onChange={e => setMissionForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="portal-button" type="submit" disabled={savingMission} style={{ fontSize: 13 }}>{savingMission ? 'Création...' : 'Créer la mission'}</button>
                <button className="portal-button secondary" type="button" onClick={() => setShowMissionForm(false)} style={{ fontSize: 13 }}>Annuler</button>
              </div>
            </form>
          )}

          {missionsLoading ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Chargement...</p>
          ) : missions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: .4 }}>◎</div>
              Aucune mission pour l'instant
            </div>
          ) : (
            <div>
              {missions.map(m => {
                const isOverdue = m.dueDate && m.status !== 'TERMINE' && new Date(m.dueDate) < new Date()
                const doneSteps = m.steps?.filter(s => s.done).length ?? 0
                const totalSteps = m.steps?.length ?? 0
                const delivDone = (m.deliverables || []).filter(d => d.done).length
                const isExpanded = selectedMission === m._id
                const reviewingSteps = (m.steps || []).filter(s => s.waitingReview && !s.done).length

                return (
                  <div key={m._id} style={{ marginBottom: 10, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: `1px solid ${isExpanded ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)'}`, overflow: 'hidden', transition: 'border-color .15s' }}>
                    {/* Mission header row */}
                    <div style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between' }}
                      onClick={() => setSelectedMission(isExpanded ? null : m._id)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, color: MSC[m.status], background: MSBg[m.status], border: `1px solid ${MSBo[m.status]}` }}>
                            {MSL[m.status]}
                          </span>
                          {isOverdue && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}>⚠ En retard</span>}
                          {reviewingSteps > 0 && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', color: '#fde047' }}>🔍 {reviewingSteps} en review</span>}
                          {m.dueDate && <span style={{ fontSize: 11, color: isOverdue ? '#f87171' : 'var(--text-secondary)' }}>· {new Date(m.dueDate).toLocaleDateString('fr-FR')}</span>}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 3 }}>{m.title}</div>
                        {m.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{m.description}</div>}
                        {/* Assignees */}
                        {(m.assignedTo || []).length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                            {(m.assignedTo || []).map(a => (
                              <div key={a._id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 10, background: 'rgba(165,180,207,0.08)', border: '1px solid rgba(165,180,207,0.15)' }}>
                                <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(165,180,207,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#a5b4cf' }}>{a.name[0]?.toUpperCase()}</div>
                                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{a.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        {/* Mini progress */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                            <div style={{ height: '100%', borderRadius: 2, background: m.progress === 100 ? '#10b981' : '#38bdf8', width: `${m.progress ?? 0}%`, transition: 'width .3s' }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: m.progress === 100 ? '#6ee7b7' : '#38bdf8', minWidth: 26 }}>{m.progress ?? 0}%</span>
                        </div>
                        {totalSteps > 0 && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{doneSteps}/{totalSteps} étapes</span>}
                        <span style={{ fontSize: 11, color: '#38bdf8', opacity: .5, transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .2s', display: 'inline-block' }}>›</span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>

                        {/* Progression globale */}
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text-secondary)', minWidth: 130 }}>📊 Progression globale</span>
                          <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.07)' }}>
                            <div style={{ height: '100%', borderRadius: 4, background: m.progress === 100 ? 'linear-gradient(90deg,#10b981,#6ee7b7)' : 'linear-gradient(90deg,#0ea5e9,#38bdf8)', width: `${m.progress ?? 0}%`, transition: 'width .4s' }} />
                          </div>
                          {isSuperAdmin ? (
                            <input type="number" min={0} max={100} defaultValue={m.progress ?? 0} key={`${m._id}-${m.progress}`}
                              onBlur={e => { const v = Math.min(100, Math.max(0, Number(e.target.value))); e.target.value = String(v); handleProgressUpdate(m._id, v) }}
                              style={{ width: 48, fontSize: 13, fontWeight: 700, padding: '2px 5px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: m.progress === 100 ? '#6ee7b7' : '#38bdf8', textAlign: 'center' }} />
                          ) : (
                            <span style={{ fontSize: 14, fontWeight: 700, color: m.progress === 100 ? '#6ee7b7' : '#38bdf8', minWidth: 36, textAlign: 'right' }}>{m.progress ?? 0}</span>
                          )}
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>%</span>
                        </div>

                        {/* Participants — suivi individuel */}
                        {(m.participants || []).length > 0 && (() => {
                          const avgP = Math.round((m.participants || []).reduce((s, p) => s + (p.progress ?? 0), 0) / m.participants.length)
                          const blockedCount = (m.participants || []).filter(p => p.blocked).length
                          return (
                            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text-secondary)' }}>👥 Avancement par membre</span>
                                {blockedCount > 0 && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 8, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}>🚫 {blockedCount} bloqué{blockedCount > 1 ? 's' : ''}</span>}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {(m.participants || []).map(p => {
                                  const canEdit = isSuperAdmin || p.user?._id === user?._id
                                  const mySteps = (m.steps || []).filter(s => s.assignedTo === p.user?._id)
                                  const myStepsDone = mySteps.filter(s => s.done).length
                                  const commonSteps = (m.steps || []).filter(s => !s.assignedTo)
                                  const commonDone = commonSteps.filter(s => s.done).length
                                  const myDelivs = (m.deliverables || []).filter(d => d.assignedTo === p.user?._id)
                                  const myDelivsDone = myDelivs.filter(d => d.done).length
                                  const isBehind = m.participants.length > 1 && (avgP - (p.progress ?? 0)) >= 30
                                  const avatarColor = p.blocked ? '#f87171' : p.status === 'TERMINE' ? '#6ee7b7' : p.user?._id === user?._id ? '#38bdf8' : '#a5b4cf'
                                  const cardBorder = p.blocked ? 'rgba(248,113,113,0.25)' : isBehind ? 'rgba(251,191,36,0.2)' : p.user?._id === user?._id ? 'rgba(14,165,233,0.15)' : 'rgba(255,255,255,0.05)'
                                  const cardBg = p.blocked ? 'rgba(248,113,113,0.04)' : p.user?._id === user?._id ? 'rgba(14,165,233,0.05)' : 'rgba(255,255,255,0.02)'
                                  const barColor = p.blocked ? '#f87171' : p.progress === 100 ? '#10b981' : '#38bdf8'
                                  return (
                                    <div key={p._id} style={{ borderRadius: 8, background: cardBg, border: `1px solid ${cardBorder}`, overflow: 'hidden' }}>
                                      <div style={{ padding: '10px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: p.blocked ? 'rgba(248,113,113,0.15)' : 'rgba(165,180,207,0.12)', border: `1.5px solid ${p.blocked ? 'rgba(248,113,113,0.4)' : 'rgba(165,180,207,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: avatarColor, flexShrink: 0 }}>
                                            {p.blocked ? '🚫' : p.user?.name?.[0]?.toUpperCase()}
                                          </div>
                                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{p.user?.name}</span>
                                          {p.user?._id === user?._id && <span style={{ fontSize: 10, color: '#38bdf8', background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: 8, padding: '1px 6px' }}>Moi</span>}
                                          {p.blocked
                                            ? <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.35)', color: '#f87171', fontWeight: 600 }}>🚫 Bloqué</span>
                                            : <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, color: MSC[p.status] || '#a5b4cf', background: MSBg[p.status] || 'rgba(255,255,255,0.05)', border: `1px solid ${MSBo[p.status] || 'rgba(255,255,255,0.1)'}` }}>{MSL[p.status] || p.status}</span>
                                          }
                                          {isBehind && !p.blocked && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}>⚠ En retard</span>}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                                          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)' }}>
                                            <div style={{ height: '100%', borderRadius: 3, background: barColor, width: `${p.progress ?? 0}%`, transition: 'width .3s' }} />
                                          </div>
                                          {canEdit ? (
                                            <input type="number" min={0} max={100} defaultValue={p.progress ?? 0} key={`${p._id}-${p.progress}`}
                                              onBlur={e => { const v = Math.min(100, Math.max(0, Number(e.target.value))); e.target.value = String(v); handleParticipantUpdate(m._id, p.user?._id, { progress: v }) }}
                                              style={{ width: 42, fontSize: 12, fontWeight: 700, padding: '2px 4px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: p.progress === 100 ? '#6ee7b7' : '#38bdf8', textAlign: 'center' }} />
                                          ) : (
                                            <span style={{ fontSize: 12, fontWeight: 700, color: p.progress === 100 ? '#6ee7b7' : '#38bdf8', minWidth: 26, textAlign: 'right' }}>{p.progress ?? 0}</span>
                                          )}
                                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>%</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: canEdit ? 6 : 0 }}>
                                          {mySteps.length > 0 && <span style={{ fontSize: 11, color: myStepsDone === mySteps.length ? '#6ee7b7' : 'var(--text-secondary)', background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '1px 6px', border: '1px solid rgba(255,255,255,0.06)' }}>✅ {myStepsDone}/{mySteps.length} étapes</span>}
                                          {commonSteps.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '1px 6px', border: '1px solid rgba(255,255,255,0.06)' }}>{commonDone}/{commonSteps.length} communes</span>}
                                          {myDelivs.length > 0 && <span style={{ fontSize: 11, color: myDelivsDone === myDelivs.length ? '#c4b5fd' : 'var(--text-secondary)', background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '1px 6px', border: '1px solid rgba(255,255,255,0.06)' }}>📦 {myDelivsDone}/{myDelivs.length} livrables</span>}
                                        </div>
                                        {canEdit && (
                                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {(['A_FAIRE', 'EN_COURS', 'TERMINE'] as const).map(v => (
                                              <button key={v} type="button" onClick={() => handleParticipantUpdate(m._id, p.user?._id, { status: v })}
                                                style={{ padding: '2px 8px', borderRadius: 10, border: `1px solid ${p.status === v ? MSBo[v] : 'rgba(255,255,255,0.08)'}`, background: p.status === v ? MSBg[v] : 'transparent', color: p.status === v ? MSC[v] : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontWeight: p.status === v ? 600 : 400, transition: 'all .15s' }}>
                                                {MSL[v]}
                                              </button>
                                            ))}
                                            <button type="button" onClick={() => handleParticipantUpdate(m._id, p.user?._id, { blocked: !p.blocked, blockedReason: p.blocked ? '' : p.blockedReason })}
                                              style={{ padding: '2px 8px', borderRadius: 10, border: `1px solid ${p.blocked ? 'rgba(248,113,113,0.4)' : 'rgba(248,113,113,0.2)'}`, background: p.blocked ? 'rgba(248,113,113,0.12)' : 'transparent', color: p.blocked ? '#f87171' : 'rgba(248,113,113,0.5)', fontSize: 11, cursor: 'pointer', marginLeft: 'auto', transition: 'all .15s' }}>
                                              {p.blocked ? '🚫 Débloquer' : '🚫 Bloquer'}
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                      {p.blocked && (
                                        <div style={{ padding: '7px 12px 10px', borderTop: '1px solid rgba(248,113,113,0.15)', background: 'rgba(248,113,113,0.03)' }}>
                                          {canEdit ? (
                                            <textarea defaultValue={p.blockedReason || ''} key={`br-${p._id}-${p.blockedReason}`}
                                              onBlur={e => handleParticipantUpdate(m._id, p.user?._id, { blockedReason: e.target.value })}
                                              placeholder="Décris le blocage…" rows={2}
                                              style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 5, border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.06)', color: '#f87171', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' }} />
                                          ) : p.blockedReason ? (
                                            <p style={{ fontSize: 11, color: '#f87171', margin: 0, lineHeight: 1.5 }}>"{p.blockedReason}"</p>
                                          ) : (
                                            <p style={{ fontSize: 11, color: 'rgba(248,113,113,0.5)', margin: 0, fontStyle: 'italic' }}>Aucune raison précisée</p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })()}

                        {/* Étapes */}
                        {(m.steps?.length > 0 || isSuperAdmin) && (
                          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text-secondary)' }}>✅ Étapes</span>
                              {totalSteps > 0 && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#6ee7b7' }}>{doneSteps}/{totalSteps}</span>}
                            </div>
                            {totalSteps > 0 && (
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', marginBottom: 8 }}>
                                <div style={{ height: '100%', borderRadius: 2, background: '#10b981', width: `${Math.round((doneSteps / totalSteps) * 100)}%`, transition: 'width .3s' }} />
                              </div>
                            )}
                            {m.steps.map(step => {
                              const stepAssignee = step.assignedTo ? (m.assignedTo || []).find(a => a._id === step.assignedTo) : null
                              const isOpen = expandedStep === step._id
                              return (
                                <div key={step._id} style={{ marginBottom: 5, borderRadius: 7, background: step.done ? 'rgba(16,185,129,0.04)' : step.waitingReview ? 'rgba(234,179,8,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${step.done ? 'rgba(16,185,129,0.15)' : step.waitingReview ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.05)'}`, overflow: 'hidden' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer' }} onClick={() => setExpandedStep(isOpen ? null : step._id)}>
                                    <input type="checkbox" checked={step.done}
                                      onChange={e => { e.stopPropagation(); !step.waitingReview && handleToggleStep(m._id, m, step._id) }}
                                      onClick={e => e.stopPropagation()}
                                      disabled={step.waitingReview}
                                      style={{ cursor: step.waitingReview ? 'default' : 'pointer', width: 14, height: 14, accentColor: '#10b981', flexShrink: 0 }} />
                                    {stepAssignee && (
                                      <div title={stepAssignee.name} style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#38bdf8', flexShrink: 0 }}>
                                        {stepAssignee.name[0]?.toUpperCase()}
                                      </div>
                                    )}
                                    <span style={{ fontSize: 12, flex: 1, color: step.done ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: step.done ? 'line-through' : 'none' }}>{step.title}</span>
                                    {step.description && <span style={{ fontSize: 10, opacity: .5 }}>📝</span>}
                                    {step.waitingReview && !step.done && (
                                      <span style={{ fontSize: 10, color: '#fde047', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 8, padding: '1px 5px' }}>En attente</span>
                                    )}
                                    {/* Request review — assigned member, not SA */}
                                    {!step.done && !step.waitingReview && !isSuperAdmin && (
                                      <button type="button" onClick={e => { e.stopPropagation(); handleRequestReview(m._id, step._id) }}
                                        style={{ padding: '2px 7px', borderRadius: 7, border: '1px solid rgba(234,179,8,0.3)', fontSize: 10, cursor: 'pointer', background: 'transparent', color: '#fde047' }}>
                                        Vérification
                                      </button>
                                    )}
                                    {/* Validate — SA only */}
                                    {step.waitingReview && !step.done && isSuperAdmin && (
                                      <button type="button" onClick={e => { e.stopPropagation(); handleValidateStep(m._id, step._id) }}
                                        style={{ padding: '2px 7px', borderRadius: 7, border: '1px solid rgba(16,185,129,0.3)', fontSize: 10, cursor: 'pointer', background: 'rgba(16,185,129,0.1)', color: '#6ee7b7', fontWeight: 600 }}>
                                        ✓ Valider
                                      </button>
                                    )}
                                    {isSuperAdmin && (
                                      <button type="button" onClick={e => { e.stopPropagation(); handleDeleteStep(m._id, m, step._id) }}
                                        style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.5)', cursor: 'pointer', fontSize: 11, padding: '0 2px' }}>✕</button>
                                    )}
                                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: .4, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s', display: 'inline-block' }}>▾</span>
                                  </div>
                                  {isOpen && (
                                    <div style={{ padding: '0 10px 8px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                      <textarea
                                        defaultValue={step.description || ''}
                                        key={`desc-${step._id}`}
                                        onBlur={e => handleStepDescUpdate(m._id, m, step._id, e.target.value)}
                                        placeholder="Ajouter des détails, notes, contexte…"
                                        rows={3}
                                        style={{ width: '100%', marginTop: 7, fontSize: 12, padding: '6px 9px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' }}
                                      />
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                            {isSuperAdmin && (
                              <div style={{ marginTop: 8 }}>
                                {(m.assignedTo || []).length > 1 && (
                                  <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Pour :</span>
                                    <button type="button" onClick={() => setStepAssigneeInputs(s => ({ ...s, [m._id]: '' }))}
                                      style={{ padding: '2px 7px', borderRadius: 9, border: `1px solid ${!stepAssigneeInputs[m._id] ? 'rgba(165,180,207,0.35)' : 'rgba(255,255,255,0.07)'}`, background: !stepAssigneeInputs[m._id] ? 'rgba(165,180,207,0.08)' : 'transparent', color: !stepAssigneeInputs[m._id] ? '#a5b4cf' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>Tous</button>
                                    {(m.assignedTo || []).map(a => (
                                      <button key={a._id} type="button" onClick={() => setStepAssigneeInputs(s => ({ ...s, [m._id]: s[m._id] === a._id ? '' : a._id }))}
                                        style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 9, border: `1px solid ${stepAssigneeInputs[m._id] === a._id ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.07)'}`, background: stepAssigneeInputs[m._id] === a._id ? 'rgba(56,189,248,0.1)' : 'transparent', color: stepAssigneeInputs[m._id] === a._id ? '#38bdf8' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
                                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(165,180,207,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700 }}>{a.name[0]?.toUpperCase()}</div>
                                        {a.name.split(' ')[0]}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: 5 }}>
                                  <input className="portal-input" value={stepInputs[m._id] || ''} onChange={e => setStepInputs(s => ({ ...s, [m._id]: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter' && stepInputs[m._id]?.trim()) handleAddStep(m._id, m, stepInputs[m._id].trim(), stepAssigneeInputs[m._id] || undefined) }}
                                    placeholder="Nouvelle étape… (Entrée)" style={{ fontSize: 12, padding: '5px 9px', flex: 1 }} />
                                  <button type="button" onClick={() => { if (stepInputs[m._id]?.trim()) handleAddStep(m._id, m, stepInputs[m._id].trim(), stepAssigneeInputs[m._id] || undefined) }}
                                    style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid rgba(14,165,233,0.3)', background: 'rgba(14,165,233,0.08)', color: '#38bdf8', fontSize: 14, cursor: 'pointer' }}>+</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Livrables attendus */}
                        {((m.deliverables || []).length > 0 || isSuperAdmin) && (
                          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text-secondary)' }}>📦 Livrables attendus</span>
                              {(m.deliverables || []).length > 0 && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 8, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd' }}>{delivDone}/{(m.deliverables || []).length}</span>}
                            </div>
                            {(m.deliverables || []).length === 0
                              ? <p style={{ fontSize: 12, color: 'rgba(165,180,207,0.3)', margin: '0 0 8px' }}>Aucun livrable défini</p>
                              : (m.deliverables || []).map(d => {
                                  const da = d.assignedTo ? (m.assignedTo || []).find(a => a._id === d.assignedTo) : null
                                  return (
                                    <div key={d._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, padding: '8px 10px', borderRadius: 7, background: d.done ? 'rgba(139,92,246,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${d.done ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.05)'}` }}>
                                      <input type="checkbox" checked={d.done} onChange={() => handleDeliverableToggle(m._id, m, d._id)}
                                        style={{ cursor: 'pointer', width: 14, height: 14, accentColor: '#8b5cf6', flexShrink: 0, marginTop: 2 }} />
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                          {da && <div title={da.name} style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#c4b5fd', flexShrink: 0 }}>{da.name[0]?.toUpperCase()}</div>}
                                          <span style={{ fontSize: 12, color: d.done ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: d.done ? 'line-through' : 'none', fontWeight: 500 }}>{d.title}</span>
                                        </div>
                                        {d.description && <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.4 }}>{d.description}</p>}
                                      </div>
                                      {isSuperAdmin && <button type="button" onClick={() => handleDeliverableDelete(m._id, m, d._id)} style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.05)', color: '#f87171', cursor: 'pointer', flexShrink: 0 }}>✕</button>}
                                    </div>
                                  )
                                })
                            }
                            {isSuperAdmin && (
                              <div style={{ marginTop: 6 }}>
                                {(m.assignedTo || []).length > 1 && (
                                  <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Pour :</span>
                                    <button type="button" onClick={() => setDeliverableInputs(s => ({ ...s, [m._id]: { ...(s[m._id] || { title: '', description: '' }), assignedTo: '' } }))}
                                      style={{ padding: '2px 7px', borderRadius: 9, border: `1px solid ${!deliverableInputs[m._id]?.assignedTo ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.07)'}`, background: !deliverableInputs[m._id]?.assignedTo ? 'rgba(139,92,246,0.08)' : 'transparent', color: !deliverableInputs[m._id]?.assignedTo ? '#c4b5fd' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>Tous</button>
                                    {(m.assignedTo || []).map(a => (
                                      <button key={a._id} type="button" onClick={() => setDeliverableInputs(s => ({ ...s, [m._id]: { ...(s[m._id] || { title: '', description: '' }), assignedTo: s[m._id]?.assignedTo === a._id ? '' : a._id } }))}
                                        style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 9, border: `1px solid ${deliverableInputs[m._id]?.assignedTo === a._id ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}`, background: deliverableInputs[m._id]?.assignedTo === a._id ? 'rgba(139,92,246,0.1)' : 'transparent', color: deliverableInputs[m._id]?.assignedTo === a._id ? '#c4b5fd' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
                                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(165,180,207,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700 }}>{a.name[0]?.toUpperCase()}</div>
                                        {a.name.split(' ')[0]}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: 5 }}>
                                  <input className="portal-input" value={deliverableInputs[m._id]?.title || ''} onChange={e => setDeliverableInputs(s => ({ ...s, [m._id]: { ...(s[m._id] || { description: '', assignedTo: '' }), title: e.target.value } }))}
                                    onKeyDown={e => { if (e.key === 'Enter') handleDeliverableAdd(m._id, m) }}
                                    placeholder="Livrable attendu…" style={{ fontSize: 12, padding: '5px 9px', flex: 1 }} />
                                  <button type="button" onClick={() => handleDeliverableAdd(m._id, m)}
                                    style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.08)', color: '#c4b5fd', fontSize: 14, cursor: 'pointer' }}>+</button>
                                </div>
                                <input className="portal-input" value={deliverableInputs[m._id]?.description || ''} onChange={e => setDeliverableInputs(s => ({ ...s, [m._id]: { ...(s[m._id] || { title: '', assignedTo: '' }), description: e.target.value } }))}
                                  placeholder="Description optionnelle" style={{ fontSize: 11, padding: '4px 9px', width: '100%', marginTop: 4, boxSizing: 'border-box' }} />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Fichiers */}
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text-secondary)', marginBottom: 8 }}>📎 Fichiers ({m.files?.length || 0})</div>
                          {m.files?.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                              {m.files.map(f => (
                                <div key={f._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                  <span style={{ fontSize: 13 }}>{f.mimeType.includes('pdf') ? '📄' : f.mimeType.startsWith('image/') ? '🖼️' : '📁'}</span>
                                  <button type="button" onClick={async () => {
                                    try {
                                      const { blob } = await apiDownload(`/api/admin/internal-projects/${id}/missions/${m._id}/files/${f._id}`)
                                      const url = URL.createObjectURL(blob)
                                      window.open(url, '_blank')
                                      setTimeout(() => URL.revokeObjectURL(url), 5000)
                                    } catch { showToast('Téléchargement impossible', 'error') }
                                  }} style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: 12, padding: 0, flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {f.originalName}
                                  </button>
                                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} Ko</span>
                                  <button type="button" onClick={() => handleDeleteFile(m._id, f._id)}
                                    style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.4)', cursor: 'pointer', fontSize: 11, padding: '0 2px', flexShrink: 0 }}>✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                          <input type="file" ref={el => { fileInputRefs.current[m._id] = el }} style={{ display: 'none' }}
                            disabled={uploadingFile[m._id]}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadFile(m._id, f); e.target.value = '' }} />
                          <button type="button" onClick={() => fileInputRefs.current[m._id]?.click()} disabled={uploadingFile[m._id]}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 11px', borderRadius: 7, border: '1px solid rgba(165,180,207,0.18)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            {uploadingFile[m._id] ? 'Envoi...' : 'Joindre un fichier'}
                          </button>
                        </div>

                        {/* Actions */}
                        <div style={{ padding: '12px 16px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {Object.entries(MSL).filter(([v]) => v !== m.status).map(([v, l]) => (
                            <button key={v} type="button" onClick={() => handleMissionStatus(m._id, v)}
                              style={{ padding: '4px 10px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)' }}>
                              {l}
                            </button>
                          ))}
                          {isSuperAdmin && (
                            <button type="button" onClick={() => handleDeleteMission(m._id)}
                              style={{ padding: '4px 10px', borderRadius: 12, border: '1px solid rgba(248,113,113,0.3)', fontSize: 12, cursor: 'pointer', background: 'transparent', color: '#f87171', marginLeft: 'auto' }}>
                              Supprimer
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div style={{ marginTop: 10, textAlign: 'right' }}>
                <Link to="/admin/gestion?view=missions" style={{ fontSize: 12, color: '#0ea5e9', textDecoration: 'none' }}>
                  Voir toutes les missions dans Gestion →
                </Link>
              </div>
            </div>
          )}
        </div>
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
