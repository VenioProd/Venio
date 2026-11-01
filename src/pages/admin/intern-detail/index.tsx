import PageHeader from '../../../components/admin/ui/PageHeader'
import '../OrganisationSysteme.css'
import { useEffect, useState, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ApiError, apiFetch, apiUpload } from '../../../lib/api'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { useConfirm } from '../../../hooks/useConfirm'
import {
  REPORT_STATUS_CONFIG,
  STATUS_CONFIG,
  INTERN_DAYS,
  INTERN_DAY_LABEL_KEYS,
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
  const { t } = useI18n()
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
      navigate('/admin/equipe/membres')
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
      alert(err.message || translate('intern.error.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    const ok = await confirm({
      message: translate('intern.delete.confirmIntern'),
      title: translate('intern.delete.title'),
      variant: 'danger',
    })
    if (!ok) return
    try {
      await apiFetch(`/api/admin/interns/${id}`, { method: 'DELETE' })
      navigate('/admin/equipe/membres')
    } catch {
      /* silent */
    }
  }

  const handleValidateReport = async (reportId: string, status: string, commentaire?: string) => {
    try {
      const fd = new FormData()
      fd.append('status', status)
      if (commentaire !== undefined) fd.append('commentaireAdmin', commentaire)
      await apiUpload(`/api/admin/interns/reports/${reportId}`, fd, { method: 'PATCH' })
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
      await apiUpload(`/api/admin/interns/${id}/convention`, fd)
      loadData()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : translate('intern.detail.networkError'))
    } finally {
      setConventionUploading(false)
      e.target.value = ''
    }
  }

  const handleConventionDelete = async (filename: string, originalName: string) => {
    const ok = await confirm({
      message: translate('intern.detail.confirmDeleteFile', { name: originalName }),
      title: translate('intern.delete.title'),
      variant: 'danger',
    })
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
      <div
        className="portal-container lot-c-page intern-detail-page"
        style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-primary)' }}
      >
        {t('intern.list.loading')}
      </div>
    )
  if (!data) return null

  const { intern, stats, reports } = data
  const statusCfg = STATUS_CONFIG[intern.status]

  return (
    <div className="portal-container lot-c-page intern-detail-page">
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
              <h2 className="confirm-modal__title">{t('intern.comment.title')}</h2>
              <button
                className="confirm-modal__close"
                onClick={() => setCommentModal(null)}
                type="button"
                aria-label={t('intern.comment.close')}
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
                <label>{t('intern.comment.label')}</label>
                <textarea
                  rows={4}
                  placeholder={t('intern.detail.commentPlaceholder')}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="confirm-modal__footer">
              <button className="confirm-modal__btn confirm-modal__btn--cancel" onClick={() => setCommentModal(null)}>
                {t('intern.comment.cancel')}
              </button>
              <button
                className="confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--info"
                onClick={handleSubmitComment}
              >
                {t('intern.comment.send')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <PageHeader
        eyebrow={t('adminOps.zone.team')}
        title={intern.userId.name}
        subtitle={
          <>
            <span>
              {intern.poste}
              {intern.departement ? ` — ${intern.departement}` : ''}
            </span>
            <span className="lot-c-chips">
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                  color: 'var(--primary)',
                }}
              >
                {intern.type === 'ALTERNANT' ? t('intern.type.apprentice') : t('intern.type.intern')}
              </span>
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 12,
                  fontWeight: 600,
                  background: `color-mix(in srgb, ${statusCfg.color} 13.3%, transparent)`,
                  color: statusCfg.color,
                }}
              >
                {t(statusCfg.labelKey)}
              </span>
            </span>
          </>
        }
        actions={
          <>
            <Link to="/admin/equipe/membres" className="ticket-back-btn">
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
              {t('intern.detail.backToTeam')}
            </Link>
            <div style={{ display: 'flex', gap: 8 }}>
              {isSuperAdmin && !editing && (
                <>
                  <button className="ticket-new-btn" onClick={() => setEditing(true)} style={{ fontSize: 13 }}>
                    {t('intern.card.edit')}
                  </button>
                  <button
                    className="ticket-back-btn"
                    onClick={handleDelete}
                    style={{ fontSize: 13, color: 'var(--critical)' }}
                  >
                    {t('intern.card.delete')}
                  </button>
                </>
              )}
            </div>
          </>
        }
      />

      {/* Stats cards */}
      <div className="ticket-stats" style={{ marginBottom: 20 }}>
        <StatCard
          value={String(stats.totalReports)}
          label={t('intern.detail.statTotalReports')}
          color="var(--primary)"
        />
        <StatCard value={String(stats.reportsThisWeek)} label={t('intern.dash.thisWeek')} color="var(--good)" />
        <StatCard
          value={`${stats.validationRate}%`}
          label={t('intern.detail.statValidationRate')}
          color="var(--primary)"
        />
        <StatCard
          value={String(stats.pendingReports)}
          label={t('intern.detail.statPending')}
          color={stats.pendingReports > 0 ? 'var(--warning)' : 'var(--text-muted)'}
        />
        <StatCard
          value={
            stats.daysSinceLastReport === null
              ? '—'
              : stats.daysSinceLastReport === 0
                ? t('intern.dash.today')
                : t('intern.detail.daysShort', { count: stats.daysSinceLastReport })
          }
          label={t('intern.dash.colLastReport')}
          color={
            stats.daysSinceLastReport === null
              ? 'var(--text-muted)'
              : stats.daysSinceLastReport > 3
                ? 'var(--critical)'
                : stats.daysSinceLastReport > 1
                  ? 'var(--warning)'
                  : 'var(--good)'
          }
        />
      </div>

      {/* Infos + Edit */}
      <div className="portal-card" style={{ marginBottom: 20 }}>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: 16 }}>{t('intern.detail.infoTitle')}</h3>
            {editing && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="ticket-new-btn"
                  onClick={handleSave}
                  disabled={submitting}
                  style={{ fontSize: 12, padding: '6px 14px' }}
                >
                  {submitting ? t('intern.settings.saving') : t('intern.settings.save')}
                </button>
                <button
                  className="ticket-back-btn"
                  onClick={() => setEditing(false)}
                  style={{ fontSize: 12, padding: '6px 14px' }}
                >
                  {t('intern.card.cancel')}
                </button>
              </div>
            )}
          </div>

          {!editing ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))',
                gap: 16,
              }}
            >
              <InfoField label={t('intern.card.fieldEmail')} value={intern.userId.email} />
              <InfoField label={t('intern.card.fieldPhone')} value={intern.userId.phone || '—'} />
              <InfoField label={t('intern.detail.mission')} value={intern.poste} />
              <InfoField label={t('intern.form.department')} value={intern.departement || '—'} />
              <InfoField label={t('intern.detail.startDate')} value={formatDate(intern.dateDebut)} />
              <InfoField label={t('intern.detail.endDate')} value={formatDate(intern.dateFin)} />
              <InfoField label={t('intern.card.fieldTutor')} value={intern.tuteur?.name || '—'} />
              <InfoField label={t('intern.card.fieldSchool')} value={intern.ecole || '—'} />
              <InfoField label={t('intern.card.fieldTraining')} value={intern.formation || '—'} />
              <InfoField
                label={t('intern.form.presenceDays')}
                value={
                  intern.joursPresence?.length
                    ? intern.joursPresence
                        .map((j) =>
                          INTERN_DAY_LABEL_KEYS[j]
                            ? t(INTERN_DAY_LABEL_KEYS[j])
                            : j.charAt(0).toUpperCase() + j.slice(1),
                        )
                        .join(', ')
                    : '—'
                }
              />
              <InfoField label={t('intern.detail.status')} value={t(statusCfg.labelKey)} color={statusCfg.color} />
              <InfoField label={t('intern.detail.createdBy')} value={intern.createdBy?.name || '—'} />
              <InfoField
                label={t('intern.detail.daysRemaining')}
                value={
                  stats.daysRemaining > 0
                    ? t('intern.detail.daysCount', { count: stats.daysRemaining })
                    : t('intern.status.finished')
                }
                color={
                  stats.daysRemaining <= 7
                    ? 'var(--critical)'
                    : stats.daysRemaining <= 30
                      ? 'var(--warning)'
                      : undefined
                }
              />
            </div>
          ) : (
            <div className="ticket-form">
              <div className="ticket-form-row">
                <div className="ticket-form-field">
                  <label>{t('intern.card.fieldType')}</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as 'STAGIAIRE' | 'ALTERNANT' })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-md)',
                      background: 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)',
                      color: 'inherit',
                      fontSize: 14,
                    }}
                  >
                    <option value="STAGIAIRE">{t('intern.type.intern')}</option>
                    <option value="ALTERNANT">{t('intern.type.apprentice')}</option>
                  </select>
                </div>
                <div className="ticket-form-field">
                  <label>{t('intern.detail.mission')}</label>
                  <input value={form.poste} onChange={(e) => setForm({ ...form, poste: e.target.value })} />
                </div>
                <div className="ticket-form-field">
                  <label>{t('intern.form.department')}</label>
                  <input value={form.departement} onChange={(e) => setForm({ ...form, departement: e.target.value })} />
                </div>
              </div>
              <div className="ticket-form-row">
                <div className="ticket-form-field">
                  <label>{t('intern.detail.startDate')}</label>
                  <input
                    type="date"
                    value={form.dateDebut}
                    onChange={(e) => setForm({ ...form, dateDebut: e.target.value })}
                  />
                </div>
                <div className="ticket-form-field">
                  <label>{t('intern.detail.endDate')}</label>
                  <input
                    type="date"
                    value={form.dateFin}
                    onChange={(e) => setForm({ ...form, dateFin: e.target.value })}
                  />
                </div>
              </div>
              <div className="ticket-form-row">
                <div className="ticket-form-field">
                  <label>{t('intern.card.fieldTutor')}</label>
                  <select value={form.tuteur} onChange={(e) => setForm({ ...form, tuteur: e.target.value })}>
                    <option value="">{t('intern.detail.noTutor')}</option>
                    {admins.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ticket-form-field">
                  <label>{t('intern.detail.status')}</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="ACTIF">{t('intern.status.active')}</option>
                    <option value="TERMINE">{t('intern.status.finished')}</option>
                    <option value="ANNULE">{t('intern.status.cancelled')}</option>
                  </select>
                </div>
              </div>
              <div className="ticket-form-row">
                <div className="ticket-form-field">
                  <label>{t('intern.form.school')}</label>
                  <input value={form.ecole} onChange={(e) => setForm({ ...form, ecole: e.target.value })} />
                </div>
                <div className="ticket-form-field">
                  <label>{t('intern.card.fieldTraining')}</label>
                  <input value={form.formation} onChange={(e) => setForm({ ...form, formation: e.target.value })} />
                </div>
              </div>
              <div className="ticket-form-field">
                <label>{t('intern.form.internalNotes')}</label>
                <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="ticket-form-field">
                <label>{t('intern.form.presenceDays')}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {INTERN_DAYS.map((jour) => {
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
                          borderRadius: 'var(--r-sm)',
                          background: checked
                            ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                            : 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                          border: `1px solid ${checked ? 'var(--primary)' : 'color-mix(in srgb, var(--text-primary) 10%, transparent)'}`,
                          fontSize: 13,
                          color: checked ? 'var(--primary)' : 'var(--text-secondary)',
                          transition: 'all 0.15s',
                          userSelect: 'none',
                        }}
                      >
                        {t(INTERN_DAY_LABEL_KEYS[jour])}
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
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('intern.card.progress')}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{stats.progress}%</span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 'var(--r-sm)',
                background: 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 'var(--r-sm)',
                  width: `${stats.progress}%`,
                  background:
                    stats.progress >= 90
                      ? 'var(--critical)'
                      : stats.progress >= 70
                        ? 'var(--warning)'
                        : 'var(--primary)',
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatDate(intern.dateDebut)}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatDate(intern.dateFin)}</span>
            </div>
          </div>

          {/* Notes internes */}
          {intern.notes && !editing && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 'var(--r-md)',
                background: 'color-mix(in srgb, var(--primary) 6%, transparent)',
                borderLeft: '3px solid var(--primary)',
              }}
            >
              <span style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 600 }}>
                {t('intern.form.internalNotes')}
              </span>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
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
                borderRadius: 'var(--r-md)',
                background: 'color-mix(in srgb, var(--primary) 6%, transparent)',
                borderLeft: '3px solid var(--primary)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 600 }}>
                  {t('intern.detail.nextcloudAccount')}
                </span>
                <a
                  href="https://cloud.susanoo.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--primary)',
                    fontSize: 11,
                    textDecoration: 'none',
                    padding: '3px 8px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                    background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                  }}
                >
                  {t('intern.detail.openNextcloud')}
                </a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, display: 'block', marginBottom: 2 }}>
                    {t('intern.detail.username')}
                  </span>
                  <code
                    style={{
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                      padding: '3px 8px',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    {intern.nextcloudUsername}
                  </code>
                </div>
                {intern.nextcloudPassword && (
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, display: 'block', marginBottom: 2 }}>
                      {t('intern.detail.initialPassword')}
                    </span>
                    <code
                      style={{
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                        padding: '3px 8px',
                        borderRadius: 'var(--r-sm)',
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
            <h3 style={{ margin: 0, color: 'var(--warning)', fontSize: 16 }}>
              {t('intern.detail.agreementsTitle')}
              {(intern.conventions?.length ?? 0) > 0 && (
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>
                  {t('intern.detail.agreementsCount', { count: intern.conventions!.length })}
                </span>
              )}
            </h3>
            <label
              style={{
                display: 'inline-block',
                padding: '6px 14px',
                borderRadius: 'var(--r-sm)',
                fontSize: 12,
                fontWeight: 600,
                background: conventionUploading
                  ? 'color-mix(in srgb, var(--text-primary) 6%, transparent)'
                  : 'color-mix(in srgb, var(--primary) 15%, transparent)',
                color: conventionUploading ? 'var(--text-muted)' : 'var(--primary)',
                border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                cursor: conventionUploading ? 'not-allowed' : 'pointer',
              }}
            >
              {conventionUploading ? t('intern.card.sending') : t('intern.detail.addAgreement')}
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
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>{t('intern.detail.noAgreement')}</p>
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
                    borderRadius: 'var(--r-md)',
                    background: 'color-mix(in srgb, var(--warning) 5%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--warning) 12%, transparent)',
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--warning)"
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
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {conv.originalName}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 1 }}>
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
                      borderRadius: 'var(--r-sm)',
                      fontSize: 12,
                      background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                      color: 'var(--primary)',
                      border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {t('intern.detail.view')}
                  </button>
                  <a
                    href={`/api/admin/interns/conventions/files/${conv.filename}`}
                    download={conv.originalName}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 'var(--r-sm)',
                      fontSize: 12,
                      background: 'color-mix(in srgb, var(--warning) 8%, transparent)',
                      color: 'var(--warning)',
                      border: '1px solid color-mix(in srgb, var(--warning) 20%, transparent)',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {t('intern.detail.download')}
                  </a>
                  {isSuperAdmin && (
                    <button
                      onClick={() => handleConventionDelete(conv.filename, conv.originalName)}
                      style={{
                        padding: '5px 8px',
                        borderRadius: 'var(--r-sm)',
                        fontSize: 12,
                        background: 'color-mix(in srgb, var(--critical) 6%, transparent)',
                        color: 'var(--critical)',
                        border: '1px solid color-mix(in srgb, var(--critical) 15%, transparent)',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {t('intern.card.delete')}
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
        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 16 }}>
          {t('intern.detail.reportsTitle', { count: reports.length })}
        </h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['cards', 'liste'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setReportView(v)}
              style={{
                padding: '5px 12px',
                borderRadius: 'var(--r-sm)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background:
                  reportView === v ? 'var(--primary)' : 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
                color: reportView === v ? 'var(--text-primary)' : 'var(--text-secondary)',
                transition: 'all 0.2s',
              }}
            >
              {v === 'cards' ? t('intern.detail.viewCards') : t('intern.reports.viewList')}
            </button>
          ))}
        </div>
      </div>

      {reports.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{t('intern.detail.noReports')}</p>
      ) : reportView === 'liste' ? (
        /* ── VUE LISTE (tableau) ── */
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)' }}>
                {[
                  t('intern.dash.logDate'),
                  t('intern.detail.status'),
                  t('intern.detail.colTasks'),
                  t('intern.detail.colFiles'),
                  t('intern.report.summary'),
                  t('intern.detail.colActions'),
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 8px',
                      textAlign: 'left',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: 'none',
                      letterSpacing: 'normal',
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
                    style={{ borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 4%, transparent)' }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = 'color-mix(in srgb, var(--text-primary) 3%, transparent)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td
                      style={{
                        padding: '10px 8px',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatDate(report.date)}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--r-sm)',
                          fontSize: 11,
                          fontWeight: 600,
                          background: `color-mix(in srgb, ${sCfg.color} 13.3%, transparent)`,
                          color: sCfg.color,
                        }}
                      >
                        {t(sCfg.labelKey)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{report.taches.length}</td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{report.attachments.length}</td>
                    <td
                      style={{
                        padding: '10px 8px',
                        color: 'var(--text-secondary)',
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
                            borderRadius: 'var(--r-sm)',
                            fontSize: 11,
                            cursor: 'pointer',
                            border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                            background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                            color: 'var(--primary)',
                          }}
                        >
                          {expandedReport === report._id ? t('intern.comment.close') : t('intern.detail.view')}
                        </button>
                        {isSuperAdmin && report.status === 'SOUMIS' && (
                          <button
                            onClick={() => handleValidateReport(report._id, 'VALIDE')}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 'var(--r-sm)',
                              fontSize: 11,
                              cursor: 'pointer',
                              border: '1px solid color-mix(in srgb, var(--good) 30%, transparent)',
                              background: 'color-mix(in srgb, var(--good) 8%, transparent)',
                              color: 'var(--good)',
                            }}
                          >
                            {t('intern.report.validate')}
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
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatDate(report.date)}</span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--r-sm)',
                          fontSize: 11,
                          fontWeight: 600,
                          background: `color-mix(in srgb, ${sCfg.color} 13.3%, transparent)`,
                          color: sCfg.color,
                        }}
                      >
                        {t(sCfg.labelKey)}
                      </span>
                    </div>
                    <p
                      style={{
                        color: 'var(--text-primary)',
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
                        {report.taches.map((task, i) => (
                          <li key={i} style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 4 }}>
                            {task}
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
                              borderRadius: 'var(--r-sm)',
                              background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                              color: 'var(--primary)',
                              fontSize: 12,
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            {f.originalName}{' '}
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({formatFileSize(f.size)})</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {report.commentaireAdmin && (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: 'var(--r-sm)',
                          background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                          borderLeft: '3px solid var(--primary)',
                          marginBottom: 12,
                        }}
                      >
                        <span style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 600 }}>
                          {t('intern.report.adminComment')}
                        </span>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 0' }}>
                          {report.commentaireAdmin}
                        </p>
                      </div>
                    )}
                    {report.status === 'VALIDE' && report.validePar && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {report.valideAt
                          ? t('intern.report.validatedByOn', {
                              name: report.validePar.name,
                              date: formatDateTime(report.valideAt),
                            })
                          : t('intern.report.validatedBy', { name: report.validePar.name })}
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
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatDate(report.date)}</span>
                    {report.taches.length > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 10 }}>
                        {t('intern.reports.taskCount', { count: report.taches.length })}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {report.attachments.length > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {t('intern.detail.fileCount', { count: report.attachments.length })}
                      </span>
                    )}
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--r-sm)',
                        fontSize: 11,
                        fontWeight: 600,
                        background: `color-mix(in srgb, ${sCfg.color} 13.3%, transparent)`,
                        color: sCfg.color,
                      }}
                    >
                      {t(sCfg.labelKey)}
                    </span>
                    <span
                      style={{
                        color: 'var(--text-muted)',
                        transform: expanded ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s',
                      }}
                    >
                      &#9660;
                    </span>
                  </div>
                </div>
                {expanded && (
                  <div
                    style={{
                      padding: '16px 20px',
                      borderTop: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
                    }}
                  >
                    <div style={{ marginBottom: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('intern.report.summary')}</span>
                      <p
                        style={{
                          color: 'var(--text-primary)',
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
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('intern.report.tasksDone')}</span>
                        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                          {report.taches.map((task, i) => (
                            <li key={i} style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 4 }}>
                              {task}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {report.attachments.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          {t('intern.report.attachments')}
                        </span>
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
                                borderRadius: 'var(--r-sm)',
                                background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
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
                              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
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
                          borderRadius: 'var(--r-sm)',
                          background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                          marginBottom: 12,
                          borderLeft: '3px solid var(--primary)',
                        }}
                      >
                        <span style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 600 }}>
                          {t('intern.report.adminComment')}
                        </span>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 0' }}>
                          {report.commentaireAdmin}
                        </p>
                      </div>
                    )}
                    {report.status === 'VALIDE' && report.validePar && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                        {report.valideAt
                          ? t('intern.report.validatedByOn', {
                              name: report.validePar.name,
                              date: formatDateTime(report.valideAt),
                            })
                          : t('intern.report.validatedBy', { name: report.validePar.name })}
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
                            {t('intern.report.validate')}
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
                          {t('intern.report.comment')}
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
    <span style={{ color: 'var(--text-secondary)', fontSize: 12, display: 'block' }}>{label}</span>
  </div>
)

const InfoField = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div>
    <span style={{ color: 'var(--text-muted)', fontSize: 11, display: 'block', marginBottom: 2 }}>{label}</span>
    <span style={{ color: color || 'var(--text-primary)', fontSize: 14, fontWeight: 500 }}>{value}</span>
  </div>
)

export default InternDetail
