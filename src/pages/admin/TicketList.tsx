import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useConfirm } from '../../hooks/useConfirm'
import { Link } from 'react-router-dom'
import CustomSelect from '../../components/admin/CustomSelect'
import { jsPDF } from 'jspdf'
import { apiFetch, getToken } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

interface TicketFile {
  filename: string
  originalName: string
  mimetype: string
  size: number
}

interface TicketReply {
  _id: string
  authorName: string
  message: string
  attachments?: TicketFile[]
  createdAt: string
}

interface Ticket {
  _id: string
  title: string
  message: string
  category: 'QUESTION' | 'DEMANDE' | 'PROBLEME'
  priority: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
  status: 'OUVERT' | 'EN_COURS' | 'RESOLU' | 'FERME'
  authorName: string
  attachments?: TicketFile[]
  replies: TicketReply[]
  isArchived?: boolean
  archivedAt?: string
  createdAt: string
  updatedAt: string
}

interface KpiData {
  totalCreated: number
  archived: number
  resolved: number
  open: number
  inProgress: number
  byCategory: Record<string, number>
  byPriority: Record<string, number>
  totalReplies: number
  avgResponseTime: number | null
  resolutionRate: number
  topAuthors: { name: string; count: number }[]
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  QUESTION: { label: 'Question', color: '#0ea5e9' },
  DEMANDE: { label: 'Demande', color: '#8b5cf6' },
  PROBLEME: { label: 'Probleme', color: '#ef4444' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  BASSE: { label: 'Basse', color: '#64748b' },
  NORMALE: { label: 'Normale', color: '#0ea5e9' },
  HAUTE: { label: 'Haute', color: '#f59e0b' },
  URGENTE: { label: 'Urgente', color: '#ef4444' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  OUVERT: { label: 'Ouvert', color: '#f59e0b' },
  EN_COURS: { label: 'En cours', color: '#0ea5e9' },
  RESOLU: { label: 'Resolu', color: '#22c55e' },
  FERME: { label: 'Ferme', color: '#64748b' },
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function isImage(mime: string) { return mime.startsWith('image/') }

const TicketList = () => {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const { confirm, ConfirmDialog } = useConfirm()

  const [activeTab, setActiveTab] = useState<'tickets' | 'resolus' | 'archives' | 'kpi'>('tickets')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [archivedTickets, setArchivedTickets] = useState<Ticket[]>([])
  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [kpiPeriod, setKpiPeriod] = useState<string>('month')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)

  const [form, setForm] = useState({ title: '', message: '', category: 'QUESTION', priority: 'NORMALE' })
  const [formFiles, setFormFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replyFileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Ticket[]>('/api/admin/tickets')
      setTickets(data)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  const loadArchived = useCallback(async () => {
    try {
      const data = await apiFetch<Ticket[]>('/api/admin/tickets/archived')
      setArchivedTickets(data)
    } catch { /* silent */ }
  }, [])

  const loadKpi = useCallback(async (period: string) => {
    try {
      const data = await apiFetch<KpiData>(`/api/admin/tickets/kpi?period=${period}`)
      setKpi(data)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (activeTab === 'archives') loadArchived() }, [activeTab, loadArchived])
  useEffect(() => { if (activeTab === 'kpi') loadKpi(kpiPeriod) }, [activeTab, kpiPeriod, loadKpi])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.message.trim()) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('title', form.title); fd.append('message', form.message)
      fd.append('category', form.category); fd.append('priority', form.priority)
      formFiles.forEach((f) => fd.append('files', f))
      await fetch('/api/admin/tickets', { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd })
      setForm({ title: '', message: '', category: 'QUESTION', priority: 'NORMALE' })
      setFormFiles([]); setShowForm(false); await load()
    } catch { /* silent */ } finally { setSubmitting(false) }
  }

  const handleReply = async (ticketId: string) => {
    if (!replyText.trim()) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('message', replyText)
      replyFiles.forEach((f) => fd.append('files', f))
      await fetch(`/api/admin/tickets/${ticketId}/reply`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd })
      setReplyText(''); setReplyFiles([]); await load()
    } catch { /* silent */ } finally { setSubmitting(false) }
  }

  const handleStatusChange = async (ticketId: string, status: string) => {
    try { await apiFetch(`/api/admin/tickets/${ticketId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load() } catch { /* silent */ }
  }

  const handleArchive = async (ticketId: string) => {
    try { await apiFetch(`/api/admin/tickets/${ticketId}/archive`, { method: 'PATCH' }); await load(); if (activeTab === 'archives') await loadArchived() } catch { /* silent */ }
  }

  const handleUnarchive = async (ticketId: string) => {
    try { await apiFetch(`/api/admin/tickets/${ticketId}/unarchive`, { method: 'PATCH' }); await loadArchived(); await load() } catch { /* silent */ }
  }

  const handleDelete = async (ticketId: string) => {
    if (!await confirm({ message: 'Supprimer definitivement ce ticket ?', title: 'Suppression' })) return
    try { await apiFetch(`/api/admin/tickets/${ticketId}`, { method: 'DELETE' }); await load(); await loadArchived() } catch { /* silent */ }
  }

  const removeFormFile = (idx: number) => setFormFiles((prev) => prev.filter((_, i) => i !== idx))
  const removeReplyFile = (idx: number) => setReplyFiles((prev) => prev.filter((_, i) => i !== idx))
  const applyExtraFilters = (list: Ticket[]) => {
    return list.filter((t) => {
      if (filterCategory !== 'all' && t.category !== filterCategory) return false
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false
      return true
    })
  }
  const activeTickets = tickets.filter((t) => t.status === 'OUVERT' || t.status === 'EN_COURS')
  const resolvedTickets = tickets.filter((t) => t.status === 'RESOLU' || t.status === 'FERME')
  const filteredActive = applyExtraFilters(filterStatus === 'all' ? activeTickets : activeTickets.filter((t) => t.status === filterStatus))
  const filteredResolved = applyExtraFilters(resolvedTickets)

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const renderAttachments = (files: TicketFile[] | undefined) => {
    if (!files || files.length === 0) return null
    return (
      <div className="ticket-attachments">
        {files.map((f, i) => (
          <div key={i} className="ticket-attachment">
            {isImage(f.mimetype) ? (
              <img src={`/api/admin/tickets/files/${f.filename}`} alt={f.originalName} className="ticket-attachment-img"
                onClick={() => setPreview({ url: `/api/admin/tickets/files/${f.filename}`, name: f.originalName })} />
            ) : (
              <a href={`/api/admin/tickets/files/${f.filename}`} target="_blank" rel="noopener noreferrer" className="ticket-attachment-file">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <span>{f.originalName}</span>
                <span className="ticket-attachment-size">{formatFileSize(f.size)}</span>
              </a>
            )}
          </div>
        ))}
      </div>
    )
  }

  const renderFilePreview = (files: File[], isReply = false) => {
    if (files.length === 0) return null
    return (
      <div className="ticket-file-previews">
        {files.map((f, i) => (
          <div key={i} className="ticket-file-preview">
            {f.type.startsWith('image/') ? <img src={URL.createObjectURL(f)} alt={f.name} /> : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            )}
            <span className="ticket-file-preview-name">{f.name}</span>
            <button type="button" className="ticket-file-remove" onClick={() => isReply ? removeReplyFile(i) : removeFormFile(i)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        ))}
      </div>
    )
  }

  const renderTicketCard = (ticket: Ticket, isArchive = false) => {
    const isExpanded = expandedTicket === ticket._id
    const cat = CATEGORY_CONFIG[ticket.category]
    const pri = PRIORITY_CONFIG[ticket.priority]
    const st = STATUS_CONFIG[ticket.status]

    return (
      <div key={ticket._id} className={`ticket-card ${isExpanded ? 'expanded' : ''}`}>
        <div className="ticket-card-header" onClick={() => setExpandedTicket(isExpanded ? null : ticket._id)}>
          <div className="ticket-card-left">
            <span className="ticket-category-badge" style={{ background: cat.color }}>{cat.label}</span>
            <span className="ticket-priority-dot" style={{ background: pri.color }} title={pri.label} />
            <h3 className="ticket-card-title">{ticket.title}</h3>
          </div>
          <div className="ticket-card-right">
            <span className="ticket-status-badge" style={{ color: st.color, borderColor: st.color }}>{st.label}</span>
            {(ticket.attachments?.length || 0) > 0 && (
              <span style={{ opacity: 0.4, fontSize: 12 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: -2 }}>
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </span>
            )}
            {ticket.replies.length > 0 && <span className="ticket-reply-count">{ticket.replies.length} reponse{ticket.replies.length > 1 ? 's' : ''}</span>}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.4 }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {isExpanded && (
          <div className="ticket-card-body">
            <div className="ticket-meta">
              <span>Par <strong>{ticket.authorName}</strong></span>
              <span>{formatDate(ticket.createdAt)}</span>
              {ticket.archivedAt && <span style={{ color: '#64748b' }}>Archive le {formatDate(ticket.archivedAt)}</span>}
            </div>
            <div className="ticket-message">{ticket.message}</div>
            {renderAttachments(ticket.attachments)}

            {ticket.replies.length > 0 && (
              <div className="ticket-replies">
                {ticket.replies.map((reply) => (
                  <div key={reply._id} className="ticket-reply">
                    <div className="ticket-reply-header">
                      <strong>{reply.authorName}</strong>
                      <span>{formatDate(reply.createdAt)}</span>
                    </div>
                    <p>{reply.message}</p>
                    {renderAttachments(reply.attachments)}
                  </div>
                ))}
              </div>
            )}

            {!isArchive && (
              <div className="ticket-actions">
                {isSuperAdmin && ticket.status !== 'FERME' && (
                  <div className="ticket-reply-form">
                    <textarea value={expandedTicket === ticket._id ? replyText : ''} onChange={(e) => setReplyText(e.target.value)} placeholder="Votre reponse..." rows={2} />
                    {renderFilePreview(replyFiles, true)}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input ref={replyFileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" style={{ display: 'none' }}
                        onChange={(e) => { if (e.target.files) setReplyFiles((prev) => [...prev, ...Array.from(e.target.files!)]); e.target.value = '' }} />
                      <button type="button" className="ticket-attach-btn" onClick={() => replyFileRef.current?.click()}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                      </button>
                      <button className="ticket-submit-btn" onClick={() => handleReply(ticket._id)} disabled={submitting || !replyText.trim()}>Repondre</button>
                      <select value={ticket.status} onChange={(e) => handleStatusChange(ticket._id, e.target.value)} className="ticket-status-select">
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                {isSuperAdmin && (ticket.status === 'FERME' || ticket.status === 'RESOLU') && (
                  <button className="ticket-archive-btn" onClick={() => handleArchive(ticket._id)} title="Archiver">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" />
                    </svg>
                    Archiver
                  </button>
                )}
                {isSuperAdmin && (
                  <button className="ticket-delete-btn" onClick={() => handleDelete(ticket._id)} title="Supprimer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {isArchive && isSuperAdmin && (
              <div className="ticket-actions">
                <button className="ticket-archive-btn" onClick={() => handleUnarchive(ticket._id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  Restaurer
                </button>
                <button className="ticket-delete-btn" onClick={() => handleDelete(ticket._id)} title="Supprimer definitivement">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const exportKpiPdf = () => {
    if (!kpi) return
    const periodLabels: Record<string, string> = { week: 'Cette semaine', month: 'Ce mois', all: 'Historique complet' }
    const doc = new jsPDF()
    const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    let y = 20

    // Header
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('Rapport KPI — Tickets internes', 14, y)
    y += 10
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(`Periode : ${periodLabels[kpiPeriod] || kpiPeriod}  |  Genere le ${now}`, 14, y)
    y += 14

    // Separator
    doc.setDrawColor(14, 165, 233)
    doc.setLineWidth(0.5)
    doc.line(14, y, 196, y)
    y += 10

    // Main KPIs
    doc.setTextColor(0)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Indicateurs cles', 14, y)
    y += 9

    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    const kpis = [
      ['Tickets crees', `${kpi.totalCreated}`],
      ['Resolus / Fermes', `${kpi.resolved}`],
      ['En attente', `${kpi.open + kpi.inProgress}`],
      ['Reponses donnees', `${kpi.totalReplies}`],
      ['Taux de resolution', `${kpi.resolutionRate}%`],
      ['Temps moyen 1ere reponse', kpi.avgResponseTime !== null ? `${kpi.avgResponseTime}h` : 'N/A'],
      ['Tickets archives', `${kpi.archived}`],
    ]
    kpis.forEach(([label, val]) => {
      doc.setFont('helvetica', 'normal')
      doc.text(label, 18, y)
      doc.setFont('helvetica', 'bold')
      doc.text(val, 120, y)
      y += 7
    })
    y += 6

    // By category
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Repartition par categorie', 14, y)
    y += 9
    doc.setFontSize(11)
    Object.entries(CATEGORY_CONFIG).forEach(([key, cfg]) => {
      const count = kpi.byCategory[key] || 0
      const pct = kpi.totalCreated > 0 ? Math.round((count / kpi.totalCreated) * 100) : 0
      doc.setFont('helvetica', 'normal')
      doc.text(`${cfg.label}`, 18, y)
      doc.setFont('helvetica', 'bold')
      doc.text(`${count}  (${pct}%)`, 120, y)
      y += 7
    })
    y += 6

    // By priority
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Repartition par priorite', 14, y)
    y += 9
    doc.setFontSize(11)
    Object.entries(PRIORITY_CONFIG).forEach(([key, cfg]) => {
      const count = kpi.byPriority[key] || 0
      const pct = kpi.totalCreated > 0 ? Math.round((count / kpi.totalCreated) * 100) : 0
      doc.setFont('helvetica', 'normal')
      doc.text(`${cfg.label}`, 18, y)
      doc.setFont('helvetica', 'bold')
      doc.text(`${count}  (${pct}%)`, 120, y)
      y += 7
    })
    y += 6

    // Top authors
    if (kpi.topAuthors.length > 0) {
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Top demandeurs', 14, y)
      y += 9
      doc.setFontSize(11)
      kpi.topAuthors.forEach((a) => {
        doc.setFont('helvetica', 'normal')
        doc.text(a.name, 18, y)
        doc.setFont('helvetica', 'bold')
        doc.text(`${a.count} ticket${a.count > 1 ? 's' : ''}`, 120, y)
        y += 7
      })
    }

    // Footer
    y = 280
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150)
    doc.text('Venio — Rapport genere automatiquement', 14, y)
    doc.text(now, 196, y, { align: 'right' })

    const periodFile = kpiPeriod === 'week' ? 'semaine' : kpiPeriod === 'month' ? 'mois' : 'complet'
    doc.save(`kpi-tickets-${periodFile}-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const renderKpi = () => {
    if (!kpi) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Chargement...</p>

    return (
      <div className="ticket-kpi">
        {/* Period selector + Export */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="ticket-kpi-period">
            {[
              { value: 'week', label: 'Cette semaine' },
              { value: 'month', label: 'Ce mois' },
              { value: 'all', label: 'Tout' },
            ].map((p) => (
              <button key={p.value} className={`ticket-kpi-period-btn ${kpiPeriod === p.value ? 'active' : ''}`} onClick={() => setKpiPeriod(p.value)}>
                {p.label}
              </button>
          ))}
          </div>
          <button className="ticket-export-btn" onClick={exportKpiPdf}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Telecharger PDF
          </button>
        </div>

        {/* Main KPI cards */}
        <div className="ticket-kpi-grid">
          <div className="ticket-kpi-card">
            <span className="ticket-kpi-value" style={{ color: '#0ea5e9' }}>{kpi.totalCreated}</span>
            <span className="ticket-kpi-label">Tickets crees</span>
          </div>
          <div className="ticket-kpi-card">
            <span className="ticket-kpi-value" style={{ color: '#22c55e' }}>{kpi.resolved}</span>
            <span className="ticket-kpi-label">Resolus / Fermes</span>
          </div>
          <div className="ticket-kpi-card">
            <span className="ticket-kpi-value" style={{ color: '#f59e0b' }}>{kpi.open + kpi.inProgress}</span>
            <span className="ticket-kpi-label">En attente</span>
          </div>
          <div className="ticket-kpi-card">
            <span className="ticket-kpi-value" style={{ color: '#8b5cf6' }}>{kpi.totalReplies}</span>
            <span className="ticket-kpi-label">Reponses donnees</span>
          </div>
          <div className="ticket-kpi-card">
            <span className="ticket-kpi-value" style={{ color: '#0ea5e9' }}>{kpi.resolutionRate}%</span>
            <span className="ticket-kpi-label">Taux de resolution</span>
          </div>
          <div className="ticket-kpi-card">
            <span className="ticket-kpi-value" style={{ color: '#22d3ee' }}>{kpi.avgResponseTime !== null ? `${kpi.avgResponseTime}h` : '—'}</span>
            <span className="ticket-kpi-label">Temps moyen 1ere reponse</span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="ticket-kpi-sections">
          {/* Par catégorie */}
          <div className="ticket-kpi-section">
            <h3>Par categorie</h3>
            <div className="ticket-kpi-bars">
              {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
                const count = kpi.byCategory[key] || 0
                const pct = kpi.totalCreated > 0 ? (count / kpi.totalCreated) * 100 : 0
                return (
                  <div key={key} className="ticket-kpi-bar-row">
                    <span className="ticket-kpi-bar-label">{cfg.label}</span>
                    <div className="ticket-kpi-bar-track">
                      <div className="ticket-kpi-bar-fill" style={{ width: `${pct}%`, background: cfg.color }} />
                    </div>
                    <span className="ticket-kpi-bar-count">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Par priorité */}
          <div className="ticket-kpi-section">
            <h3>Par priorite</h3>
            <div className="ticket-kpi-bars">
              {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => {
                const count = kpi.byPriority[key] || 0
                const pct = kpi.totalCreated > 0 ? (count / kpi.totalCreated) * 100 : 0
                return (
                  <div key={key} className="ticket-kpi-bar-row">
                    <span className="ticket-kpi-bar-label">{cfg.label}</span>
                    <div className="ticket-kpi-bar-track">
                      <div className="ticket-kpi-bar-fill" style={{ width: `${pct}%`, background: cfg.color }} />
                    </div>
                    <span className="ticket-kpi-bar-count">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top auteurs */}
          {kpi.topAuthors.length > 0 && (
            <div className="ticket-kpi-section">
              <h3>Top demandeurs</h3>
              <div className="ticket-kpi-bars">
                {kpi.topAuthors.map((a) => {
                  const pct = kpi.totalCreated > 0 ? (a.count / kpi.totalCreated) * 100 : 0
                  return (
                    <div key={a.name} className="ticket-kpi-bar-row">
                      <span className="ticket-kpi-bar-label">{a.name}</span>
                      <div className="ticket-kpi-bar-track">
                        <div className="ticket-kpi-bar-fill" style={{ width: `${pct}%`, background: '#0ea5e9' }} />
                      </div>
                      <span className="ticket-kpi-bar-count">{a.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Vue NON-SUPER_ADMIN : bouton "+" flottant + formulaire simple ───
  if (!isSuperAdmin) {
    return (
      <div className="portal-container">
        <div className="ticket-hero">
          <div className="ticket-hero-content">
            <Link to="/admin" className="ticket-back-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Retour au dashboard
            </Link>
            <h1 className="ticket-hero-title">Mes demandes</h1>
            <p className="ticket-hero-subtitle">Besoin d'aide ? Cliquez sur le + pour envoyer une demande</p>
          </div>
        </div>

        {/* Liste des tickets de l'utilisateur */}
        <div className="ticket-list" style={{ marginTop: 20 }}>
          {loading ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Chargement...</p>
          ) : tickets.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
              Aucune demande pour le moment — cliquez sur le + pour commencer
            </p>
          ) : tickets.map((ticket) => {
            const isExpanded = expandedTicket === ticket._id
            const cat = CATEGORY_CONFIG[ticket.category]
            const st = STATUS_CONFIG[ticket.status]
            const handleExpand = () => {
              const opening = !isExpanded
              setExpandedTicket(opening ? ticket._id : null)
              // Marquer comme lu + archiver si le ticket a des réponses et n'est pas déjà fermé
              if (opening && ticket.replies.length > 0 && ticket.status !== 'FERME' && !ticket.isArchived) {
                apiFetch(`/api/admin/tickets/${ticket._id}/mark-read`, { method: 'PATCH' })
                  .then(() => load())
                  .catch(() => {})
              }
            }
            return (
              <div key={ticket._id} className={`ticket-card ${isExpanded ? 'expanded' : ''}`}>
                <div className="ticket-card-header" onClick={handleExpand}>
                  <div className="ticket-card-left">
                    <span className="ticket-category-badge" style={{ background: cat.color }}>{cat.label}</span>
                    <h3 className="ticket-card-title">{ticket.title}</h3>
                  </div>
                  <div className="ticket-card-right">
                    <span className="ticket-status-badge" style={{ color: st.color, borderColor: st.color }}>{st.label}</span>
                    {ticket.replies.length > 0 && <span className="ticket-reply-count">{ticket.replies.length} reponse{ticket.replies.length > 1 ? 's' : ''}</span>}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.4 }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
                {isExpanded && (
                  <div className="ticket-card-body">
                    <div className="ticket-meta">
                      <span>{formatDate(ticket.createdAt)}</span>
                    </div>
                    <div className="ticket-message">{ticket.message}</div>
                    {renderAttachments(ticket.attachments)}
                    {ticket.replies.length > 0 && (
                      <div className="ticket-replies">
                        {ticket.replies.map((reply) => (
                          <div key={reply._id} className="ticket-reply">
                            <div className="ticket-reply-header">
                              <strong>{reply.authorName}</strong>
                              <span>{formatDate(reply.createdAt)}</span>
                            </div>
                            <p>{reply.message}</p>
                            {renderAttachments(reply.attachments)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Le bouton "+" flottant est maintenant global via TicketFab dans Navbar */}

        {/* Image Preview Modal */}
        {preview && (
          <div className="ticket-preview-overlay" onClick={() => setPreview(null)}>
            <div className="ticket-preview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="ticket-preview-header">
                <span>{preview.name}</span>
                <button onClick={() => setPreview(null)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              <img src={preview.url} alt={preview.name} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Vue SUPER_ADMIN : dashboard complet (inchangé) ───
  return (
    <div className="portal-container">
      {ConfirmDialog}
      {/* Header */}
      <div className="ticket-hero">
        <div className="ticket-hero-content">
          <Link to="/admin" className="ticket-back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Retour au dashboard
          </Link>
          <h1 className="ticket-hero-title">Tickets internes</h1>
          <p className="ticket-hero-subtitle">Posez vos questions, faites vos demandes — les super admins vous repondent</p>
        </div>
        {activeTab === 'tickets' && (
          <button className="ticket-new-btn" onClick={() => setShowForm(!showForm)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nouveau ticket
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="ticket-tabs">
        <button className={`ticket-tab ${activeTab === 'tickets' ? 'active' : ''}`} onClick={() => setActiveTab('tickets')}>
          Tickets actifs
          {activeTickets.length > 0 && (
            <span className="ticket-tab-badge">{activeTickets.length}</span>
          )}
        </button>
        <button className={`ticket-tab ${activeTab === 'resolus' ? 'active' : ''}`} onClick={() => setActiveTab('resolus')}>
          Resolus
          {resolvedTickets.length > 0 && <span className="ticket-tab-badge-muted">{resolvedTickets.length}</span>}
        </button>
        <button className={`ticket-tab ${activeTab === 'archives' ? 'active' : ''}`} onClick={() => setActiveTab('archives')}>
          Archives
          {archivedTickets.length > 0 && <span className="ticket-tab-badge-muted">{archivedTickets.length}</span>}
        </button>
        <button className={`ticket-tab ${activeTab === 'kpi' ? 'active' : ''}`} onClick={() => setActiveTab('kpi')}>
          KPI & Stats
        </button>
      </div>

      {/* Tab: Tickets actifs */}
      {activeTab === 'tickets' && (
        <>
          <div className="ticket-stats">
            {(['OUVERT', 'EN_COURS'] as const).map((key) => {
              const cfg = STATUS_CONFIG[key]
              const count = activeTickets.filter((t) => t.status === key).length
              return (
                <button key={key} className={`ticket-stat-card ${filterStatus === key ? 'active' : ''}`}
                  onClick={() => setFilterStatus(filterStatus === key ? 'all' : key)} style={{ '--accent': cfg.color } as React.CSSProperties}>
                  <span className="ticket-stat-count" style={{ color: cfg.color }}>{count}</span>
                  <span className="ticket-stat-label">{cfg.label}</span>
                </button>
              )
            })}
          </div>

          <div className="ticket-filters">
            <CustomSelect
              className="gestion-filter-select"
              value={filterCategory}
              onChange={(v) => setFilterCategory(v)}
              options={[
                { value: 'all', label: 'Toutes les categories' },
                ...Object.entries(CATEGORY_CONFIG).map(([k, v]) => ({ value: k, label: v.label })),
              ]}
            />
            <CustomSelect
              className="gestion-filter-select"
              value={filterPriority}
              onChange={(v) => setFilterPriority(v)}
              options={[
                { value: 'all', label: 'Toutes les priorites' },
                ...Object.entries(PRIORITY_CONFIG).map(([k, v]) => ({ value: k, label: v.label })),
              ]}
            />
            {(filterCategory !== 'all' || filterPriority !== 'all') && (
              <button
                className="gestion-filter-clear"
                onClick={() => { setFilterCategory('all'); setFilterPriority('all') }}
              >
                Reinitialiser
              </button>
            )}
          </div>

          {showForm && (
            <div className="portal-card" style={{ marginTop: 16 }}>
              <form onSubmit={handleCreate} className="ticket-form">
                <h3 style={{ margin: '0 0 16px', color: '#0ea5e9' }}>Nouveau ticket</h3>
                <div className="ticket-form-row">
                  <div className="ticket-form-field"><label>Titre</label>
                    <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Resumez votre question ou demande..." required />
                  </div>
                </div>
                <div className="ticket-form-row">
                  <div className="ticket-form-field"><label>Categorie</label>
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="ticket-form-field"><label>Priorite</label>
                    <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                      {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="ticket-form-field"><label>Message</label>
                  <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Decrivez votre question ou demande en detail..." rows={4} required />
                </div>
                {renderFilePreview(formFiles)}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" style={{ display: 'none' }}
                      onChange={(e) => { if (e.target.files) setFormFiles((prev) => [...prev, ...Array.from(e.target.files!)]); e.target.value = '' }} />
                    <button type="button" className="ticket-attach-btn" onClick={() => fileInputRef.current?.click()}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                      Joindre des fichiers
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" className="ticket-cancel-btn" onClick={() => { setShowForm(false); setFormFiles([]) }}>Annuler</button>
                    <button type="submit" className="ticket-submit-btn" disabled={submitting}>{submitting ? 'Envoi...' : 'Envoyer le ticket'}</button>
                  </div>
                </div>
              </form>
            </div>
          )}

          <div className="ticket-list" style={{ marginTop: 20 }}>
            {loading ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Chargement...</p>
            ) : filteredActive.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                {filterStatus !== 'all' || filterCategory !== 'all' || filterPriority !== 'all' ? 'Aucun ticket avec ces filtres' : 'Aucun ticket pour le moment'}
              </p>
            ) : filteredActive.map((ticket) => renderTicketCard(ticket))}
          </div>
        </>
      )}

      {/* Tab: Résolus */}
      {activeTab === 'resolus' && (
        <div className="ticket-list" style={{ marginTop: 20 }}>
          {filteredResolved.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Aucun ticket resolu</p>
          ) : filteredResolved.map((ticket) => renderTicketCard(ticket))}
        </div>
      )}

      {/* Tab: Archives */}
      {activeTab === 'archives' && (
        <div className="ticket-list" style={{ marginTop: 20 }}>
          {archivedTickets.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Aucun ticket archive</p>
          ) : archivedTickets.map((ticket) => renderTicketCard(ticket, true))}
        </div>
      )}

      {/* Tab: KPI */}
      {activeTab === 'kpi' && renderKpi()}

      {/* Image Preview Modal */}
      {preview && (
        <div className="ticket-preview-overlay" onClick={() => setPreview(null)}>
          <div className="ticket-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ticket-preview-header">
              <span>{preview.name}</span>
              <button onClick={() => setPreview(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <img src={preview.url} alt={preview.name} />
          </div>
        </div>
      )}
    </div>
  )
}

export default TicketList
