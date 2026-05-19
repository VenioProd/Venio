import { useCallback, useEffect, useMemo, useState } from 'react'
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

async function downloadDecisionFile(decisionId: string, index: number, name: string, mimeType: string): Promise<string | null> {
  const token = getToken()
  const res = await fetch(`/api/admin/decisions/${decisionId}/attachments/${index}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const d = await res.json().catch(() => null)
    return (d as any)?.error || `Erreur ${res.status}`
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const viewable = mimeType?.startsWith('image/') || mimeType === 'application/pdf' || mimeType?.startsWith('video/')
  if (!viewable) a.download = name
  else a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return null
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
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
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
                                  onClick={async () => {
                                    const err = await downloadDecisionFile(d._id, idx, a.originalName, a.mimeType)
                                    if (err) showToast(err, 'error')
                                  }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#93c5fd', textAlign: 'left' }}
                                >
                                  <Paperclip size={12} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{a.originalName}</span>
                                  {a.size > 0 && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{formatFileSize(a.size)}</span>}
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
  const [files, setFiles] = useState<File[]>([])
  const [selectedRecipients, setSelectedRecipients] = useState<UserRef[]>([])
  const [allUsers, setAllUsers] = useState<UserRef[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

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
      files.forEach((f) => form.append('files', f))

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

  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <form
        className="task-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 0 }}
      >
        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            Nouvelle demande de décision
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: 8,
              width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-muted)',
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Champs */}
        <div className="task-form-group">
          <label>Titre *</label>
          <input
            className="portal-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={3}
            maxLength={200}
            placeholder="Intitulé de la décision…"
          />
        </div>

        <div className="task-form-group">
          <label>Description *</label>
          <textarea
            className="portal-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={3}
            placeholder="Décrivez la décision à prendre…"
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="task-form-group">
            <label>Catégorie</label>
            <select className="portal-input" value={category} onChange={(e) => setCategory(e.target.value as DecisionCategory)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="task-form-group">
            <label>Priorité</label>
            <select className="portal-input" value={priority} onChange={(e) => setPriority(e.target.value as DecisionPriority)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="task-form-group">
          <label>Contexte <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optionnel)</span></label>
          <textarea
            className="portal-input"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={2}
            placeholder="Informations de contexte utiles à la décision…"
          />
        </div>

        <div className="task-form-group">
          <label>
            Options <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(une par ligne, {parsedOptions.length}/10)</span>
          </label>
          <textarea
            className="portal-input"
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            rows={3}
            placeholder={'Option A\nOption B\nOption C'}
          />
        </div>

        <div className="task-form-group">
          <label>Recommandation <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optionnel)</span></label>
          <textarea
            className="portal-input"
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value)}
            rows={2}
            placeholder="Votre recommandation personnelle…"
          />
        </div>

        <div className="task-form-group">
          <label>Échéance <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optionnel)</span></label>
          <input
            className="portal-input"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>

        {/* Destinataires */}
        <div className="task-form-group">
          <label>Adresser à <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(en plus des admins)</span></label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', minHeight: 40 }}>
            {allUsers.map((u) => {
              const selected = selectedRecipients.some((r) => r._id === u._id)
              return (
                <button
                  key={u._id}
                  type="button"
                  onClick={() => toggleRecipient(u)}
                  style={{
                    fontSize: 12, padding: '3px 10px', borderRadius: 12, cursor: 'pointer',
                    border: `1px solid ${selected ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    background: selected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                    color: selected ? '#a5b4fc' : 'var(--text-secondary)',
                    fontWeight: selected ? 600 : 400,
                  }}
                >
                  {u.name || u.email}
                </button>
              )
            })}
            {allUsers.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement…</span>}
          </div>
        </div>

        {/* Pièces jointes */}
        <div className="task-form-group">
          <label>Pièces jointes <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(max 5 × 20 Mo)</span></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, cursor: 'pointer' }}>
            <Paperclip size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {files.length === 0 ? 'Cliquer pour ajouter des fichiers…' : `${files.length} fichier(s) sélectionné(s)`}
            </span>
            <input type="file" multiple style={{ display: 'none' }} onChange={(e) => {
              const added = Array.from(e.target.files || [])
              setFiles((prev) => [...prev, ...added].slice(0, 5))
              e.target.value = ''
            }} />
          </label>
          {files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <Paperclip size={11} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{formatFileSize(f.size)}</span>
                  <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {err && (
          <p style={{ margin: '0 0 12px', color: '#ef4444', fontSize: 13 }}>{err}</p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button type="button" className="portal-button secondary" onClick={onClose} disabled={submitting}>
            Annuler
          </button>
          <button type="submit" className="portal-button" disabled={submitting}>
            {submitting ? 'Envoi…' : 'Soumettre la demande'}
          </button>
        </div>
      </form>
    </div>
  )
}
