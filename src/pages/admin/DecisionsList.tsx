import PageHeader from '../../components/admin/ui/PageHeader'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ApiError, apiDownload, apiFetch, apiUpload } from '../../lib/api'
import { Plus, Check, X, Trash2, Calendar, User, ChevronDown, ChevronUp, Paperclip, MessageSquare } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useI18n } from '../../context/I18nContext'
import { translate, type MessageKey } from '../../i18n'
import { formatDate } from '../../i18n/format'
import BulkActionBar, { type BulkAction } from '../../components/admin/ui/BulkActionBar'
import QuickSelect from '../../components/admin/ui/QuickSelect'
import { RowCheckbox } from '../../components/admin/ui/RowCheckbox'
import { useBulkRunner, type BulkResult } from '../../components/admin/ui/useBulkRunner'
import { useMultiSelect } from '../../components/admin/ui/useMultiSelect'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

type DecisionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'IMPROVEMENT'
type DecisionCategory = 'BUDGET' | 'EMBAUCHE' | 'PROJET' | 'PARTENARIAT' | 'AUTRE'
type DecisionPriority = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'

interface UserRef {
  _id: string
  name?: string
  email?: string
  avatarUrl?: string
}

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
  const units = [
    translate('adminOps.decisions.unitByte'),
    translate('adminOps.decisions.unitKb'),
    translate('adminOps.decisions.unitMb'),
  ]
  let size = bytes,
    i = 0
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

interface FilePreview {
  objectUrl: string
  name: string
  mimeType: string
}

async function fetchDecisionBlob(
  decisionId: string,
  index: number,
): Promise<{ blob: Blob; error?: never } | { error: string; blob?: never }> {
  try {
    const { blob } = await apiDownload(`/api/admin/decisions/${decisionId}/attachments/${index}/download`)
    return { blob }
  } catch (err) {
    if (err instanceof ApiError)
      return { error: err.message || translate('adminOps.decisions.errorStatus', { status: err.status }) }
    return { error: translate('adminOps.decisions.downloadError') }
  }
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
  const { t } = useI18n()
  const isImage = preview.mimeType?.startsWith('image/')
  const isPdf = preview.mimeType === 'application/pdf'
  const isVideo = preview.mimeType?.startsWith('video/')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          zIndex: 2001,
          width: 'calc(100% - 32px)',
          maxWidth: 900,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-card, var(--surface-raised))',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {preview.name}
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => forceDownload(preview.objectUrl, preview.name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'var(--border-color)',
                border: '1px solid var(--line-strong)',
                borderRadius: 'var(--r-md)',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontSize: 13,
              }}
            >
              {t('adminOps.decisions.download')}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'color-mix(in srgb, var(--critical) 12%, transparent)',
                border: 'none',
                borderRadius: 'var(--r-md)',
                cursor: 'pointer',
                color: 'var(--critical)',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
        {/* Contenu */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            background: 'var(--bg-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 0,
          }}
        >
          {isImage && (
            <img
              src={preview.objectUrl}
              alt={preview.name}
              style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block' }}
            />
          )}
          {isPdf && (
            <iframe
              src={preview.objectUrl}
              title={preview.name}
              style={{ width: '100%', height: '80vh', border: 'none', display: 'block' }}
            />
          )}
          {isVideo && (
            <video src={preview.objectUrl} controls style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }} />
          )}
          {!isImage && !isPdf && !isVideo && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
                padding: 48,
                background: 'var(--bg-card, var(--surface-raised))',
              }}
            >
              <Paperclip size={48} style={{ color: 'var(--text-muted)' }} />
              <p style={{ color: 'var(--text-primary)', fontWeight: 500, margin: 0 }}>{preview.name}</p>
              <button
                type="button"
                onClick={() => forceDownload(preview.objectUrl, preview.name)}
                style={{
                  padding: '10px 24px',
                  background: 'var(--primary)',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderRadius: 'var(--r-md)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                {t('adminOps.decisions.download')}
              </button>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  )
}

