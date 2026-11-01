import PageHeader from '../../../components/admin/ui/PageHeader'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, apiUpload } from '../../../lib/api'
import { useAuth } from '../../../context/AuthContext'
import { useConfirm } from '../../../hooks/useConfirm'
import { useI18n } from '../../../context/I18nContext'
import { REPORT_STATUS_CONFIG, formatDate, formatDateTime, formatFileSize, isImage } from '../intern-list/types'
import type { ActivityReport } from '../intern-list/types'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'
import DocPreviewModal from '../../../components/DocPreviewModal'

const MyReports = () => {
  const { t } = useI18n()
  const { user } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()

  const [reports, setReports] = useState<ActivityReport[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [expandedReport, setExpandedReport] = useState<string | null>(null)
  const [reportForm, setReportForm] = useState({
    date: new Date().toISOString().split('T')[0],
    contenu: '',
    taches: '',
  })
  const [reportFiles, setReportFiles] = useState<File[]>([])
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadReports = useCallback(async () => {
    try {
      const data = await apiFetch<ActivityReport[]>('/api/admin/interns/reports/mine')
      setReports(data)
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const handleCreate = async () => {
    if (!reportForm.contenu) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('date', reportForm.date)
      fd.append('contenu', reportForm.contenu)
      if (reportForm.taches) {
        const tachesArr = reportForm.taches.split('\n').filter((t) => t.trim())
        fd.append('taches', JSON.stringify(tachesArr))
      }
      reportFiles.forEach((f) => fd.append('files', f))

      await apiUpload('/api/admin/interns/reports', fd)

      setReportForm({ date: new Date().toISOString().split('T')[0], contenu: '', taches: '' })
      setReportFiles([])
      setShowForm(false)
      loadReports()
    } catch {
      /* silent */
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (reportId: string) => {
    const ok = await confirm({
      message: t('adminOps.reports.confirmDelete'),
      title: t('adminOps.reports.confirmTitle'),
      variant: 'danger',
    })
    if (!ok) return
    try {
      await apiFetch(`/api/admin/interns/reports/${reportId}`, { method: 'DELETE' })
      loadReports()
    } catch {
      /* silent */
    }
  }

  if (loading)
    return (
      <div
        className="portal-container pilotage-page reports-page"
        style={{ textAlign: 'center', color: 'var(--text-primary)' }}
      >
        {t('common.loading')}
      </div>
    )

  return (
    <div className="portal-container pilotage-page reports-page">
      {ConfirmDialog}
      {preview && <DocPreviewModal url={preview.url} name={preview.name} onClose={() => setPreview(null)} />}

      <PageHeader
        eyebrow={t('adminOps.pilotage.zone.overview')}
        title={t('adminOps.reports.title')}
        subtitle={t('adminOps.reports.subtitle')}
        actions={
          <>
            <Link to="/admin" className="portal-button secondary pilotage-back-link">
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
              {t('adminOps.reports.backToDashboard')}
            </Link>
            <button className="portal-button" onClick={() => setShowForm(!showForm)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('adminOps.reports.newReport')}
            </button>
          </>
        }
      />

      {/* Formulaire */}
      {showForm && (
        <div className="portal-card" style={{ marginTop: 16, marginBottom: 20 }}>
          <div className="ticket-form">
            <h3 style={{ margin: '0 0 16px', color: 'var(--primary)' }}>{t('adminOps.reports.formTitle')}</h3>
            <div className="ticket-form-field">
              <label>{t('adminOps.reports.dateLabel')}</label>
              <input
                type="date"
                value={reportForm.date}
                onChange={(e) => setReportForm({ ...reportForm, date: e.target.value })}
              />
            </div>
            <div className="ticket-form-field">
              <label>{t('adminOps.reports.contentLabel')}</label>
              <textarea
                rows={5}
                placeholder={t('adminOps.reports.contentPlaceholder')}
                value={reportForm.contenu}
                onChange={(e) => setReportForm({ ...reportForm, contenu: e.target.value })}
              />
            </div>
            <div className="ticket-form-field">
              <label>{t('adminOps.reports.tasksLabel')}</label>
              <textarea
                rows={3}
                placeholder={t('adminOps.reports.tasksPlaceholder')}
                value={reportForm.taches}
                onChange={(e) => setReportForm({ ...reportForm, taches: e.target.value })}
              />
            </div>
            <div className="ticket-form-field">
              <label>
                {t('adminOps.reports.attachmentsLabel')}{' '}
                <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 400 }}>
                  {t('adminOps.reports.attachmentsHint')}
                </span>
              </label>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.pptx,.txt,.zip,.mp4,.mov,.mp3"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files) setReportFiles([...reportFiles, ...Array.from(e.target.files)])
                  if (fileRef.current) fileRef.current.value = ''
                }}
              />
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.currentTarget.style.borderColor = 'var(--primary)'
                }}
                onDragLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--line-strong)'
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.currentTarget.style.borderColor = 'var(--line-strong)'
                  if (e.dataTransfer.files) setReportFiles([...reportFiles, ...Array.from(e.dataTransfer.files)])
                }}
                style={{
                  border: '2px dashed var(--line-strong)',
                  borderRadius: 'var(--r-md)',
                  padding: '20px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, background 0.2s',
                  background: 'var(--bg-card)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary) 40%, transparent)'
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 4%, transparent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--line-strong)'
                  e.currentTarget.style.background = 'var(--bg-card)'
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginBottom: 6 }}
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <div style={{ color: 'var(--primary)', fontSize: 13, fontWeight: 600 }}>
                  {t('adminOps.reports.dropPrompt')}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
                  {t('adminOps.reports.dropFormats')}
                </div>
              </div>
              {reportFiles.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {reportFiles.map((f, i) => {
                    const sizeMo = (f.size / (1024 * 1024)).toFixed(1)
                    return (
                      <span
                        key={i}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 'var(--r-sm)',
                          background: 'color-mix(in srgb, var(--primary) 6%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)',
                          color: 'var(--text-secondary)',
                          fontSize: 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--primary)"
                          strokeWidth="2"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        {f.name}
                        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                          {t('adminOps.reports.fileSize', { size: sizeMo })}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setReportFiles(reportFiles.filter((_, j) => j !== i))
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--critical)',
                            cursor: 'pointer',
                            fontSize: 16,
                            lineHeight: 1,
                            padding: 0,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button className="ticket-new-btn" disabled={submitting || !reportForm.contenu} onClick={handleCreate}>
                {submitting ? t('adminOps.reports.sending') : t('adminOps.reports.send')}
              </button>
              <button
                className="ticket-back-btn"
                onClick={() => {
                  setShowForm(false)
                  setReportFiles([])
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liste des rapports */}
      <div className="ticket-list">
        {reports.length === 0 && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{t('adminOps.reports.empty')}</p>
        )}
        {reports.map((report) => {
          const expanded = expandedReport === report._id
          const sCfg = {
            ...REPORT_STATUS_CONFIG[report.status],
            color:
              report.status === 'VALIDE'
                ? 'var(--good)'
                : report.status === 'SOUMIS'
                  ? 'var(--primary)'
                  : 'var(--warning)',
          }
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
                      {t('adminOps.reports.taskCount', { count: report.taches.length })}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {report.attachments.length > 0 && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>📎 {report.attachments.length}</span>
                  )}
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--r-pill)',
                      fontSize: 11,
                      fontWeight: 600,
                      background: `color-mix(in srgb, ${sCfg.color} 12%, transparent)`,
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
                    ▼
                  </span>
                </div>
              </div>
              {expanded && (
                <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {t('adminOps.reports.summaryLabel')}
                    </span>
                    <p
                      style={{
                        color: 'var(--text-secondary)',
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
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {t('adminOps.reports.tasksDoneLabel')}
                      </span>
                      <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                        {report.taches.map((t, i) => (
                          <li key={i} style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 4 }}>
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {report.attachments.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {t('adminOps.reports.attachmentsLabel')}
                      </span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                        {report.attachments.map((f, i) => (
                          <button
                            key={i}
                            onClick={() =>
                              setPreview({
                                url: `/api/admin/interns/reports/files/${f.filename}`,
                                name: f.originalName,
                              })
                            }
                            style={{
                              padding: '6px 10px',
                              borderRadius: 'var(--r-sm)',
                              background: 'var(--bg-card)',
                              color: 'var(--primary)',
                              fontSize: 12,
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            {isImage(f.mimetype) ? '🖼️' : '📄'} {f.originalName}
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({formatFileSize(f.size)})</span>
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
                        {t('adminOps.reports.adminComment')}
                      </span>
                      <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 0' }}>
                        {report.commentaireAdmin}
                      </p>
                    </div>
                  )}

                  {report.status === 'VALIDE' && report.validePar && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                      {t('adminOps.reports.validatedBy', { name: report.validePar.name })}
                      {report.valideAt
                        ? t('adminOps.reports.validatedOn', { date: formatDateTime(report.valideAt) })
                        : ''}
                    </div>
                  )}

                  {report.status !== 'VALIDE' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="ticket-back-btn"
                        style={{ fontSize: 12, color: 'var(--critical)' }}
                        onClick={() => handleDelete(report._id)}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MyReports
