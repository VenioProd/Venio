import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
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

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
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
              <div>
                <label className="portal-label">Date de début</label>
                <input type="date" className="portal-input" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <label className="portal-label">Date de fin prévue</label>
                <input type="date" className="portal-input" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
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

      {/* Projects list */}
      <div style={{ marginTop: 20 }}>
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
      </div>

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