const PRIORITY_COLORS: Record<DecisionPriority, string> = {
  BASSE: 'var(--text-muted)',
  NORMALE: 'var(--primary)',
  HAUTE: 'var(--warning)',
  URGENTE: 'var(--critical)',
}

const CATEGORIES: DecisionCategory[] = ['BUDGET', 'EMBAUCHE', 'PROJET', 'PARTENARIAT', 'AUTRE']
const PRIORITIES: DecisionPriority[] = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']

const STATUS_META: Record<
  Exclude<DecisionStatus, 'PENDING'>,
  { label: MessageKey; color: string; background: string }
> = {
  APPROVED: {
    label: 'adminOps.decisions.statusApproved',
    color: 'var(--good)',
    background: 'color-mix(in srgb, var(--good) 8%, transparent)',
  },
  REJECTED: {
    label: 'adminOps.decisions.statusRejected',
    color: 'var(--critical)',
    background: 'color-mix(in srgb, var(--critical) 8%, transparent)',
  },
  IMPROVEMENT: {
    label: 'adminOps.decisions.statusImprovement',
    color: 'var(--warning)',
    background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
  },
}

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'IMPROVEMENT' | 'MINE' | 'ARCHIVED'

const TABS: { key: Tab; label: MessageKey }[] = [
  { key: 'PENDING', label: 'adminOps.decisions.tabPending' },
  { key: 'APPROVED', label: 'adminOps.decisions.tabApproved' },
  { key: 'IMPROVEMENT', label: 'adminOps.decisions.tabImprovement' },
  { key: 'REJECTED', label: 'adminOps.decisions.tabRejected' },
  { key: 'MINE', label: 'adminOps.decisions.tabMine' },
  { key: 'ARCHIVED', label: 'bulk.view.archived' },
]

// Les valeurs (BUDGET, BASSE…) sont envoyées à l'API : seul le libellé affiché est traduit.
const CATEGORY_LABEL_KEYS = {
  BUDGET: 'adminOps.decisions.categoryBudget',
  EMBAUCHE: 'adminOps.decisions.categoryHiring',
  PROJET: 'adminOps.decisions.categoryProject',
  PARTENARIAT: 'adminOps.decisions.categoryPartnership',
  AUTRE: 'adminOps.decisions.categoryOther',
} as const satisfies Record<DecisionCategory, MessageKey>

const PRIORITY_LABEL_KEYS = {
  BASSE: 'adminOps.decisions.priorityLow',
  NORMALE: 'adminOps.decisions.priorityNormal',
  HAUTE: 'adminOps.decisions.priorityHigh',
  URGENTE: 'adminOps.decisions.priorityUrgent',
} as const satisfies Record<DecisionPriority, MessageKey>

function getSubmitterId(d: Decision): string {
  return typeof d.submittedBy === 'string' ? d.submittedBy : d.submittedBy?._id || ''
}

