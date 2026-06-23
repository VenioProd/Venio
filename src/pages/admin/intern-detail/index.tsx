import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { apiFetch, getToken } from '../../../lib/api'
import { useAuth } from '../../../context/AuthContext'
import { useConfirm } from '../../../hooks/useConfirm'
import {
  REPORT_STATUS_CONFIG,
  STATUS_CONFIG,
  formatDate,
  formatDateTime,
  formatFileSize,
  isImage,
} from '../intern-list/types'
import type { ActivityReport } from '../intern-list/types'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'
import DocPreviewModal from '../../../components/DocPreviewModal'

interface InternUser {
  _id: string
  name: string
  email: string
  phone?: string
  lastLoginAt?: string
}

interface InternFull {
  _id: string
  userId: InternUser
  type?: 'STAGIAIRE' | 'ALTERNANT'
  poste: string
  departement: string
  dateDebut: string
  dateFin: string
  tuteur: { _id: string; name: string; email: string } | null
  ecole: string
  formation: string
  notes: string
  joursPresence: string[]
  status: 'ACTIF' | 'TERMINE' | 'ANNULE'
  nextcloudUsername?: string
  nextcloudPassword?: string
  conventions?: { filename: string; originalName: string; size: number; uploadedAt: string }[]
  createdBy: { _id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

interface InternStats {
  totalReports: number
  reportsThisWeek: number
  validatedReports: number
  pendingReports: number
  validationRate: number
  lastActivity: string | null
  daysSinceLastReport: number | null
  progress: number
  daysRemaining: number
  totalDays: number
  elapsedDays: number
}

interface InternDetailData {
  intern: InternFull
  stats: InternStats
  reports: ActivityReport[]
}

const InternDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const { confirm, ConfirmDialog } = useConfirm()

  const [data, setData] = useState<InternDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reportView, setReportView] = useState<'cards' | 'liste'>('cards')
  const [expandedReport, setExpandedReport] = useState<string | null>(null)
  const [commentModal, setCommentModal] = useState<{ reportId: string; status: string } | null>(null)
  const [commentText, setCommentText] = useState('')
  const [conventionUploading, setConventionUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<{ url: string; name: string } | null>(null)

  const [form, setForm] = useState({
    type: 'STAGIAIRE' as 'STAGIAIRE' | 'ALTERNANT',
    poste: '',
    departement: '',
    dateDebut: '',
    dateFin: '',
    tuteur: '',
    ecole: '',
    formation: '',
    notes: '',
    status: '' as string,
    joursPresence: [] as string[],
  })
  const [admins, setAdmins] = useState<{ _id: string; name: string }[]>([])

  const loadData = useCallback(async () => {
    try {
      const res = await apiFetch<InternDetailData>(`/api/admin/interns/${id}/detail`)
      setData(res)
      setForm({
        poste: res.intern.poste,
        departement: res.intern.departement,
        dateDebut: res.intern.dateDebut.split('T')[0],
        dateFin: res.intern.dateFin.split('T')[0],
        type: res.intern.type || 'STAGIAIRE',
        tuteur: res.intern.tuteur?._id || '',
        ecole: res.intern.ecole,
        formation: res.intern.formation,
        notes: res.intern.notes,
        joursPresence: res.intern.joursPresence?.length
          ? res.intern.joursPresence
          : ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
        status: res.intern.status,
      })
    } catch {
      navigate('/admin/stagiaires')
    } finally {
      setLoading(false)
    }
  }, [id])

  const loadAdmins = useCallback(async () => {
    try {
      const d = await apiFetch<{ users: { _id: string; name: string }[] }>('/api/admin/admins')
      setAdmins(d.users || [])
    } catch {
      /* silent */
    }
  }, [])

  useEffect(() => {
    loadData()
    loadAdmins()
  }, [loadData, loadAdmins])

  const handleSave = async () => {
    setSubmitting(true)
    try {
      await apiFetch(`/api/admin/interns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          type: form.type,
          poste: form.poste,
          departement: form.departement,
          dateDebut: form.dateDebut,
          dateFin: form.dateFin,
          tuteur: form.tuteur || null,
          ecole: form.ecole,
          formation: form.formation,
          notes: form.notes,
          joursPresence: form.joursPresence,
          status: form.status,
        }),
      })
      setEditing(false)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    const ok = await confirm({
      message: 'Supprimer definitivement ce stagiaire et tous ses rapports ?',
      title: 'Suppression',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await apiFetch(`/api/admin/interns/${id}`, { method: 'DELETE' })
      navigate('/admin/stagiaires')
    } catch {
      /* silent */
    }
  }

  const handleValidateReport = async (reportId: string, status: string, commentaire?: string) => {
    try {
      const fd = new FormData()
      fd.append('status', status)
      if (commentaire !== undefined) fd.append('commentaireAdmin', commentaire)
      await fetch(`/api/admin/interns/reports/${reportId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      })
      loadData()
    } catch {
      /* silent */
    }
  }

  const handleSubmitComment = async () => {
    if (!commentModal) return
    await handleValidateReport(commentModal.reportId, commentModal.status, commentText)
    setCommentModal(null)
    setCommentText('')
  }

  const handleConventionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setConventionUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/admin/interns/${id}/convention`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert((err as { error?: string }).error || 'Erreur upload')
        return
      }
      loadData()
    } catch {
      alert('Erreur réseau')
    } finally {
      setConventionUploading(false)
      e.target.value = ''
    }
  }

  const handleConventionDelete = async (filename: string, originalName: string) => {
    const ok = await confirm({ message: `Supprimer "${originalName}" ?`, title: 'Suppression', variant: 'danger' })
    if (!ok) return
    try {
      await apiFetch(`/api/admin/interns/${id}/convention/${encodeURIComponent(filename)}`, { method: 'DELETE' })
      loadData()
    } catch {
      /* silent */
    }
  }

  if (loading)
    return (
      <div className="portal-container" style={{ padding: '60px 20px', textAlign: 'center', color: '#fff' }}>
        Chargement...
      </div>
    )
  if (!data) return null

  const { intern, stats, reports } = data
  const statusCfg = STATUS_CONFIG[intern.status]

  return (
    <div className="portal-container">
      {ConfirmDialog}

      {previewUrl && (
        <DocPreviewModal url={previewUrl.url} name={previewUrl.name} onClose={() => setPreviewUrl(null)} />
      )}

      {/* Modal commentaire */}
      {commentModal && (
        <div className="confirm-modal-overlay" onClick={() => setCommentModal(null)}>
          <div
            className="confirm-modal confirm-modal--info"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="confirm-modal__header">
              <h2 className="confirm-modal__title">Commentaire pour le stagiaire</h2>
              <button
                className="confirm-modal__close"
                onClick={() => setCommentModal(null)}
                type="button"
                aria-label="Fermer"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="confirm-modal__body">
              <div className="ticket-form-field">
                <label>Votre commentaire</label>
                <textarea
                  rows={4}
                  placeholder="Ecrivez votre retour..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="confirm-modal__footer">
              <button className="confirm-modal__btn confirm-modal__btn--cancel" onClick={() => setCommentModal(null)}>
                Annuler
              </button>
              <button
                className="confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--info"
                onClick={handleSubmitComment}
              >
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="ticket-hero">
        <div className="ticket-hero-content">
          <Link to="/admin/stagiaires" className="ticket-back-btn">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Retour à l'équipe
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: statusCfg.color + '22',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: statusCfg.color,
                fontWeight: 700,
                fontSize: 22,
              }}
            >
              {intern.userId.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="ticket-hero-title" style={{ margin: 0 }}>
                {intern.userId.name}
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.5)', margin: '4px 0 0', fontSize: 14 }}>
                {intern.poste}
                {intern.departement ? ` — ${intern.departement}` : ''}
              </p>
            </div>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                background: 'rgba(14, 165, 233, 0.15)',
                color: 'var(--primary)',
              }}
            >
              {intern.type === 'ALTERNANT' ? 'Alternant' : 'Stagiaire'}
            </span>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                background: statusCfg.color + '22',
                color: statusCfg.color,
              }}
            >
              {statusCfg.label}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isSuperAdmin && !editing && (
            <>
              <button className="ticket-new-btn" onClick={() => setEditing(true)} style={{ fontSize: 13 }}>
                Modifier
              </button>
              <button className="ticket-back-btn" onClick={handleDelete} style={{ fontSize: 13, color: '#ef4444' }}>
                Supprimer
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="ticket-stats" style={{ marginBottom: 20 }}>
        <StatCard value={String(stats.totalReports)} label="Rapports total" color="var(--primary)" />
        <StatCard value={String(stats.reportsThisWeek)} label="Cette semaine" color="#22c55e" />
        <StatCard value={`${stats.validationRate}%`} label="Taux validation" color="var(--primary)" />
        <StatCard
          value={String(stats.pendingReports)}
          label="En attente"
          color={stats.pendingReports > 0 ? '#f59e0b' : 'rgba(255,255,255,0.3)'}
        />
        <StatCard
          value={
            stats.daysSinceLastReport === null
              ? '—'
              : stats.daysSinceLastReport === 0
                ? "Aujourd'hui"
                : `${stats.daysSinceLastReport}j`
          }
          label="Dernier rapport"
          color={
            stats.daysSinceLastReport === null
              ? 'rgba(255,255,255,0.3)'
              : stats.daysSinceLastReport > 3
                ? '#ef4444'
                : stats.daysSinceLastReport > 1
                  ? '#f59e0b'
                  : '#22c55e'
          }
        />
      </div>

      {/* Infos + Edit */}
      <div className="portal-card" style={{ marginBottom: 20 }}>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: 16 }}>Informations du stage</h3>
            {editing && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="ticket-new-btn"
                  onClick={handleSave}
                  disabled={submitting}
                  style={{ fontSize: 12, padding: '6px 14px' }}
                >
                  {submitting ? 'Enregistrement...' : 'Enregistrer'}
                </button>
                <button
                  className="ticket-back-btn"
                  onClick={() => setEditing(false)}
                  style={{ fontSize: 12, padding: '6px 14px' }}
                >
                  Annuler
                </button>
              </div>
            )}
          </div>

          {!editing ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              <InfoField label="Email" value={intern.userId.email} />
              <InfoField label="Telephone" value={intern.userId.phone || '—'} />
              <InfoField label="Poste / Mission" value={intern.poste} />
              <InfoField label="Departement" value={intern.departement || '—'} />
              <InfoField label="Date de debut" value={formatDate(intern.dateDebut)} />
              <InfoField label="Date de fin" value={formatDate(intern.dateFin)} />
              <InfoField label="Tuteur" value={intern.tuteur?.name || '—'} />
              <InfoField label="Ecole" value={intern.ecole || '—'} />
              <InfoField label="Formation" value={intern.formation || '—'} />
              <InfoField
                label="Jours de présence"
                value={
                  intern.joursPresence?.length
                    ? intern.joursPresence.map((j) => j.charAt(0).toUpperCase() + j.slice(1)).join(', ')
                    : '—'
                }
              />
              <InfoField label="Statut" value={statusCfg.label} color={statusCfg.color} />
              <InfoField label="Cree par" value={intern.createdBy?.name || '—'} />
              <InfoField
                label="Jours restants"
                value={stats.daysRemaining > 0 ? `${stats.daysRemaining} jours` : 'Termine'}
                color={stats.daysRemaining <= 7 ? '#ef4444' : stats.daysRemaining <= 30 ? '#f59e0b' : undefined}
              />
            </div>
          ) : (
            <div className="ticket-form">
              <div className="ticket-form-row">
                <div className="ticket-form-field">
                  <label>Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as 'STAGIAIRE' | 'ALTERNANT' })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'inherit',
                      fontSize: 14,
                    }}
                  >
                    <option value="STAGIAIRE">Stagiaire</option>
                    <option value="ALTERNANT">Alternant</option>
                  </select>
                </div>
                <div className="ticket-form-field">
                  <label>Poste / Mission</label>
                  <input value={form.poste} onChange={(e) => setForm({ ...form, poste: e.target.value })} />
                </div>
                <div className="ticket-form-field">
                  <label>Departement</label>
                  <input value={form.departement} onChange={(e) => setForm({ ...form, departement: e.target.value })} />
                </div>
              </div>
              <div className="ticket-form-row">
                <div className="ticket-form-field">
                  <label>Date de debut</label>
                  <input
                    type="date"
                    value={form.dateDebut}
                    onChange={(e) => setForm({ ...form, dateDebut: e.target.value })}
                  />
                </div>
                <div className="ticket-form-field">
                  <label>Date de fin</label>
                  <input
                    type="date"
                    value={form.dateFin}
                    onChange={(e) => setForm({ ...form, dateFin: e.target.value })}
                  />
                </div>
              </div>
              <div className="ticket-form-row">
                <div className="ticket-form-field">
                  <label>Tuteur</label>
                  <select value={form.tuteur} onChange={(e) => setForm({ ...form, tuteur: e.target.value })}>
                    <option value="">— Aucun —</option>
                    {admins.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ticket-form-field">
                  <label>Statut</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="ACTIF">Actif</option>
                    <option value="TERMINE">Termine</option>
                    <option value="ANNULE">Annule</option>
                  </select>
                </div>
              </div>
              <div className="ticket-form-row">
                <div className="ticket-form-field">
                  <label>Ecole / Universite</label>
                  <input value={form.ecole} onChange={(e) => setForm({ ...form, ecole: e.target.value })} />
                </div>
                <div className="ticket-form-field">
                  <label>Formation</label>
                  <input value={form.formation} onChange={(e) => setForm({ ...form, formation: e.target.value })} />
                </div>
              </div>
              <div className="ticket-form-field">
                <label>Notes internes</label>
                <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="ticket-form-field">
                <label>Jours de présence</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].map((jour) => {
                    const checked = form.joursPresence.includes(jour)
                    return (
                      <label
                        key={jour}
                        onClick={() => {
                          const next = checked
                            ? form.joursPresence.filter((j) => j !== jour)
                            : [...form.joursPresence, jour]
                          setForm({ ...form, joursPresence: next })
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          cursor: 'pointer',
                          padding: '5px 12px',
                          borderRadius: 6,
                          background: checked ? 'rgba(14, 165, 233, 0.15)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${checked ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`,
                          fontSize: 13,
                          color: checked ? 'var(--primary)' : 'rgba(255,255,255,0.5)',
                          transition: 'all 0.15s',
                          userSelect: 'none',
                        }}
                      >
                        {jour.charAt(0).toUpperCase() + jour.slice(1)}
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Barre de progression du stage */}
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Progression du stage</span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{stats.progress}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 3,
                  width: `${stats.progress}%`,
                  background: stats.progress >= 90 ? '#ef4444' : stats.progress >= 70 ? '#f59e0b' : 'var(--primary)',
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{formatDate(intern.dateDebut)}</span>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{formatDate(intern.dateFin)}</span>
            </div>
          </div>

          {/* Notes internes */}
          {intern.notes && !editing && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 8,
                background: 'rgba(14, 165, 233, 0.06)',
                borderLeft: '3px solid var(--primary)',
              }}
            >
              <span style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 600 }}>Notes internes</span>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                {intern.notes}
              </p>
            </div>
          )}

          {/* Compte Nextcloud */}
          {!editing && intern.nextcloudUsername && (
            <div
              style={{
                marginTop: 16,
                padding: '14px 16px',
                borderRadius: 8,
                background: 'rgba(14, 165, 233, 0.06)',
                borderLeft: '3px solid var(--primary)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 600 }}>Compte Nextcloud</span>
                <a
                  href="https://cloud.susanoo.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--primary)',
                    fontSize: 11,
                    textDecoration: 'none',
                    padding: '3px 8px',
                    borderRadius: 4,
                    border: '1px solid rgba(14, 165, 233, 0.3)',
                    background: 'rgba(14, 165, 233, 0.08)',
                  }}
                >
                  Ouvrir Nextcloud
                </a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, display: 'block', marginBottom: 2 }}>
                    Identifiant
                  </span>
                  <code
                    style={{
                      color: 'rgba(255,255,255,0.85)',
                      fontSize: 13,
                      background: 'rgba(255,255,255,0.04)',
                      padding: '3px 8px',
                      borderRadius: 4,
                    }}
                  >
                    {intern.nextcloudUsername}
                  </code>
                </div>
                {intern.nextcloudPassword && (
                  <div>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, display: 'block', marginBottom: 2 }}>
                      Mot de passe initial
                    </span>
                    <code
                      style={{
                        color: 'rgba(255,255,255,0.85)',
                        fontSize: 13,
                        background: 'rgba(255,255,255,0.04)',
                        padding: '3px 8px',
                        borderRadius: 4,
                      }}
                    >
                      {intern.nextcloudPassword}
                    </code>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Conventions de stage */}
      <div className="portal-card" style={{ marginBottom: 20 }}>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, color: '#f59e0b', fontSize: 16 }}>
              Conventions de stage
              {(intern.conventions?.length ?? 0) > 0 && (
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>
                  {intern.conventions!.length} fichier{intern.conventions!.length > 1 ? 's' : ''}
                </span>
              )}
            </h3>
            <label
              style={{
                display: 'inline-block',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                background: conventionUploading ? 'rgba(255,255,255,0.06)' : 'rgba(14, 165, 233, 0.15)',
                color: conventionUploading ? 'rgba(255,255,255,0.3)' : 'var(--primary)',
                border: '1px solid rgba(14, 165, 233, 0.3)',
                cursor: conventionUploading ? 'not-allowed' : 'pointer',
              }}
            >
              {conventionUploading ? 'Envoi...' : '+ Ajouter'}
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                style={{ display: 'none' }}
                onChange={handleConventionUpload}
                disabled={conventionUploading}
              />
            </label>
          </div>

          {(intern.conventions?.length ?? 0) === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>Aucune convention déposée</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {intern.conventions!.map((conv) => (
                <div
                  key={conv.filename}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: 'rgba(245,158,11,0.05)',
                    border: '1px solid rgba(245,158,11,0.12)',
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: 'rgba(255,255,255,0.85)',
                        fontSize: 13,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {conv.originalName}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 1 }}>
                      {formatFileSize(conv.size)} — {formatDate(conv.uploadedAt)}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setPreviewUrl({
                        url: `/api/admin/interns/conventions/files/${conv.filename}`,
                        name: conv.originalName,
                      })
                    }
                    style={{
                      padding: '5px 10px',
                      borderRadius: 5,
                      fontSize: 12,
                      background: 'rgba(14, 165, 233, 0.08)',
                      color: 'var(--primary)',
                      border: '1px solid rgba(14, 165, 233, 0.2)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    Voir
                  </button>
                  <a
                    href={`/api/admin/interns/conventions/files/${conv.filename}`}
                    download={conv.originalName}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 5,
                      fontSize: 12,
                      background: 'rgba(245,158,11,0.08)',
                      color: '#f59e0b',
                      border: '1px solid rgba(245,158,11,0.2)',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    Télécharger
                  </a>
                  {isSuperAdmin && (
                    <button
                      onClick={() => handleConventionDelete(conv.filename, conv.originalName)}
                      style={{
                        padding: '5px 8px',
                        borderRadius: 5,
                        fontSize: 12,
                        background: 'rgba(239,68,68,0.06)',
                        color: '#ef4444',
                        border: '1px solid rgba(239,68,68,0.15)',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rapports d'activite */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: '#fff', fontSize: 16 }}>Rapports d'activite ({reports.length})</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['cards', 'liste'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setReportView(v)}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background: reportView === v ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                color: reportView === v ? '#fff' : 'rgba(255,255,255,0.5)',
                transition: 'all 0.2s',
              }}
            >
              {v === 'cards' ? 'Cards' : 'Liste'}
            </button>
          ))}
        </div>
      </div>

      {reports.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Aucun rapport soumis</p>
      ) : reportView === 'liste' ? (
        /* ── VUE LISTE (tableau) ── */
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {['Date', 'Statut', 'Taches', 'Fichiers', 'Compte-rendu', 'Actions'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 8px',
                      textAlign: 'left',
                      color: 'rgba(255,255,255,0.5)',
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const sCfg = REPORT_STATUS_CONFIG[report.status]
                return (
                  <tr
                    key={report._id}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 8px', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {formatDate(report.date)}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: sCfg.color + '22',
                          color: sCfg.color,
                        }}
                      >
                        {sCfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.7)' }}>{report.taches.length}</td>
                    <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.7)' }}>{report.attachments.length}</td>
                    <td
                      style={{
                        padding: '10px 8px',
                        color: 'rgba(255,255,255,0.6)',
                        maxWidth: 300,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {report.contenu.length > 80 ? report.contenu.slice(0, 80) + '...' : report.contenu}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setExpandedReport(expandedReport === report._id ? null : report._id)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            cursor: 'pointer',
                            border: '1px solid rgba(14, 165, 233, 0.3)',
                            background: 'rgba(14, 165, 233, 0.08)',
                            color: 'var(--primary)',
                          }}
                        >
                          {expandedReport === report._id ? 'Fermer' : 'Voir'}
                        </button>
                        {isSuperAdmin && report.status === 'SOUMIS' && (
                          <button
                            onClick={() => handleValidateReport(report._id, 'VALIDE')}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              cursor: 'pointer',
                              border: '1px solid rgba(34,197,94,0.3)',
                              background: 'rgba(34,197,94,0.08)',
                              color: '#22c55e',
                            }}
                          >
                            Valider
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Detail expanded en dessous du tableau */}
          {expandedReport &&
            (() => {
              const report = reports.find((r) => r._id === expandedReport)
              if (!report) return null
              const sCfg = REPORT_STATUS_CONFIG[report.status]
              return (
                <div className="portal-card" style={{ marginTop: 8, borderLeft: `3px solid ${sCfg.color}` }}>
                  <div style={{ padding: '16px 20px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 12,
                      }}
                    >
                      <span style={{ color: '#fff', fontWeight: 600 }}>{formatDate(report.date)}</span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: sCfg.color + '22',
                          color: sCfg.color,
                        }}
                      >
                        {sCfg.label}
                      </span>
                    </div>
                    <p
                      style={{
                        color: 'rgba(255,255,255,0.8)',
                        fontSize: 14,
                        margin: '0 0 12px',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.6,
                      }}
                    >
                      {report.contenu}
                    </p>
                    {report.taches.length > 0 && (
                      <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
                        {report.taches.map((t, i) => (
                          <li key={i} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 4 }}>
                            {t}
                          </li>
                        ))}
                      </ul>
                    )}
                    {report.attachments.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        {report.attachments.map((f, i) => (
                          <button
                            key={i}
                            onClick={() =>
                              setPreviewUrl({
                                url: `/api/admin/interns/reports/files/${f.filename}`,
                                name: f.originalName,
                              })
                            }
                            style={{
                              padding: '6px 10px',
                              borderRadius: 6,
                              background: 'rgba(255,255,255,0.04)',
                              color: 'var(--primary)',
                              fontSize: 12,
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            {f.originalName}{' '}
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
                              ({formatFileSize(f.size)})
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {report.commentaireAdmin && (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: 6,
                          background: 'rgba(14, 165, 233, 0.08)',
                          borderLeft: '3px solid var(--primary)',
                          marginBottom: 12,
                        }}
                      >
                        <span style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 600 }}>
                          Commentaire admin
                        </span>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '4px 0 0' }}>
                          {report.commentaireAdmin}
                        </p>
                      </div>
                    )}
                    {report.status === 'VALIDE' && report.validePar && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                        Valide par {report.validePar.name}
                        {report.valideAt ? ` le ${formatDateTime(report.valideAt)}` : ''}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
        </div>
      ) : (
        /* ── VUE CARDS (existante) ── */
        <div className="ticket-list">
          {reports.map((report) => {
            const expanded = expandedReport === report._id
            const sCfg = REPORT_STATUS_CONFIG[report.status]
            return (
              <div key={report._id} className="ticket-card" style={{ borderLeft: `3px solid ${sCfg.color}` }}>
                <div
                  className="ticket-card-header"
                  onClick={() => setExpandedReport(expanded ? null : report._id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ flex: 1 }}>
                    <span style={{ color: '#fff', fontWeight: 600 }}>{formatDate(report.date)}</span>
                    {report.taches.length > 0 && (
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginLeft: 10 }}>
                        {report.taches.length} tache(s)
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {report.attachments.length > 0 && (
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                        {report.attachments.length} fichier(s)
                      </span>
                    )}
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: sCfg.color + '22',
                        color: sCfg.color,
                      }}
                    >
                      {sCfg.label}
                    </span>
                    <span
                      style={{
                        color: 'rgba(255,255,255,0.3)',
                        transform: expanded ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s',
                      }}
                    >
                      &#9660;
                    </span>
                  </div>
                </div>
                {expanded && (
                  <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ marginBottom: 12 }}>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Compte-rendu</span>
                      <p
                        style={{
                          color: 'rgba(255,255,255,0.8)',
                          fontSize: 14,
                          margin: '4px 0 0',
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.6,
                        }}
                      >
                        {report.contenu}
                      </p>
                    </div>
                    {report.taches.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Taches realisees</span>
                        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                          {report.taches.map((t, i) => (
                            <li key={i} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 4 }}>
                              {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {report.attachments.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Pieces jointes</span>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                          {report.attachments.map((f, i) => (
                            <button
                              key={i}
                              onClick={() =>
                                setPreviewUrl({
                                  url: `/api/admin/interns/reports/files/${f.filename}`,
                                  name: f.originalName,
                                })
                              }
                              style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                background: 'rgba(255,255,255,0.04)',
                                color: 'var(--primary)',
                                fontSize: 12,
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              {isImage(f.mimetype) ? '~img' : '~doc'} {f.originalName}
                              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
                                ({formatFileSize(f.size)})
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {report.commentaireAdmin && (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: 6,
                          background: 'rgba(14, 165, 233, 0.08)',
                          marginBottom: 12,
                          borderLeft: '3px solid var(--primary)',
                        }}
                      >
                        <span style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 600 }}>
                          Commentaire admin
                        </span>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '4px 0 0' }}>
                          {report.commentaireAdmin}
                        </p>
                      </div>
                    )}
                    {report.status === 'VALIDE' && report.validePar && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
                        Valide par {report.validePar.name}
                        {report.valideAt ? ` le ${formatDateTime(report.valideAt)}` : ''}
                      </div>
                    )}
                    {isSuperAdmin && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        {report.status === 'SOUMIS' && (
                          <button
                            className="ticket-new-btn"
                            style={{ fontSize: 12, padding: '6px 14px' }}
                            onClick={() => handleValidateReport(report._id, 'VALIDE')}
                          >
                            Valider
                          </button>
                        )}
                        <button
                          className="ticket-back-btn"
                          style={{ fontSize: 12, padding: '6px 14px' }}
                          onClick={() => {
                            setCommentModal({ reportId: report._id, status: report.status })
                            setCommentText(report.commentaireAdmin || '')
                          }}
                        >
                          Commenter
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const StatCard = ({ value, label, color }: { value: string; label: string; color: string }) => (
  <div className="ticket-stat-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <span style={{ color, fontWeight: 700, fontSize: 22, display: 'block' }}>{value}</span>
    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, display: 'block' }}>{label}</span>
  </div>
)

const InfoField = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div>
    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, display: 'block', marginBottom: 2 }}>{label}</span>
    <span style={{ color: color || 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 500 }}>{value}</span>
  </div>
)

export default InternDetail
