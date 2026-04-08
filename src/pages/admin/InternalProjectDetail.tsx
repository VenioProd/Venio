import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
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
  createdAt: string
  updatedAt: string
}

export default function InternalProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editStatus, setEditStatus] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    apiFetch<{ project: Project }>(`/api/admin/internal-projects/${id}`)
      .then(d => { setProject(d.project); setEditStatus(d.project.status) })
      .catch(() => showToast('Projet introuvable', 'error'))
      .finally(() => setLoading(false))
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
    } finally { setSavingStatus(false) }
  }

  const handleDelete = async () => {
    if (!project) return
    try {
      await apiFetch(`/api/admin/internal-projects/${project._id}`, { method: 'DELETE' })
      showToast('Projet supprimé', 'success')
      navigate('/admin/projets-internes')
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
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <Link to="/admin/projets-internes">Projets internes</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>{project.name}</span>
        </div>

        <div className="admin-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                background: 'rgba(14, 165, 233, 0.12)', border: '1px solid rgba(14, 165, 233, 0.3)', color: '#38bdf8',
              }}>{project.entity}</span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text,
              }}>{STATUS_LABELS[project.status] || project.status}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: PRIORITY_COLORS[project.priority] || 'var(--text-secondary)' }}>
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
                <button
                  key={v}
                  type="button"
                  disabled={savingStatus || editStatus === v}
                  onClick={() => handleStatusChange(v)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: 20,
                    border: '1px solid',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: editStatus === v ? 'default' : 'pointer',
                    background: editStatus === v ? c.bg : 'transparent',
                    borderColor: editStatus === v ? c.border : 'var(--border)',
                    color: editStatus === v ? c.text : 'var(--text-secondary)',
                    opacity: savingStatus ? 0.6 : 1,
                    transition: 'all .15s',
                  }}
                >{l}</button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Poles */}
      {project.poles.length > 0 && (
        <div className="portal-card" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>Pôles</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {project.poles.map(pole => (
              <span key={pole} style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.3)', color: '#c4b5fd' }}>
                {pole}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Members */}
      <div className="portal-card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
          Membres ({project.members.length})
        </h2>
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

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="portal-card" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>Tags</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {project.tags.map(tag => (
              <span key={tag} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 12, background: 'rgba(100,116,180,0.12)', border: '1px solid rgba(100,116,180,0.25)', color: '#a5b4cf' }}>
                #{tag}
              </span>
            ))}
          </div>
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