export default function DecisionsList() {
  const { t } = useI18n()
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
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [preview, setPreview] = useState<FilePreview | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const openPreview = async (decisionId: string, index: number, name: string, mimeType: string) => {
    const result = await fetchDecisionBlob(decisionId, index)
    if (result.error || !result.blob) {
      showToast(result.error ?? t('common.error'), 'error')
      return
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(result.blob)
    previewUrlRef.current = url
    setPreview({ objectUrl: url, name, mimeType })
  }

  const closePreview = () => {
    setPreview(null)
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }

  const loadDecisions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (tab === 'MINE') {
        params.set('mine', 'true')
      } else if (tab === 'ARCHIVED') {
        params.set('archived', 'true')
      } else {
        params.set('status', tab)
      }
      const data = await apiFetch<{ decisions: Decision[] }>(`/api/admin/decisions?${params.toString()}`)
      const nextDecisions = data.decisions || []
      setDecisions(nextDecisions)
      setCommentDrafts((prev) =>
        nextDecisions.reduce<Record<string, string>>((acc, decision) => {
          acc[decision._id] = prev[decision._id] ?? decision.decisionComment ?? ''
          return acc
        }, {}),
      )
    } catch (err) {
      setError((err as Error).message || translate('adminOps.decisions.loadError'))
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    loadDecisions()
  }, [loadDecisions])

  // Sélection groupée : seules les décisions que l'on peut supprimer (auteur ou SUPER_ADMIN) sont cochables.
  const canBulk = useCallback(
    (d: Decision) => user?.role === 'SUPER_ADMIN' || (!!currentUserId && getSubmitterId(d) === currentUserId),
    [user?.role, currentUserId],
  )
  const selectable = useMemo(() => decisions.filter(canBulk), [decisions, canBulk])
  const select = useMultiSelect(selectable, (d) => d._id)
  const { deselect } = select
  const handleBulkDone = useCallback(
    async (result: BulkResult) => {
      deselect(result.succeeded)
      await loadDecisions()
    },
    [deselect, loadDecisions],
  )
  const bulk = useBulkRunner({ endpoint: '/api/admin/decisions/bulk', onDone: handleBulkDone })
  const bulkIds = useMemo(() => [...select.selected], [select.selected])
  const quickFilters = useMemo(() => {
    const limit = Date.now() - 30 * 24 * 60 * 60 * 1000
    return [
      {
        id: 'decided',
        label: t('bulk.quick.decided'),
        ids: selectable.filter((d) => d.status !== 'PENDING').map((d) => d._id),
      },
      {
        id: 'older30',
        label: t('bulk.quick.older30'),
        ids: selectable.filter((d) => new Date(d.createdAt).getTime() < limit).map((d) => d._id),
      },
    ]
  }, [selectable, t])
  const bulkActions: BulkAction[] = [
    tab === 'ARCHIVED'
      ? { id: 'unarchive', label: t('bulk.action.unarchive'), onSelect: () => bulk.run(bulkIds, 'unarchive') }
      : { id: 'archive', label: t('bulk.action.archive'), onSelect: () => bulk.run(bulkIds, 'archive') },
    { id: 'delete', label: t('bulk.action.delete'), danger: true, onSelect: () => bulk.run(bulkIds, 'delete') },
  ]

  const handleApprove = async (id: string) => {
    setActingId(id)
    try {
      const comment = (commentDrafts[id] || '').trim()
      await apiFetch(`/api/admin/decisions/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify(comment ? { comment } : {}),
      })
      await loadDecisions()
    } catch (err) {
      window.alert((err as Error).message || t('common.error'))
    } finally {
      setActingId(null)
    }
  }

  const handleImprove = async (id: string) => {
    setActingId(id)
    try {
      const comment = (commentDrafts[id] || '').trim()
      await apiFetch(`/api/admin/decisions/${id}/improve`, {
        method: 'POST',
        body: JSON.stringify(comment ? { comment } : {}),
      })
      await loadDecisions()
    } catch (err) {
      window.alert((err as Error).message || t('common.error'))
    } finally {
      setActingId(null)
    }
  }

  const handleReject = async (id: string) => {
    setActingId(id)
    try {
      const comment = (commentDrafts[id] || '').trim()
      await apiFetch(`/api/admin/decisions/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify(comment ? { comment } : {}),
      })
      await loadDecisions()
    } catch (err) {
      window.alert((err as Error).message || t('common.error'))
    } finally {
      setActingId(null)
    }
  }

  const handleSaveComment = async (id: string) => {
    setSavingCommentId(id)
    try {
      const comment = (commentDrafts[id] || '').trim()
      const data = await apiFetch<{ decision: Decision }>(`/api/admin/decisions/${id}/comment`, {
        method: 'PATCH',
        body: JSON.stringify({ comment }),
      })
      setDecisions((prev) => prev.map((decision) => (decision._id === id ? data.decision : decision)))
      setCommentDrafts((prev) => ({ ...prev, [id]: data.decision.decisionComment || '' }))
      showToast(t('adminOps.decisions.commentSaved'), 'success')
    } catch (err) {
      window.alert((err as Error).message || t('common.error'))
    } finally {
      setSavingCommentId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('adminOps.decisions.confirmDelete'))) return
    setActingId(id)
    try {
      await apiFetch(`/api/admin/decisions/${id}`, { method: 'DELETE' })
      await loadDecisions()
    } catch (err) {
      window.alert((err as Error).message || t('common.error'))
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="portal-container pilotage-page decisions-page">
      <PageHeader
        eyebrow={t('adminOps.pilotage.zone.overview')}
        title={t('adminOps.decisions.title')}
        subtitle={t('adminOps.decisions.subtitle')}
        actions={
          <div className="admin-quick-actions">
            <button type="button" className="portal-button" onClick={() => setShowCreate(true)}>
              <Plus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              {t('adminOps.decisions.newDecision')}
            </button>
          </div>
        }
      />

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 6, marginTop: 18, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((tabDef) => (
          <button
            key={tabDef.key}
            type="button"
            className={tab === tabDef.key ? 'portal-button' : 'portal-button secondary'}
            style={{ padding: '6px 14px', fontSize: 13 }}
            onClick={() => setTab(tabDef.key)}
          >
            {t(tabDef.label)}
          </button>
        ))}
      </div>

      {!loading && !error && <QuickSelect select={select} filters={quickFilters} total={selectable.length} />}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('adminOps.decisions.loading')}</p>
      ) : error ? (
        <p style={{ color: 'var(--critical)' }}>{error}</p>
      ) : decisions.length === 0 ? (
        <div className="admin-stat-card" style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('adminOps.decisions.empty')}</p>
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
              <div key={d._id} className="decision-card">
                <div className="decision-card-layout">
                  {canBulk(d) && <RowCheckbox id={d._id} name={d.title} select={select} />}
                  <span
                    title={d.priority in PRIORITY_LABEL_KEYS ? t(PRIORITY_LABEL_KEYS[d.priority]) : d.priority}
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
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <strong style={{ fontSize: 14 }}>{d.title}</strong>
                      <span className="admin-badge">
                        {d.category in CATEGORY_LABEL_KEYS ? t(CATEGORY_LABEL_KEYS[d.category]) : d.category}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0' }}>
                      {!expanded && d.description.length > 200 ? d.description.slice(0, 200) + '…' : d.description}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        gap: 12,
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <User size={11} /> {d.submittedByName}
                      </span>
                      <span>{formatDate(d.createdAt)}</span>
                      {deadlineDate && (
                        <span
                          style={{
                            color: overdue ? 'var(--critical)' : undefined,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Calendar size={11} />
                          {t('adminOps.decisions.deadline', { date: formatDate(deadlineDate) })}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : d._id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--primary)',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 2,
                          fontSize: 11,
                        }}
                      >
                        {expanded ? (
                          <>
                            <ChevronUp size={12} /> {t('adminOps.decisions.collapse')}
                          </>
                        ) : (
                          <>
                            <ChevronDown size={12} /> {t('adminOps.decisions.details')}
                          </>
                        )}
                      </button>
                    </div>

                    {expanded && (
                      <div
                        style={{
                          marginTop: 12,
                          paddingTop: 12,
                          borderTop: '1px solid var(--border-color)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                          fontSize: 13,
                        }}
                      >
                        {d.context && (
                          <div>
                            <div
                              style={{
                                fontSize: 11,
                                textTransform: 'none',
                                color: 'var(--text-muted)',
                                marginBottom: 4,
                              }}
                            >
                              {t('adminOps.decisions.contextLabel')}
                            </div>
                            <div style={{ color: 'var(--text-muted)' }}>{d.context}</div>
                          </div>
                        )}
                        {d.options && d.options.length > 0 && (
                          <div>
                            <div
                              style={{
                                fontSize: 11,
                                textTransform: 'none',
                                color: 'var(--text-muted)',
                                marginBottom: 4,
                              }}
                            >
                              {t('adminOps.decisions.optionsLabel')}
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)' }}>
                              {d.options.map((opt, i) => (
                                <li key={i}>{opt}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {d.recommendation && (
                          <div>
                            <div
                              style={{
                                fontSize: 11,
                                textTransform: 'none',
                                color: 'var(--text-muted)',
                                marginBottom: 4,
                              }}
                            >
                              {t('adminOps.decisions.recommendationLabel')}
                            </div>
                            <div style={{ color: 'var(--text-muted)' }}>{d.recommendation}</div>
                          </div>
                        )}
                        {/* Destinataires */}
                        {d.recipients && d.recipients.length > 0 && (
                          <div>
                            <div
                              style={{
                                fontSize: 11,
                                textTransform: 'none',
                                color: 'var(--text-muted)',
                                marginBottom: 4,
                              }}
                            >
                              {t('adminOps.decisions.recipientsLabel')}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {d.recipients.map((r) => (
                                <span
                                  key={typeof r === 'string' ? r : r._id}
                                  style={{
                                    fontSize: 12,
                                    padding: '2px 8px',
                                    borderRadius: 'var(--r-lg)',
                                    background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                                    color: 'var(--primary)',
                                    border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
                                  }}
                                >
                                  {typeof r === 'string' ? r : r.name || r.email}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Pièces jointes */}
                        {d.attachments && d.attachments.length > 0 && (
                          <div>
                            <div
                              style={{
                                fontSize: 11,
                                textTransform: 'none',
                                color: 'var(--text-muted)',
                                marginBottom: 4,
                              }}
                            >
                              <Paperclip size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                              {t('adminOps.decisions.attachmentsLabel')}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {d.attachments.map((a, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => openPreview(d._id, idx, a.originalName, a.mimeType)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontSize: 12,
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 'var(--r-sm)',
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                    color: 'var(--primary)',
                                    textAlign: 'left',
                                  }}
                                >
                                  <Paperclip size={12} />
                                  <span
                                    style={{
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      maxWidth: 180,
                                    }}
                                  >
                                    {a.originalName}
                                  </span>
                                  {a.size > 0 && (
                                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                                      {formatFileSize(a.size)}
                                    </span>
                                  )}
                                  <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 2 }}>👁</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {d.status === 'PENDING' && (
                          <div
                            style={{
                              padding: 10,
                              borderRadius: 'var(--r-md)',
                              background: 'var(--bg-card)',
                              border: '1px solid var(--border-color)',
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                textTransform: 'none',
                                color: 'var(--text-muted)',
                                marginBottom: 6,
                              }}
                            >
                              {t('adminOps.decisions.decisionCommentLabel')}
                            </div>
                            {isSuperAdmin ? (
                              <>
                                <textarea
                                  className="portal-input"
                                  value={commentDrafts[d._id] ?? d.decisionComment ?? ''}
                                  onChange={(event) =>
                                    setCommentDrafts((prev) => ({ ...prev, [d._id]: event.target.value }))
                                  }
                                  rows={3}
                                  maxLength={2000}
                                  placeholder={t('adminOps.decisions.commentPlaceholder')}
                                />
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginTop: 8,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    {t('adminOps.decisions.commentHint')}
                                  </span>
                                  <button
                                    type="button"
                                    className="portal-button secondary"
                                    style={{ padding: '5px 10px', fontSize: 12 }}
                                    disabled={savingCommentId === d._id}
                                    onClick={() => handleSaveComment(d._id)}
                                  >
                                    {savingCommentId === d._id
                                      ? t('adminOps.decisions.saving')
                                      : t('adminOps.decisions.save')}
                                  </button>
                                </div>
                              </>
                            ) : d.decisionComment ? (
                              <div style={{ color: 'var(--text-muted)' }}>« {d.decisionComment} »</div>
                            ) : (
                              <div style={{ color: 'var(--text-muted)' }}>{t('adminOps.decisions.noComment')}</div>
                            )}
                          </div>
                        )}
                        {d.status !== 'PENDING' && (
                          <div
                            style={{
                              padding: 10,
                              borderRadius: 'var(--r-md)',
                              background: STATUS_META[d.status].background,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                textTransform: 'none',
                                color: STATUS_META[d.status].color,
                                marginBottom: 4,
                              }}
                            >
                              {t(STATUS_META[d.status].label)}
                            </div>
                            <div style={{ fontSize: 12 }}>
                              {t('adminOps.decisions.decidedBy', { name: '\u0000' })
                                .split('\u0000')
                                .flatMap((part, i) =>
                                  i === 0 ? [part] : [<strong key="by">{d.decidedByName || '—'}</strong>, part],
                                )}
                              {d.decidedAt && t('adminOps.decisions.decidedOn', { date: formatDate(d.decidedAt) })}
                            </div>
                            {d.decisionComment && (
                              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                                « {d.decisionComment} »
                              </div>
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
                          style={{
                            background: 'var(--good)',
                            borderColor: 'var(--good)',
                            padding: '6px 12px',
                            fontSize: 12,
                          }}
                          disabled={actingId === d._id}
                          onClick={() => handleApprove(d._id)}
                        >
                          <Check size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                          {t('adminOps.decisions.approve')}
                        </button>
                        <button
                          type="button"
                          className="portal-button secondary"
                          style={{
                            padding: '6px 12px',
                            fontSize: 12,
                            color: 'var(--warning)',
                            borderColor: 'var(--warning)',
                          }}
                          disabled={actingId === d._id}
                          onClick={() => handleImprove(d._id)}
                        >
                          <MessageSquare size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                          {t('adminOps.decisions.statusImprovement')}
                        </button>
                        <button
                          type="button"
                          className="portal-button secondary"
                          style={{
                            padding: '6px 12px',
                            fontSize: 12,
                            color: 'var(--critical)',
                            borderColor: 'var(--critical)',
                          }}
                          disabled={actingId === d._id}
                          onClick={() => handleReject(d._id)}
                        >
                          <X size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                          {t('adminOps.decisions.reject')}
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
                        {t('common.delete')}
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
      <BulkActionBar count={select.count} actions={bulkActions} onClear={select.clear} busy={bulk.busy} />
      {bulk.ConfirmDialog}
    </div>
  )
}

// ─── Modale de création ─────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateDecisionModal({ onClose, onCreated }: CreateModalProps) {
  const { t } = useI18n()
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
    apiFetch<{ users: UserRef[] }>('/api/admin/messaging/users')
      .then((d) => setAllUsers(d.users))
      .catch(() => {})
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const parsedOptions = useMemo(
    () =>
      optionsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 10),
    [optionsText],
  )

  const toggleRecipient = (u: UserRef) => {
    setSelectedRecipients((prev) =>
      prev.some((r) => r._id === u._id) ? prev.filter((r) => r._id !== u._id) : [...prev, u],
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (title.trim().length < 3 || title.trim().length > 200) {
      setErr(t('adminOps.decisions.errTitleLength'))
      return
    }
    if (!description.trim()) {
      setErr(t('adminOps.decisions.errDescriptionRequired'))
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

      await apiUpload('/api/admin/decisions', form)
      onCreated()
    } catch (e2) {
      setErr((e2 as Error).message || t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <>
      <div className="dm-backdrop" onClick={onClose} />
      <form className="dm-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="dm-header">
          <h2>{t('adminOps.decisions.modalTitle')}</h2>
          <button type="button" className="dm-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="dm-body">
          <div className="dm-field">
            <label className="dm-label">{t('adminOps.decisions.titleLabel')}</label>
            <input
              className="portal-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={3}
              maxLength={200}
              placeholder={t('adminOps.decisions.titlePlaceholder')}
            />
          </div>

          <div className="dm-field">
            <label className="dm-label">{t('adminOps.decisions.descriptionLabel')}</label>
            <textarea
              className="portal-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              placeholder={t('adminOps.decisions.descriptionPlaceholder')}
            />
          </div>

          <div className="dm-row">
            <div className="dm-field">
              <label className="dm-label">{t('adminOps.decisions.categoryLabel')}</label>
              <select
                className="portal-input"
                value={category}
                onChange={(e) => setCategory(e.target.value as DecisionCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(CATEGORY_LABEL_KEYS[c])}
                  </option>
                ))}
              </select>
            </div>
            <div className="dm-field">
              <label className="dm-label">{t('adminOps.decisions.priorityLabel')}</label>
              <select
                className="portal-input"
                value={priority}
                onChange={(e) => setPriority(e.target.value as DecisionPriority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(PRIORITY_LABEL_KEYS[p])}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="dm-field">
            <label className="dm-label">
              {t('adminOps.decisions.contextLabel')} <small>{t('adminOps.decisions.optional')}</small>
            </label>
            <textarea
              className="portal-input"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={2}
              placeholder={t('adminOps.decisions.contextPlaceholder')}
            />
          </div>

          <div className="dm-field">
            <label className="dm-label">
              {t('adminOps.decisions.optionsLabel')}{' '}
              <small>{t('adminOps.decisions.optionsHint', { count: parsedOptions.length })}</small>
            </label>
            <textarea
              className="portal-input"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={3}
              placeholder={t('adminOps.decisions.optionsPlaceholder')}
            />
          </div>

          <div className="dm-row">
            <div className="dm-field">
              <label className="dm-label">
                {t('adminOps.decisions.recommendationLabel')} <small>{t('adminOps.decisions.optional')}</small>
              </label>
              <textarea
                className="portal-input"
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
                rows={2}
                placeholder={t('adminOps.decisions.recommendationPlaceholder')}
              />
            </div>
            <div className="dm-field">
              <label className="dm-label">
                {t('adminOps.decisions.deadlineLabel')} <small>{t('adminOps.decisions.optional')}</small>
              </label>
              <input
                className="portal-input"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          <div className="dm-field">
            <label className="dm-label">
              {t('adminOps.decisions.addressTo')} <small>{t('adminOps.decisions.addressToHint')}</small>
            </label>
            <div className="dm-chips">
              {allUsers.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('adminOps.decisions.loading')}</span>
              ) : (
                allUsers.map((u) => {
                  const sel = selectedRecipients.some((r) => r._id === u._id)
                  return (
                    <button
                      key={u._id}
                      type="button"
                      className={`dm-chip${sel ? ' on' : ''}`}
                      onClick={() => toggleRecipient(u)}
                    >
                      {u.name || u.email}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="dm-field">
            <label className="dm-label">
              {t('adminOps.decisions.attachmentsLabel')} <small>{t('adminOps.decisions.attachmentsHint')}</small>
            </label>
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
            <button type="button" className="dm-file-btn" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={14} />
              <span>
                {fileNames.length === 0
                  ? t('adminOps.decisions.filesPrompt')
                  : t('adminOps.decisions.filesSelected', { count: fileNames.length })}
              </span>
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
          <button type="button" className="portal-button secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="portal-button" disabled={submitting}>
            {submitting ? t('adminOps.decisions.sending') : t('adminOps.decisions.submit')}
          </button>
        </div>
      </form>
    </>,
    document.body,
  )
}
