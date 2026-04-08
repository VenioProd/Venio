import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch, getToken } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import ConfirmModal from '../../components/ConfirmModal'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

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

interface Member { _id: string; name: string; email: string; role: string }

interface Mission {
  _id: string; title: string; description: string; status: string; dueDate: string | null
  assignedTo: { _id: string; name: string; email: string }
  internalProject: { _id: string; name: string; entity: string }
  steps: { _id: string; title: string; done: boolean; waitingReview: boolean }[]
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

  const [viewTab, setViewTab] = useState<'projects' | 'missions'>('projects')

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
  const [expandedMission, setExpandedMission] = useState<string | null>(null)
  const [missionStepInputs, setMissionStepInputs] = useState<Record<string, string>>({})
  const [uploadingMission, setUploadingMission] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

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
    } catch (err: any) {
      showToast(err.message || 'Erreur', 'error')
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
    } catch (err: any) { showToast(err.message || 'Erreur', 'error') }
  }

  const togglePole = (pole: string) => {
    setForm(f => ({ ...f, poles: f.poles.includes(pole) ? f.poles.filter(p => p !== pole) : [...f.poles, pole] }))
  }
  const toggleMember = (id: string) => {
    setForm(f => ({ ...f, members: f.members.includes(id) ? f.members.filter(m => m !== id) : [...f.members, id] }))
  }

  useEffect(() => {
    if (viewTab !== 'missions') return
    setMissionsLoading(true)
    apiFetch<{ missions: Mission[] }>('/api/admin/internal-projects/missions')
      .then(d => setMissions(d.missions || []))
      .catch(() => {})
      .finally(() => setMissionsLoading(false))
  }, [viewTab])

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

  const handleMissionAddStep = async (missionId: string, projectId: string, mission: Mission, title: string) => {
    const newSteps = [...mission.steps, { title, done: false }]
    try {
      const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH', body: JSON.stringify({ steps: newSteps }),
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

      {/* ─── MISSIONS TAB ─── */}
      {viewTab === 'missions' && (
        <div style={{ marginTop: 20 }}>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {(['Projet', 'Mission', ...(isSuperAdmin ? ['Assigné à'] : []), 'Statut', 'Progression', 'Fichiers', 'Deadline', '']).map((h, i) => (
                      <th key={i} style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px' }}>{h}</th>
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
                    const pct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0
                    const isExpanded = expandedMission === m._id
                    const colCount = isSuperAdmin ? 8 : 7
                    return (
                      <>
                        <tr key={m._id}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent', transition: 'background .15s' }}
                          onClick={() => setExpandedMission(isExpanded ? null : m._id)}
                        >
                          <td style={{ padding: '11px 14px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 12 }}>{m.internalProject?.name || '—'}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{m.internalProject?.entity}</div>
                          </td>
                          <td style={{ padding: '11px 14px', maxWidth: 220 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{m.title}</div>
                            {m.description && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{m.description}</div>}
                          </td>
                          {isSuperAdmin && (
                            <td style={{ padding: '11px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(165,180,207,0.15)', border: '1px solid rgba(165,180,207,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#a5b4cf', flexShrink: 0 }}>
                                  {m.assignedTo?.name?.[0]?.toUpperCase()}
                                </div>
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.assignedTo?.name}</span>
                              </div>
                            </td>
                          )}
                          <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, color: statusColor[m.status] || '#a5b4cf', background: statusBg[m.status] || 'rgba(255,255,255,0.05)', border: `1px solid ${statusBorder[m.status] || 'rgba(255,255,255,0.1)'}`, whiteSpace: 'nowrap' }}>
                                {statusLabel[m.status] || m.status}
                              </span>
                              {(['A_FAIRE', 'EN_COURS', 'TERMINE'] as const).filter(v => v !== m.status).map(v => (
                                <button key={v} type="button" onClick={() => handleMissionStatusUpdate(m._id, m.internalProject?._id, v)}
                                  style={{ padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', fontSize: 10, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                  {statusLabel[v]}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '11px 14px', minWidth: 90 }}>
                            {totalSteps > 0 ? (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{doneCount}/{totalSteps}</span>
                                  <span style={{ fontSize: 10, color: pct === 100 ? '#6ee7b7' : 'var(--text-secondary)' }}>{pct}%</span>
                                </div>
                                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                                  <div style={{ height: '100%', borderRadius: 2, background: pct === 100 ? '#10b981' : '#38bdf8', width: `${pct}%`, transition: 'width .3s' }} />
                                </div>
                              </div>
                            ) : <span style={{ fontSize: 12, color: 'rgba(165,180,207,0.4)' }}>—</span>}
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            {(m.files?.length ?? 0) > 0 ? (
                              <span style={{ fontSize: 11, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                {m.files.length}
                              </span>
                            ) : <span style={{ fontSize: 12, color: 'rgba(165,180,207,0.4)' }}>—</span>}
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <span style={{ fontSize: 12, color: isOverdue ? '#f87171' : 'var(--text-secondary)', fontWeight: isOverdue ? 600 : 400 }}>
                              {isOverdue && '⚠ '}{m.dueDate ? new Date(m.dueDate).toLocaleDateString('fr-FR') : '—'}
                            </span>
                          </td>
                          <td style={{ padding: '11px 8px', textAlign: 'center' }}>
                            <span style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</span>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${m._id}-exp`}>
                            <td colSpan={colCount} style={{ padding: '0 14px 14px', background: 'rgba(255,255,255,0.015)' }}>
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                {/* Étapes */}
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text-secondary)', marginBottom: 10 }}>Étapes</div>
                                  {totalSteps > 0 ? m.steps.map(step => (
                                    <div key={step._id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '5px 8px', borderRadius: 6, background: step.waitingReview ? 'rgba(234,179,8,0.06)' : 'transparent', border: step.waitingReview ? '1px solid rgba(234,179,8,0.2)' : '1px solid transparent' }}>
                                      <input type="checkbox" checked={step.done}
                                        onChange={() => handleMissionToggleStep(m._id, m.internalProject?._id, m, step._id)}
                                        style={{ cursor: 'pointer', width: 13, height: 13, accentColor: '#10b981', flexShrink: 0 }} />
                                      <span style={{ fontSize: 12, flex: 1, color: step.done ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: step.done ? 'line-through' : 'none' }}>{step.title}</span>
                                      {step.waitingReview && !step.done && (
                                        <>
                                          <span style={{ fontSize: 10, color: '#fde047', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 8, padding: '1px 6px', whiteSpace: 'nowrap' }}>En attente</span>
                                          {isSuperAdmin && (
                                            <button type="button" onClick={async () => {
                                              try {
                                                const data = await apiFetch<{ mission: Mission }>(`/api/admin/internal-projects/${m.internalProject?._id}/missions/${m._id}/steps/${step._id}/validate-step`, { method: 'POST' })
                                                setMissions(ms => ms.map(x => x._id === m._id ? data.mission : x))
                                              } catch { /* silent */ }
                                            }} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.1)', color: '#6ee7b7', cursor: 'pointer' }}>✓ Valider</button>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  )) : <p style={{ fontSize: 12, color: 'rgba(165,180,207,0.4)', marginBottom: 10 }}>Aucune étape</p>}
                                  {isSuperAdmin && (
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                      <input className="portal-input" value={missionStepInputs[m._id] || ''} onChange={e => setMissionStepInputs(s => ({ ...s, [m._id]: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter' && missionStepInputs[m._id]?.trim()) handleMissionAddStep(m._id, m.internalProject?._id, m, missionStepInputs[m._id].trim()) }}
                                        placeholder="Nouvelle étape… (Entrée)" style={{ fontSize: 12, padding: '5px 8px', flex: 1 }} />
                                      <button type="button" onClick={() => { if (missionStepInputs[m._id]?.trim()) handleMissionAddStep(m._id, m.internalProject?._id, m, missionStepInputs[m._id].trim()) }}
                                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(14,165,233,0.3)', background: 'rgba(14,165,233,0.08)', color: '#38bdf8', fontSize: 13, cursor: 'pointer' }}>+</button>
                                    </div>
                                  )}
                                </div>
                                {/* Fichiers + Deadline */}
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text-secondary)', marginBottom: 10 }}>Fichiers</div>
                                  {(m.files?.length ?? 0) === 0 ? <p style={{ fontSize: 12, color: 'rgba(165,180,207,0.4)', marginBottom: 10 }}>Aucun fichier joint</p> : (
                                    <div style={{ marginBottom: 10 }}>
                                      {m.files.map(f => (
                                        <div key={f._id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, padding: '5px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                          <span style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.originalName}</span>
                                          <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>{f.size > 1048576 ? `${(f.size/1048576).toFixed(1)} Mo` : `${Math.round(f.size/1024)} Ko`}</span>
                                          <button type="button" onClick={e => { e.stopPropagation(); handleMissionFileOpen(m._id, m.internalProject?._id, f._id) }} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, border: '1px solid rgba(14,165,233,0.3)', background: 'rgba(14,165,233,0.08)', color: '#38bdf8', cursor: 'pointer', flexShrink: 0 }}>Ouvrir</button>
                                          {isSuperAdmin && <button type="button" onClick={e => { e.stopPropagation(); handleMissionFileDelete(m._id, m.internalProject?._id, f._id) }} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.06)', color: '#f87171', cursor: 'pointer', flexShrink: 0 }}>✕</button>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input type="file" ref={el => { fileInputRefs.current[m._id] = el }} style={{ display: 'none' }}
                                      onChange={async e => { const file = e.target.files?.[0]; if (file) await handleMissionFileUpload(m._id, m.internalProject?._id, file); e.target.value = '' }} />
                                    <button type="button" onClick={e => { e.stopPropagation(); fileInputRefs.current[m._id]?.click() }} disabled={uploadingMission === m._id}
                                      style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(165,180,207,0.2)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                      {uploadingMission === m._id ? 'Envoi...' : 'Joindre un fichier'}
                                    </button>
                                  </div>
                                  {isSuperAdmin && (
                                    <div style={{ marginTop: 14 }}>
                                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text-secondary)', marginBottom: 6 }}>Deadline</div>
                                      <input type="date" defaultValue={m.dueDate ? m.dueDate.substring(0, 10) : ''}
                                        onBlur={e => handleMissionDateUpdate(m._id, m.internalProject?._id, e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', cursor: 'pointer' }} />
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
