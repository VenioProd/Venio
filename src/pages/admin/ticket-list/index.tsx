import PageHeader from '../../../components/admin/ui/PageHeader'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useConfirm } from '../../../hooks/useConfirm'
import { apiFetch, apiUpload } from '../../../lib/api'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { CATEGORY_CONFIG, PRIORITY_CONFIG, STATUS_CONFIG } from './types'
import type { Ticket, KpiData } from './types'
import TicketCard from './TicketCard'
import TicketDetail from './TicketDetail'
import TicketStats from './TicketStats'
import TicketFilters from './TicketFilters'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'
import '../Production.css'
import DocPreviewModal from '../../../components/DocPreviewModal'

const TicketList = () => {
  const { t } = useI18n()
  const { user } = useAuth()
  const isSuperAdmin = ['SUPER_ADMIN', 'PDG', 'ADMIN', 'MANAGER'].includes(user?.role || '')
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

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Ticket[]>('/api/admin/tickets')
      setTickets(data)
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  const loadArchived = useCallback(async () => {
    try {
      const data = await apiFetch<Ticket[]>('/api/admin/tickets/archived')
      setArchivedTickets(data)
    } catch {
      /* silent */
    }
  }, [])

  const loadKpi = useCallback(async (period: string) => {
    try {
      const data = await apiFetch<KpiData>(`/api/admin/tickets/kpi?period=${period}`)
      setKpi(data)
    } catch {
      /* silent */
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    if (activeTab === 'archives') loadArchived()
  }, [activeTab, loadArchived])
  useEffect(() => {
    if (activeTab === 'kpi') loadKpi(kpiPeriod)
  }, [activeTab, kpiPeriod, loadKpi])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.message.trim()) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('title', form.title)
      fd.append('message', form.message)
      fd.append('category', form.category)
      fd.append('priority', form.priority)
      formFiles.forEach((f) => fd.append('files', f))
      await apiUpload('/api/admin/tickets', fd)
      setForm({ title: '', message: '', category: 'QUESTION', priority: 'NORMALE' })
      setFormFiles([])
      setShowForm(false)
      await load()
    } catch {
      /* silent */
    } finally {
      setSubmitting(false)
    }
  }

  const handleReply = async (ticketId: string) => {
    if (!replyText.trim()) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('message', replyText)
      replyFiles.forEach((f) => fd.append('files', f))
      await apiUpload(`/api/admin/tickets/${ticketId}/reply`, fd)
      setReplyText('')
      setReplyFiles([])
      await load()
    } catch {
      /* silent */
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatusChange = async (ticketId: string, status: string) => {
    try {
      await apiFetch(`/api/admin/tickets/${ticketId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      await load()
    } catch {
      /* silent */
    }
  }

  const handleArchive = async (ticketId: string) => {
    try {
      await apiFetch(`/api/admin/tickets/${ticketId}/archive`, { method: 'PATCH' })
      await load()
      if (activeTab === 'archives') await loadArchived()
    } catch {
      /* silent */
    }
  }

  const handleUnarchive = async (ticketId: string) => {
    try {
      await apiFetch(`/api/admin/tickets/${ticketId}/unarchive`, { method: 'PATCH' })
      await loadArchived()
      await load()
    } catch {
      /* silent */
    }
  }

  const handleDelete = async (ticketId: string) => {
    if (
      !(await confirm({
        message: t('orgs.tickets.list.confirmDelete'),
        title: t('orgs.tickets.list.confirmDeleteTitle'),
      }))
    )
      return
    try {
      await apiFetch(`/api/admin/tickets/${ticketId}`, { method: 'DELETE' })
      await load()
      await loadArchived()
    } catch {
      /* silent */
    }
  }

  const removeFormFile = (idx: number) => setFormFiles((prev) => prev.filter((_, i) => i !== idx))

  const applyExtraFilters = (list: Ticket[]) => {
    return list.filter((tk) => {
      if (filterCategory !== 'all' && tk.category !== filterCategory) return false
      if (filterPriority !== 'all' && tk.priority !== filterPriority) return false
      return true
    })
  }
  const activeTickets = tickets.filter((tk) => tk.status === 'OUVERT' || tk.status === 'EN_COURS')
  const resolvedTickets = tickets.filter((tk) => tk.status === 'RESOLU' || tk.status === 'FERME')
  const filteredActive = applyExtraFilters(
    filterStatus === 'all' ? activeTickets : activeTickets.filter((tk) => tk.status === filterStatus),
  )
  const filteredResolved = applyExtraFilters(resolvedTickets)

  const renderFilePreview = (files: File[]) => {
    if (files.length === 0) return null
    return (
      <div className="ticket-file-previews">
        {files.map((f, i) => (
          <div key={i} className="ticket-file-preview">
            {f.type.startsWith('image/') ? (
              <img src={URL.createObjectURL(f)} alt={f.name} />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            )}
            <span className="ticket-file-preview-name">{f.name}</span>
            <button type="button" className="ticket-file-remove" onClick={() => removeFormFile(i)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    )
  }

  // --- Vue NON-SUPER_ADMIN : bouton "+" flottant + formulaire simple ---
  if (!isSuperAdmin) {
    return (
      <div className="portal-container production-page production-list production-tickets">
        <div className="production-header">
          <PageHeader
            eyebrow={t('shell.navItem.changeRequests')}
            title={t('orgs.tickets.list.myRequestsTitle')}
            subtitle={t('orgs.tickets.list.myRequestsSubtitle')}
          />
        </div>

        {/* Liste des tickets de l'utilisateur */}
        <div className="ticket-list" style={{ marginTop: 20 }}>
          {loading ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{t('common.loading')}</p>
          ) : tickets.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
              {t('orgs.tickets.list.myRequestsEmpty')}
            </p>
          ) : (
            tickets.map((ticket) => (
              <TicketCard
                key={ticket._id}
                ticket={ticket}
                isExpanded={expandedTicket === ticket._id}
                onToggleExpand={() => setExpandedTicket(expandedTicket === ticket._id ? null : ticket._id)}
                onPreview={setPreview}
                onReload={load}
              />
            ))
          )}
        </div>

        {preview && <DocPreviewModal url={preview.url} name={preview.name} onClose={() => setPreview(null)} />}
      </div>
    )
  }

  // --- Vue SUPER_ADMIN : dashboard complet ---
  return (
    <div className="portal-container production-page production-list production-tickets">
      {ConfirmDialog}
      {/* Header */}
      <div className="production-header">
        <PageHeader
          eyebrow={t('shell.navItem.changeRequests')}
          title={t('orgs.tickets.list.title')}
          subtitle={t('orgs.tickets.list.subtitle')}
          actions={
            activeTab === 'tickets' && (
              <button className="ticket-new-btn" onClick={() => setShowForm(!showForm)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t('orgs.tickets.list.newTicket')}
              </button>
            )
          }
        />
      </div>

      {/* Tabs */}
      <div className="ticket-tabs">
        <button
          className={`ticket-tab ${activeTab === 'tickets' ? 'active' : ''}`}
          onClick={() => setActiveTab('tickets')}
        >
          {t('orgs.tickets.list.tabActive')}
          {activeTickets.length > 0 && <span className="ticket-tab-badge">{activeTickets.length}</span>}
        </button>
        <button
          className={`ticket-tab ${activeTab === 'resolus' ? 'active' : ''}`}
          onClick={() => setActiveTab('resolus')}
        >
          {t('orgs.tickets.list.tabResolved')}
          {resolvedTickets.length > 0 && <span className="ticket-tab-badge-muted">{resolvedTickets.length}</span>}
        </button>
        <button
          className={`ticket-tab ${activeTab === 'archives' ? 'active' : ''}`}
          onClick={() => setActiveTab('archives')}
        >
          {t('orgs.tickets.list.tabArchives')}
          {archivedTickets.length > 0 && <span className="ticket-tab-badge-muted">{archivedTickets.length}</span>}
        </button>
        <button className={`ticket-tab ${activeTab === 'kpi' ? 'active' : ''}`} onClick={() => setActiveTab('kpi')}>
          {t('orgs.tickets.list.tabKpi')}
        </button>
      </div>

      {/* Tab: Tickets actifs */}
      {activeTab === 'tickets' && (
        <>
          <div className="ticket-stats">
            {(['OUVERT', 'EN_COURS'] as const).map((key) => {
              const cfg = STATUS_CONFIG[key]
              const count = activeTickets.filter((tk) => tk.status === key).length
              return (
                <button
                  key={key}
                  className={`ticket-stat-card ${filterStatus === key ? 'active' : ''}`}
                  onClick={() => setFilterStatus(filterStatus === key ? 'all' : key)}
                  style={{ '--accent': cfg.color } as React.CSSProperties}
                >
                  <span className="ticket-stat-count" style={{ color: cfg.color }}>
                    {count}
                  </span>
                  <span className="ticket-stat-label">{t(cfg.labelKey)}</span>
                </button>
              )
            })}
          </div>

          <TicketFilters
            filterCategory={filterCategory}
            setFilterCategory={setFilterCategory}
            filterPriority={filterPriority}
            setFilterPriority={setFilterPriority}
          />

          {showForm && (
            <div className="portal-card" style={{ marginTop: 16 }}>
              <form onSubmit={handleCreate} className="ticket-form">
                <h3 style={{ margin: '0 0 16px', color: 'var(--primary)' }}>{t('orgs.tickets.list.newTicket')}</h3>
                <div className="ticket-form-row">
                  <div className="ticket-form-field">
                    <label>{t('orgs.tickets.list.fieldTitle')}</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder={t('orgs.tickets.list.titlePlaceholder')}
                      required
                    />
                  </div>
                </div>
                <div className="ticket-form-row">
                  <div className="ticket-form-field">
                    <label>{t('orgs.tickets.list.fieldCategory')}</label>
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>
                          {t(v.labelKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ticket-form-field">
                    <label>{t('orgs.tickets.list.fieldPriority')}</label>
                    <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                      {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>
                          {t(v.labelKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="ticket-form-field">
                  <label>{t('orgs.tickets.list.fieldMessage')}</label>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder={t('orgs.tickets.list.messagePlaceholder')}
                    rows={4}
                    required
                  />
                </div>
                {renderFilePreview(formFiles)}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files) setFormFiles((prev) => [...prev, ...Array.from(e.target.files!)])
                        e.target.value = ''
                      }}
                    />
                    <button type="button" className="ticket-attach-btn" onClick={() => fileInputRef.current?.click()}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                      {t('orgs.tickets.list.attachFiles')}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      className="ticket-cancel-btn"
                      onClick={() => {
                        setShowForm(false)
                        setFormFiles([])
                      }}
                    >
                      {t('common.cancel')}
                    </button>
                    <button type="submit" className="ticket-submit-btn" disabled={submitting}>
                      {submitting ? t('orgs.tickets.list.sending') : t('orgs.tickets.list.send')}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          <div className="ticket-list" style={{ marginTop: 20 }}>
            {loading ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{t('common.loading')}</p>
            ) : filteredActive.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }}
                >
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p style={{ margin: 0, fontSize: 14 }}>
                  {filterStatus !== 'all' || filterCategory !== 'all' || filterPriority !== 'all'
                    ? t('orgs.tickets.list.emptyFiltered')
                    : t('orgs.tickets.list.empty')}
                </p>
              </div>
            ) : (
              filteredActive.map((ticket) => (
                <TicketDetail
                  key={ticket._id}
                  ticket={ticket}
                  isExpanded={expandedTicket === ticket._id}
                  isSuperAdmin={isSuperAdmin}
                  replyText={expandedTicket === ticket._id ? replyText : ''}
                  replyFiles={replyFiles}
                  submitting={submitting}
                  onToggleExpand={() => setExpandedTicket(expandedTicket === ticket._id ? null : ticket._id)}
                  onReplyTextChange={setReplyText}
                  onReplyFilesChange={setReplyFiles}
                  onReply={handleReply}
                  onStatusChange={handleStatusChange}
                  onArchive={handleArchive}
                  onUnarchive={handleUnarchive}
                  onDelete={handleDelete}
                  onPreview={setPreview}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* Tab: Resolus */}
      {activeTab === 'resolus' && (
        <div className="ticket-list" style={{ marginTop: 20 }}>
          {filteredResolved.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }}
              >
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p style={{ margin: 0, fontSize: 14 }}>{t('orgs.tickets.list.emptyResolved')}</p>
            </div>
          ) : (
            filteredResolved.map((ticket) => (
              <TicketDetail
                key={ticket._id}
                ticket={ticket}
                isExpanded={expandedTicket === ticket._id}
                isSuperAdmin={isSuperAdmin}
                replyText={expandedTicket === ticket._id ? replyText : ''}
                replyFiles={replyFiles}
                submitting={submitting}
                onToggleExpand={() => setExpandedTicket(expandedTicket === ticket._id ? null : ticket._id)}
                onReplyTextChange={setReplyText}
                onReplyFilesChange={setReplyFiles}
                onReply={handleReply}
                onStatusChange={handleStatusChange}
                onArchive={handleArchive}
                onUnarchive={handleUnarchive}
                onDelete={handleDelete}
                onPreview={setPreview}
              />
            ))
          )}
        </div>
      )}

      {/* Tab: Archives */}
      {activeTab === 'archives' && (
        <div className="ticket-list" style={{ marginTop: 20 }}>
          {archivedTickets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }}
              >
                <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
              </svg>
              <p style={{ margin: 0, fontSize: 14 }}>{t('orgs.tickets.list.emptyArchived')}</p>
            </div>
          ) : (
            archivedTickets.map((ticket) => (
              <TicketDetail
                key={ticket._id}
                ticket={ticket}
                isArchive
                isExpanded={expandedTicket === ticket._id}
                isSuperAdmin={isSuperAdmin}
                replyText={expandedTicket === ticket._id ? replyText : ''}
                replyFiles={replyFiles}
                submitting={submitting}
                onToggleExpand={() => setExpandedTicket(expandedTicket === ticket._id ? null : ticket._id)}
                onReplyTextChange={setReplyText}
                onReplyFilesChange={setReplyFiles}
                onReply={handleReply}
                onStatusChange={handleStatusChange}
                onArchive={handleArchive}
                onUnarchive={handleUnarchive}
                onDelete={handleDelete}
                onPreview={setPreview}
              />
            ))
          )}
        </div>
      )}

      {/* Tab: KPI */}
      {activeTab === 'kpi' && <TicketStats kpi={kpi} kpiPeriod={kpiPeriod} setKpiPeriod={setKpiPeriod} />}

      {preview && <DocPreviewModal url={preview.url} name={preview.name} onClose={() => setPreview(null)} />}
    </div>
  )
}

export default TicketList
