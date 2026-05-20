import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Check, X, Trash2, Calendar, User, ChevronDown, ChevronUp, Paperclip } from 'lucide-react'
import { apiFetch, getToken } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

type DecisionStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type DecisionCategory = 'BUDGET' | 'EMBAUCHE' | 'PROJET' | 'PARTENARIAT' | 'AUTRE'
type DecisionPriority = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'

interface UserRef { _id: string; name?: string; email?: string; avatarUrl?: string }

interface DecisionAttachment {
  originalName: string
  mimeType: string
  size: number
}

interface Decision {
  _id: string
  title: string
  description: string
  category: DecisionCategory
  priority: DecisionPriority
  status: DecisionStatus
  submittedBy: UserRef | string
  submittedByName: string
  decidedBy?: string | UserRef
  decidedByName?: string
  decisionComment?: string
  decidedAt?: string
  context?: string
  options?: string[]
  recommendation?: string
  deadline?: string
  attachments?: DecisionAttachment[]
  recipients?: UserRef[]
  createdAt: string
  updatedAt: string
}

function formatFileSize(bytes: number): string {
  if (!bytes) return ''
  const units = ['o', 'Ko', 'Mo']
  let size = bytes, i = 0
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

interface FilePreview { objectUrl: string; name: string; mimeType: string }

async function fetchDecisionBlob(decisionId: string, index: number): Promise<{ blob: Blob; error?: never } | { error: string; blob?: never }> {
  const token = getToken()
  const res = await fetch(`/api/admin/decisions/${decisionId}/attachments/${index}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const d = await res.json().catch(() => null)
    return { error: (d as any)?.error || `Erreur ${res.status}` }
  }
  return { blob: await res.blob() }
}

function forceDownload(objectUrl: string, name: string) {
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function FilePreviewModal({ preview, onClose }: { preview: FilePreview; onClose: () => void }) {
  const isImage = preview.mimeType?.startsWith('image/')
  const isPdf = preview.mimeType === 'application/pdf'
  const isVideo = preview.mimeType?.startsWith('video/')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 2001, width: 'calc(100% - 32px)', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-card,#1e293b)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.name}</span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button type="button" onClick={() => forceDownload(preview.objectUrl, preview.name)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}>
              Télécharger
            </button>
            <button type="button" onClick={onClose} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.12)', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#ef4444' }}>
              <X size={16} />
            </button>
          </div>
        </div>
        {/* Contenu */}
        <div style={{ flex: 1, overflow: 'auto', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          {isImage && <img src={preview.objectUrl} alt={preview.name} style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block' }} />}
          {isPdf && <iframe src={preview.objectUrl} title={preview.name} style={{ width: '100%', height: '80vh', border: 'none', display: 'block' }} />}
          {isVideo && <video src={preview.objectUrl} controls style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }} />}
          {!isImage && !isPdf && !isVideo && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 48, background: 'var(--bg-card,#1e293b)' }}>
              <Paperclip size={48} style={{ color: 'var(--text-muted)' }} />
              <p style={{ color: 'var(--text-primary)', fontWeight: 500, margin: 0 }}>{preview.name}</p>
              <button type="button" onClick={() => forceDownload(preview.objectUrl, preview.name)} style={{ padding: '10px 24px', background: 'var(--primary,#7c3aed)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                Télécharger
              </button>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}

const PRIORITY_COLORS: Record<DecisionPriority, string> = {
  BASSE: '#64748b',
  NORMALE: '#0ea5e9',
  HAUTE: '#f59e0b',
  URGENTE: '#ef4444',
}

const CATEGORIES: DecisionCategory[] = ['BUDGET', 'EMBAUCHE', 'PROJET', 'PARTENARIAT', 'AUTRE']
const PRIORITIES: DecisionPriority[] = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'MINE'

const TABS: { key: Tab; label: string }[] = [
  { key: 'PENDING', label: 'En attente' },
  { key: 'APPROVED', label: 'Approuvées' },
  { key: 'REJECTED', label: 'Rejetées' },
  { key: 'MINE', label: 'Mes soumissions' },
]

function getSubmitterId(d: Decision): string {
  return typeof d.submittedBy === 'string' ? d.submittedBy : d.submittedBy?._id || ''
}

export default function DecisionsList() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const isSuperAdmin = ['SUPER_ADMIN', 'PDG'].includes(user?.role || '')
  const currentUserId = user?._id || ''

  const [tab, setTab] = useState<Tab>('PENDING')
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [preview, setPreview] = useState<FilePreview | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const openPreview = async (decisionId: string, index: number, name: string, mimeType: string) => {
    const result = await fetchDecisionBlob(decisionId, index)
    if (result.error || !result.blob) { showToast(result.error ?? 'Erreur', 'error'); return }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(result.blob)
    previewUrlRef.current = url
    setPreview({ objectUrl: url, name, mimeType })
  }

  const closePreview = () => {
    setPreview(null)
    if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null }
  }

  const loadDecisions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (tab === 'MINE') {
        params.set('mine', 'true')
      } else {
        params.set('status', tab)
      }
      const data = await apiFetch<{ decisions: Decision[] }>(`/api/admin/decisions?${params.toString()}`)
      setDecisions(data.decisions || [])
    } catch (err) {
      setError((err as Error).message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    loadDecisions()
  }, [loadDecisions])

  const handleApprove = async (id: string) => {
    setActingId(id)
    try {
      await apiFetch(`/api/admin/decisions/${id}/approve`, { method: 'POST', body: JSON.stringify({}) })
      await loadDecisions()
    } catch (err) {
      window.alert((err as Error).message || 'Erreur')
    } finally {
      setActingId(null)
    }
  }

  const handleReject = async (id: string) => {
    const comment = window.prompt('Motif du rejet (optionnel) :') ?? ''
    setActingId(id)
    try {
      await apiFetch(`/api/admin/decisions/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify(comment ? { comment } : {}),
      })
      await loadDecisions()
    } catch (err) {
      window.alert((err as Error).message || 'Erreur')
    } finally {
      setActingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer cette décision ?')) return
    setActingId(id)
    try {
      await apiFetch(`/api/admin/decisions/${id}`, { method: 'DELETE' })
      await loadDecisions()
    } catch (err) {
      window.alert((err as Error).message || 'Erreur')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="portal-container">
      <div className="admin-page-header">
        <div>
          <h1>Décisions</h1>
          <p className="admin-page-subtitle">
            Soumettez une décision à valider ou consultez celles en attente
          </p>
        </div>
        <div className="admin-quick-actions">
          <button type="button" className="portal-button" onClick={() => setShowCreate(true)}>
            <Plus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Nouvelle décision
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 6, marginTop: 18, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? 'portal-button' : 'portal-button secondary'}
            style={{ padding: '6px 14px', fontSize: 13 }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Chargement…</p>
      ) : error ? (
        <p style={{ color: '#ef4444' }}>{error}</p>
      ) : decisions.length === 0 ? (
        <div className="admin-stat-card" style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Aucune décision dans cette catégorie.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {decisions.map((d) => {
            const expanded = expandedId === d._id
            const submitterId = getSubmitterId(d)
            const isOwner = submitterId && currentUserId && submitterId === currentUserId
            const deadlineDate = d.deadline ? new Date(d.deadline) : null
            const overdue = deadlineDate && deadlineDate < new Date() && d.status === 'PENDING'
            return (
              <div
                key={d._id}
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10,
                  padding: 14,
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <div className="decision-card-layout">
                  <span
                    title={d.priority}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: PRIORITY_COLORS[d.priority],
                      marginTop: 6,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14 }}>{d.title}</strong>
                      <span className="admin-badge">{d.category}</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0' }}>
                      {!expanded && d.description.length > 200
                        ? d.description.slice(0, 200) + '…'
                        : d.description}
                    </p>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <User size={11} /> {d.submittedByName}
                      </span>
                      <span>{new Date(d.createdAt).toLocaleDateString('fr-FR')}</span>
                      {deadlineDate && (
                        <span style={{ color: overdue ? '#ef4444' : undefined, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={11} />
                          Échéance : {deadlineDate.toLocaleDateString('fr-FR')}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : d._id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#0ea5e9',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 2,
                          fontSize: 11,
                        }}
                      >
                        {expanded ? <><ChevronUp size={12} /> Réduire</> : <><ChevronDown size={12} /> Détails</>}
                      </button>
                    </div>

                    {expanded && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                        {d.context && (
                          <div>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Contexte</div>
                            <div style={{ color: 'var(--text-muted)' }}>{d.context}</div>
                          </div>
                        )}
                        {d.options && d.options.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Options</div>
                            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)' }}>
                              {d.options.map((opt, i) => <li key={i}>{opt}</li>)}
                            </ul>
                          </div>
                        )}
                        {d.recommendation && (
                          <div>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Recommandation</div>
                            <div style={{ color: 'var(--text-muted)' }}>{d.recommendation}</div>
                          </div>
                        )}
                        {/* Destinataires */}
                        {d.recipients && d.recipients.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Adressé à</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {d.recipients.map((r) => (
                                <span key={typeof r === 'string' ? r : r._id} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}>
                                  {typeof r === 'string' ? r : (r.name || r.email)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Pièces jointes */}
                        {d.attachments && d.attachments.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
                              <Paperclip size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                              Pièces jointes
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {d.attachments.map((a, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => openPreview(d._id, idx, a.originalName, a.mimeType)}
                                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#93c5fd', textAlign: 'left' }}
                                >
                                  <Paperclip size={12} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{a.originalName}</span>
                                  {a.size > 0 && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{formatFileSize(a.size)}</span>}
                                  <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 2 }}>👁</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {d.status !== 'PENDING' && (
                          <div style={{ padding: 10, borderRadius: 8, background: d.status === 'APPROVED' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)' }}>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', color: d.status === 'APPROVED' ? '#10b981' : '#ef4444', marginBottom: 4 }}>
                              {d.status === 'APPROVED' ? 'Approuvée' : 'Rejetée'}
                            </div>
                            <div style={{ fontSize: 12 }}>
                              Par <strong>{d.decidedByName || '—'}</strong>
                              {d.decidedAt && ` · le ${new Date(d.decidedAt).toLocaleDateString('fr-FR')}`}
                            </div>
                            {d.decisionComment && (
                              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>« {d.decisionComment} »</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    {isSuperAdmin && d.status === 'PENDING' && (
                      <>
                        <button
                          type="button"
                          className="portal-button"
                          style={{ background: '#10b981', borderColor: '#10b981', padding: '6px 12px', fontSize: 12 }}
                          disabled={actingId === d._id}
                          onClick={() => handleApprove(d._id)}
                        >
                          <Check size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                          Valider
                        </button>
                        <button
                          type="button"
                          className="portal-button secondary"
                          style={{ padding: '6px 12px', fontSize: 12, color: '#ef4444', borderColor: '#ef4444' }}
                          disabled={actingId === d._id}
                          onClick={() => handleReject(d._id)}
                        >
                          <X size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                          Rejeter
                        </button>
                      </>
                    )}
                    {isOwner && d.status === 'PENDING' && (
                      <button
                        type="button"
                        className="portal-button secondary"
                        style={{ padding: '6px 12px', fontSize: 12 }}
                        disabled={actingId === d._id}
                        onClick={() => handleDelete(d._id)}
                      >
                        <Trash2 size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreate && (
        <CreateDecisionModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            setTab('PENDING')
            loadDecisions()
          }}
        />
      )}
      {preview && <FilePreviewModal preview={preview} onClose={closePreview} />}
    </div>
  )
}

// ─── Modale de création ─────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateDecisionModal({ onClose, onCreated }: CreateModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<DecisionCategory>('AUTRE')
  const [priority, setPriority] = useState<DecisionPriority>('NORMALE')
  const [context, setContext] = useState('')
  const [optionsText, setOptionsText] = useState('')
  const [recommendation, setRecommendation] = useState('')
  const [deadline, setDeadline] = useState('')
  const [fileNames, setFileNames] = useState<string[]>([])
  const [selectedRecipients, setSelectedRecipients] = useState<UserRef[]>([])
  const [allUsers, setAllUsers] = useState<UserRef[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    apiFetch<{ users: UserRef[] }>('/api/admin/messaging/users').then((d) => setAllUsers(d.users)).catch(() => {})
    return () => { document.body.style.overflow = prev }
  }, [])

  const parsedOptions = useMemo(
    () => optionsText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 10),
    [optionsText]
  )

  const toggleRecipient = (u: UserRef) => {
    setSelectedRecipients((prev) =>
      prev.some((r) => r._id === u._id) ? prev.filter((r) => r._id !== u._id) : [...prev, u]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (title.trim().length < 3 || title.trim().length > 200) {
      setErr('Le titre doit faire entre 3 et 200 caractères')
      return
    }
    if (!description.trim()) {
      setErr('La description est requise')
      return
    }
    setSubmitting(true)
    setErr(null)
    try {
      const form = new FormData()
      form.append('title', title.trim())
      form.append('description', description.trim())
      form.append('category', category)
      form.append('priority', priority)
      if (context.trim()) form.append('context', context.trim())
      if (parsedOptions.length > 0) form.append('options', JSON.stringify(parsedOptions))
      if (recommendation.trim()) form.append('recommendation', recommendation.trim())
      if (deadline) form.append('deadline', deadline)
      if (selectedRecipients.length > 0) form.append('recipients', JSON.stringify(selectedRecipients.map((r) => r._id)))
      const inputFiles = fileInputRef.current?.files
      if (inputFiles) Array.from(inputFiles).forEach((f) => form.append('files', f))

      const token = getToken()
      const res = await fetch('/api/admin/decisions', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error((d as any)?.message || 'Erreur')
      }
      onCreated()
    } catch (e2) {
      setErr((e2 as Error).message || 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <>
      <div className="dm-backdrop" onClick={onClose} />
      <form className="dm-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>

        <div className="dm-header">
          <h2>Nouvelle demande de décision</h2>
          <button type="button" className="dm-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="dm-body">
          <div className="dm-field">
            <label className="dm-label">Titre *</label>
            <input className="portal-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              required minLength={3} maxLength={200} placeholder="Intitulé de la décision…" />
          </div>

          <div className="dm-field">
            <label className="dm-label">Description *</label>
            <textarea className="portal-input" value={description} onChange={(e) => setDescription(e.target.value)}
              required rows={3} placeholder="Décrivez la décision à prendre…" />
          </div>

          <div className="dm-row">
            <div className="dm-field">
              <label className="dm-label">Catégorie</label>
              <select className="portal-input" value={category} onChange={(e) => setCategory(e.target.value as DecisionCategory)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="dm-field">
              <label className="dm-label">Priorité</label>
              <select className="portal-input" value={priority} onChange={(e) => setPriority(e.target.value as DecisionPriority)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="dm-field">
            <label className="dm-label">Contexte <small>(optionnel)</small></label>
            <textarea className="portal-input" value={context} onChange={(e) => setContext(e.target.value)}
              rows={2} placeholder="Informations de contexte utiles à la décision…" />
          </div>

          <div className="dm-field">
            <label className="dm-label">Options <small>(une par ligne — {parsedOptions.length}/10)</small></label>
            <textarea className="portal-input" value={optionsText} onChange={(e) => setOptionsText(e.target.value)}
              rows={3} placeholder={'Option A\nOption B\nOption C'} />
          </div>

          <div className="dm-row">
            <div className="dm-field">
              <label className="dm-label">Recommandation <small>(optionnel)</small></label>
              <textarea className="portal-input" value={recommendation} onChange={(e) => setRecommendation(e.target.value)}
                rows={2} placeholder="Votre recommandation…" />
            </div>
            <div className="dm-field">
              <label className="dm-label">Échéance <small>(optionnel)</small></label>
              <input className="portal-input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>

          <div className="dm-field">
            <label className="dm-label">Adresser à <small>(en plus des admins)</small></label>
            <div className="dm-chips">
              {allUsers.length === 0
                ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement…</span>
                : allUsers.map((u) => {
                    const sel = selectedRecipients.some((r) => r._id === u._id)
                    return (
                      <button key={u._id} type="button" className={`dm-chip${sel ? ' on' : ''}`} onClick={() => toggleRecipient(u)}>
                        {u.name || u.email}
                      </button>
                    )
                  })}
            </div>
          </div>

          <div className="dm-field">
            <label className="dm-label">Pièces jointes <small>(max 5 × 20 Mo)</small></label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const names = Array.from(e.target.files || []).map((f) => f.name)
                setFileNames(names)
              }}
            />
            <button
              type="button"
              className="dm-file-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={14} />
              <span>{fileNames.length === 0 ? 'Cliquer pour ajouter des fichiers…' : `${fileNames.length} fichier(s) sélectionné(s)`}</span>
            </button>
            {fileNames.length > 0 && (
              <div className="dm-file-list">
                {fileNames.map((name, i) => (
                  <div key={i} className="dm-file-item">
                    <Paperclip size={11} />
                    <span className="dm-fname">{name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {err && <p className="dm-error">{err}</p>}
        </div>

        <div className="dm-footer">
          <button type="button" className="portal-button secondary" onClick={onClose} disabled={submitting}>Annuler</button>
          <button type="submit" className="portal-button" disabled={submitting}>
            {submitting ? 'Envoi…' : 'Soumettre la demande'}
          </button>
        </div>
      </form>
    </>,
    document.body
  )
}
