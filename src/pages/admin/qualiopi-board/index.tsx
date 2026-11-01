import PageHeader from '../../../components/admin/ui/PageHeader'
import '../OrganisationSysteme.css'
import { useEffect, useState, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useConfirm } from '../../../hooks/useConfirm'

import { apiDownload, apiFetch, apiUpload } from '../../../lib/api'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import QualiopiQuestionnaires from '../../../components/admin/QualiopiQuestionnaires'
import { CRITERIA_COLORS, STATUS_CONFIG, formatFileDate, formatFileSize, getProgress } from './types'
import type { QualiopiCriterion, QualiopiStatus } from './types'
import QualiopiStats from './QualiopiStats'
import CriterionCard from './CriterionCard'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'

const QualiopiBoard = () => {
  const { t } = useI18n()
  const { user } = useAuth()
  const [criteria, setCriteria] = useState<QualiopiCriterion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCriteria, setExpandedCriteria] = useState<Set<string>>(new Set())
  const [expandedIndicators, setExpandedIndicators] = useState<Set<string>>(new Set())
  const [admins, setAdmins] = useState<{ _id: string; name: string }[]>([])
  const [preview, setPreview] = useState<{ url: string; name: string; mime: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'board' | 'files' | 'questionnaires'>('board')
  const { confirm, ConfirmDialog } = useConfirm()
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [editingCriterion, setEditingCriterion] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const load = useCallback(async () => {
    try {
      setError(null)
      const data = await apiFetch<QualiopiCriterion[]>('/api/admin/qualiopi')
      setCriteria(data)
      setExpandedCriteria(new Set())
      // Load admins separately — RH may not have MANAGE_ADMINS permission
      try {
        const adminData = await apiFetch<{ users: { _id: string; name: string; role: string }[] }>('/api/admin/admins')
        const allAdmins = adminData?.users || []
        setAdmins(allAdmins.filter((a) => a.role === 'SUPER_ADMIN' || a.role === 'RH'))
      } catch {
        setAdmins([])
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || translate('orgs.qualiopi.board.loadError'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleCriterion = (id: string) => {
    setExpandedCriteria((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleIndicator = (id: string) => {
    setExpandedIndicators((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const updateIndicator = async (criterionId: string, indicatorId: string, patch: Record<string, unknown>) => {
    try {
      const updated = await apiFetch<QualiopiCriterion>(
        `/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
        },
      )
      setCriteria((prev) => prev.map((c) => (c._id === updated._id ? updated : c)))
    } catch (err) {
      console.error(err)
    }
  }

  const updateSubElement = async (
    criterionId: string,
    indicatorId: string,
    subId: string,
    patch: Record<string, unknown>,
  ) => {
    try {
      const updated = await apiFetch<QualiopiCriterion>(
        `/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}/sub/${subId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
        },
      )
      setCriteria((prev) => prev.map((c) => (c._id === updated._id ? updated : c)))
    } catch (err) {
      console.error(err)
    }
  }

  const addSubElement = async (criterionId: string, indicatorId: string) => {
    try {
      const updated = await apiFetch<QualiopiCriterion>(
        `/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}/sub`,
        {
          method: 'POST',
          // i18n-ignore: titre par défaut enregistré en base, pas un libellé d'interface
          body: JSON.stringify({ title: 'Nouveau sous-element' }),
        },
      )
      setCriteria((prev) => prev.map((c) => (c._id === updated._id ? updated : c)))
    } catch (err) {
      console.error(err)
    }
  }

  const deleteSubElement = async (criterionId: string, indicatorId: string, subId: string) => {
    try {
      const updated = await apiFetch<QualiopiCriterion>(
        `/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}/sub/${subId}`,
        {
          method: 'DELETE',
        },
      )
      setCriteria((prev) => prev.map((c) => (c._id === updated._id ? updated : c)))
    } catch (err) {
      console.error(err)
    }
  }

  const uploadFile = async (criterionId: string, indicatorId: string, subId: string, file: File) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      const updated = await apiUpload<QualiopiCriterion>(
        `/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}/sub/${subId}/files`,
        formData,
      )
      setCriteria((prev) => prev.map((c) => (c._id === updated._id ? updated : c)))
    } catch (err) {
      console.error(err)
    }
  }

  const downloadFile = async (fileId: string, fileName: string) => {
    try {
      const { blob, filename } = await apiDownload(`/api/admin/qualiopi/files/${fileId}/download`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename ?? fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
    }
  }

  const previewFile = async (fileId: string, fileName: string, mimeType: string) => {
    try {
      const { blob } = await apiDownload(`/api/admin/qualiopi/files/${fileId}/download`)
      const url = URL.createObjectURL(blob)
      setPreview({ url, name: fileName, mime: mimeType })
    } catch (err) {
      console.error(err)
    }
  }

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url)
    setPreview(null)
  }

  const updateCriterion = async (criterionId: string, patch: Record<string, unknown>) => {
    try {
      const updated = await apiFetch<QualiopiCriterion>(`/api/admin/qualiopi/criteria/${criterionId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      setCriteria((prev) => prev.map((c) => (c._id === updated._id ? updated : c)))
    } catch (err) {
      console.error(err)
    }
  }

  const deleteCriterion = async (criterionId: string) => {
    try {
      await apiFetch(`/api/admin/qualiopi/criteria/${criterionId}`, { method: 'DELETE' })
      setCriteria((prev) => prev.filter((c) => c._id !== criterionId))
    } catch (err) {
      console.error(err)
    }
  }

  const reorderCriterion = async (criterionId: string, direction: 'up' | 'down') => {
    try {
      const all = await apiFetch<QualiopiCriterion[]>('/api/admin/qualiopi/criteria-reorder', {
        method: 'PATCH',
        body: JSON.stringify({ criterionId, direction }),
      })
      setCriteria(all)
    } catch (err) {
      console.error(err)
    }
  }

  const startEditCriterion = (criterion: QualiopiCriterion) => {
    setEditingCriterion(criterion._id)
    setEditTitle(criterion.title)
  }

  const saveEditCriterion = async (criterionId: string) => {
    if (editTitle.trim()) {
      await updateCriterion(criterionId, { title: editTitle.trim() })
    }
    setEditingCriterion(null)
  }

  const deleteFile = async (criterionId: string, indicatorId: string, subId: string, fileId: string) => {
    try {
      const updated = await apiFetch<QualiopiCriterion>(
        `/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}/sub/${subId}/files/${fileId}`,
        {
          method: 'DELETE',
        },
      )
      setCriteria((prev) => prev.map((c) => (c._id === updated._id ? updated : c)))
    } catch (err) {
      console.error(err)
    }
  }

  const uploadIndicatorFile = async (criterionId: string, indicatorId: string, file: File) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      const updated = await apiUpload<QualiopiCriterion>(
        `/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}/files`,
        formData,
      )
      setCriteria((prev) => prev.map((c) => (c._id === updated._id ? updated : c)))
    } catch (err) {
      console.error(err)
    }
  }

  const deleteIndicatorFile = async (criterionId: string, indicatorId: string, fileId: string) => {
    try {
      const updated = await apiFetch<QualiopiCriterion>(
        `/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}/files/${fileId}`,
        {
          method: 'DELETE',
        },
      )
      setCriteria((prev) => prev.map((c) => (c._id === updated._id ? updated : c)))
    } catch (err) {
      console.error(err)
    }
  }

  // Global progress
  const allIndicators = criteria.flatMap((c) => c.indicators)
  const globalProgress = getProgress(allIndicators)
  // All sub-elements progress
  const allSubs = allIndicators.flatMap((i) => i.subElements)
  const allSubsDone = allSubs.filter((s) => s.status === 'FAIT' || s.status === 'NON_CONCERNE').length

  if (loading)
    return (
      <div className="portal-container lot-c-page qualiopi-page">
        <div className="portal-card" style={{ padding: 60, textAlign: 'center' }}>
          <div className="qualiopi-loading-spinner" />
          <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>{t('orgs.qualiopi.board.loading')}</p>
        </div>
      </div>
    )

  if (error)
    return (
      <div className="portal-container lot-c-page qualiopi-page">
        <div className="portal-card" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--critical)', marginBottom: 16 }}>
            {t('orgs.qualiopi.board.errorPrefix', { error })}
          </p>
          <button
            onClick={load}
            style={{
              background: 'var(--primary)',
              color: 'var(--text-primary)',
              border: 'none',
              padding: '10px 24px',
              borderRadius: 'var(--r-md)',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {t('orgs.qualiopi.board.retry')}
          </button>
        </div>
      </div>
    )

  return (
    <div className="portal-container lot-c-page qualiopi-page">
      {ConfirmDialog}
      {/* Header */}
      <PageHeader
        eyebrow={t('adminOps.zone.education')}
        title={`${t('orgs.qualiopi.board.title')} — Formatio`}
        subtitle={t('orgs.qualiopi.board.subtitle')}
      />

      {/* Tabs */}
      <div className="qualiopi-tabs">
        <button
          className={`qualiopi-tab ${activeTab === 'board' ? 'active' : ''}`}
          onClick={() => setActiveTab('board')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          {t('orgs.qualiopi.board.tabBoard')}
        </button>
        <button
          className={`qualiopi-tab ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
          {t('orgs.qualiopi.board.tabFiles')}
          {allSubs.reduce((acc, s) => acc + s.files.length, 0) > 0 && (
            <span className="qualiopi-tab-badge">{allSubs.reduce((acc, s) => acc + s.files.length, 0)}</span>
          )}
        </button>
        <button
          className={`qualiopi-tab ${activeTab === 'questionnaires' ? 'active' : ''}`}
          onClick={() => setActiveTab('questionnaires')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
          {t('orgs.qualiopi.board.tabQuestionnaires')}
        </button>
      </div>

      {activeTab === 'board' && (
        <>
          <QualiopiStats
            criteriaCount={criteria.length}
            allIndicators={allIndicators}
            allSubs={allSubs}
            allSubsDone={allSubsDone}
            globalProgress={globalProgress}
            viewMode={viewMode}
            setViewMode={setViewMode}
          />

          {/* === VUE LISTE === */}
          {viewMode === 'list' &&
            criteria.map((criterion, ci) => (
              <CriterionCard
                key={criterion._id}
                criterion={criterion}
                index={ci}
                totalCount={criteria.length}
                isExpanded={expandedCriteria.has(criterion._id)}
                expandedIndicators={expandedIndicators}
                admins={admins}
                editingCriterion={editingCriterion}
                editTitle={editTitle}
                onToggleCriterion={toggleCriterion}
                onToggleIndicator={toggleIndicator}
                onStartEditCriterion={startEditCriterion}
                onSetEditTitle={setEditTitle}
                onSaveEditCriterion={saveEditCriterion}
                onCancelEdit={() => setEditingCriterion(null)}
                onReorderCriterion={reorderCriterion}
                onDeleteCriterion={deleteCriterion}
                onUpdateIndicator={updateIndicator}
                onUpdateSubElement={updateSubElement}
                onAddSubElement={addSubElement}
                onDeleteSubElement={deleteSubElement}
                onUploadFile={uploadFile}
                onDeleteFile={deleteFile}
                onUploadIndicatorFile={uploadIndicatorFile}
                onDeleteIndicatorFile={deleteIndicatorFile}
                onPreviewFile={previewFile}
                onDownloadFile={downloadFile}
                onConfirmDeleteCriterion={() =>
                  confirm({
                    message: t('orgs.qualiopi.board.confirmDeleteCriterion'),
                    title: t('orgs.qualiopi.board.confirmDeleteTitle'),
                  })
                }
                onConfirmDeleteSub={() =>
                  confirm({
                    message: t('orgs.qualiopi.board.confirmDeleteSub'),
                    title: t('orgs.qualiopi.board.confirmDeleteTitle'),
                  })
                }
              />
            ))}

          {/* === VUE KANBAN === */}
          {viewMode === 'kanban' &&
            (() => {
              const columns: { key: QualiopiStatus; label: string; color: string }[] = (
                ['A_FAIRE', 'EN_COURS', 'FAIT', 'BLOQUE'] as const
              ).map((key) => ({ key, label: t(STATUS_CONFIG[key].labelKey), color: STATUS_CONFIG[key].color }))

              return (
                <div className="qualiopi-kanban">
                  {columns.map((col) => {
                    const indicators = allIndicators.filter((ind) => ind.status === col.key)
                    return (
                      <div key={col.key} className="qualiopi-kanban-col">
                        <div className="qualiopi-kanban-col-header">
                          <span className="qualiopi-kanban-col-dot" style={{ background: col.color }} />
                          <span className="qualiopi-kanban-col-title">{col.label}</span>
                          <span className="qualiopi-kanban-col-count">{indicators.length}</span>
                        </div>
                        <div className="qualiopi-kanban-col-body">
                          {indicators.length === 0 && (
                            <div className="qualiopi-kanban-empty">{t('orgs.qualiopi.board.noIndicator')}</div>
                          )}
                          {indicators.map((ind) => {
                            const criterion = criteria.find((c) => c.indicators.some((i) => i._id === ind._id))
                            const ci = criterion ? criterion.number - 1 : 0
                            const color = CRITERIA_COLORS[ci % CRITERIA_COLORS.length]
                            const subDone = ind.subElements.filter(
                              (s) => s.status === 'FAIT' || s.status === 'NON_CONCERNE',
                            ).length
                            const subTotal = ind.subElements.length
                            const filesCount =
                              (ind.files?.length || 0) + ind.subElements.reduce((acc, s) => acc + s.files.length, 0)

                            return (
                              <div key={ind._id} className="qualiopi-kanban-card" style={{ borderLeftColor: color }}>
                                <div className="qualiopi-kanban-card-header">
                                  <span className="qualiopi-kanban-card-badge" style={{ background: color }}>
                                    C{criterion?.number}
                                  </span>
                                  <span className="qualiopi-kanban-card-num">#{ind.number}</span>
                                </div>
                                <div className="qualiopi-kanban-card-title">{ind.title}</div>
                                <div className="qualiopi-kanban-card-meta">
                                  <span>
                                    {t('orgs.qualiopi.indicator.subCount', { done: subDone, total: subTotal })}
                                  </span>
                                  {filesCount > 0 && (
                                    <span>{t('orgs.qualiopi.file.count', { count: filesCount })}</span>
                                  )}
                                  {ind.assignee && <span>{ind.assignee.name}</span>}
                                </div>
                                <div className="qualiopi-kanban-card-bar">
                                  <div
                                    style={{
                                      width: `${subTotal > 0 ? (subDone / subTotal) * 100 : 0}%`,
                                      background: color,
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
        </>
      )}

      {/* Files tab */}
      {activeTab === 'files' && (
        <div className="qualiopi-files-tab">
          {(() => {
            const allFiles: {
              file: {
                _id: string
                originalName: string
                storagePath: string
                mimeType: string
                size: number
                uploadedAt: string
              }
              criterionNum: number
              criterionTitle: string
              indicatorNum: number
              indicatorTitle: string
              subTitle: string
              criterionId: string
              indicatorId: string
              subId: string
              isIndicatorFile?: boolean
            }[] = []
            criteria.forEach((c) => {
              c.indicators.forEach((ind) => {
                // Indicator-level files
                if (ind.files) {
                  ind.files.forEach((f) => {
                    allFiles.push({
                      file: f,
                      criterionNum: c.number,
                      criterionTitle: c.title,
                      indicatorNum: ind.number,
                      indicatorTitle: ind.title,
                      subTitle: t('orgs.qualiopi.board.globalFile'),
                      criterionId: c._id,
                      indicatorId: ind._id,
                      subId: '',
                      isIndicatorFile: true,
                    })
                  })
                }
                // Sub-element files
                ind.subElements.forEach((sub) => {
                  sub.files.forEach((f) => {
                    allFiles.push({
                      file: f,
                      criterionNum: c.number,
                      criterionTitle: c.title,
                      indicatorNum: ind.number,
                      indicatorTitle: ind.title,
                      subTitle: sub.title,
                      criterionId: c._id,
                      indicatorId: ind._id,
                      subId: sub._id,
                    })
                  })
                })
              })
            })

            if (allFiles.length === 0) {
              return (
                <div className="qualiopi-files-empty">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="color-mix(in srgb, var(--text-primary) 15%, transparent)"
                    strokeWidth="1.5"
                  >
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  <p>{t('orgs.qualiopi.board.noFiles')}</p>
                </div>
              )
            }

            const fileExt = (name: string) => name.split('.').pop()?.toUpperCase() || 'FILE'

            // Group by criterion
            const byCriterion = new Map<number, typeof allFiles>()
            allFiles.forEach((item) => {
              const list = byCriterion.get(item.criterionNum) || []
              list.push(item)
              byCriterion.set(item.criterionNum, list)
            })

            return (
              <>
                <div className="qualiopi-files-count">
                  {t('orgs.qualiopi.board.filesTotal', { count: allFiles.length })}
                </div>
                {Array.from(byCriterion.entries())
                  .sort((a, b) => a[0] - b[0])
                  .map(([num, files]) => {
                    const color = CRITERIA_COLORS[(num - 1) % CRITERIA_COLORS.length]
                    return (
                      <div key={num} className="qualiopi-files-criterion-group">
                        <div className="qualiopi-files-criterion-header" style={{ borderLeftColor: color }}>
                          <span style={{ color, fontWeight: 700 }}>
                            {t('orgs.qualiopi.criterion.label', { number: num })}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}> — {files[0].criterionTitle}</span>
                          <span className="qualiopi-files-criterion-count">
                            {t('orgs.qualiopi.file.count', { count: files.length })}
                          </span>
                        </div>
                        <div className="qualiopi-files-grid">
                          {files.map((item) => (
                            <div key={item.file._id} className="qualiopi-file-full-card">
                              <div className="qualiopi-file-full-top">
                                <span className="qualiopi-file-ext" style={{ background: color }}>
                                  {fileExt(item.file.originalName)}
                                </span>
                                <div className="qualiopi-file-full-info">
                                  <button
                                    className="qualiopi-file-name"
                                    onClick={() =>
                                      previewFile(item.file._id, item.file.originalName, item.file.mimeType)
                                    }
                                  >
                                    {item.file.originalName}
                                  </button>
                                  <span className="qualiopi-file-size">
                                    {formatFileSize(item.file.size)} — {formatFileDate(item.file.uploadedAt)}
                                  </span>
                                </div>
                              </div>
                              <div className="qualiopi-file-full-origin">
                                <span className="qualiopi-file-origin-badge" style={{ background: color }}>
                                  {t('orgs.qualiopi.board.indicatorShort', { number: item.indicatorNum })}
                                </span>
                                <span className="qualiopi-file-origin-text">{item.subTitle}</span>
                              </div>
                              <div className="qualiopi-file-full-actions">
                                <button
                                  onClick={() => previewFile(item.file._id, item.file.originalName, item.file.mimeType)}
                                  className="qualiopi-file-action-btn"
                                  title={t('orgs.qualiopi.file.preview')}
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => downloadFile(item.file._id, item.file.originalName)}
                                  className="qualiopi-file-action-btn"
                                  title={t('orgs.qualiopi.file.download')}
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() =>
                                    item.isIndicatorFile
                                      ? deleteIndicatorFile(item.criterionId, item.indicatorId, item.file._id)
                                      : deleteFile(item.criterionId, item.indicatorId, item.subId, item.file._id)
                                  }
                                  className="qualiopi-file-action-btn qualiopi-file-action-delete"
                                  title={t('orgs.qualiopi.file.delete')}
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
              </>
            )
          })()}
        </div>
      )}

      {/* Questionnaires tab */}
      {activeTab === 'questionnaires' && <QualiopiQuestionnaires />}

      {/* Preview modal — portal pour eviter les contextes d'empilement du layout */}
      {preview &&
        ReactDOM.createPortal(
          <div className="qualiopi-preview-overlay" onClick={closePreview}>
            <div className="qualiopi-preview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="qualiopi-preview-header">
                <span className="qualiopi-preview-title">{preview.name}</span>
                <div className="qualiopi-preview-actions">
                  <a
                    href={preview.url}
                    download={preview.name}
                    className="qualiopi-preview-dl"
                    title={t('orgs.qualiopi.file.download')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </a>
                  <button className="qualiopi-preview-close" onClick={closePreview}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="qualiopi-preview-body">
                {preview.mime.startsWith('image/') ? (
                  <img src={preview.url} alt={preview.name} className="qualiopi-preview-img" />
                ) : preview.mime === 'application/pdf' ? (
                  <iframe src={preview.url} className="qualiopi-preview-iframe" title={preview.name} />
                ) : preview.mime === 'application/json' || preview.mime.startsWith('text/') ? (
                  <iframe src={preview.url} className="qualiopi-preview-iframe" title={preview.name} />
                ) : (
                  <div className="qualiopi-preview-unsupported">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth="1.5"
                    >
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                    <p>{t('orgs.qualiopi.board.previewUnsupported')}</p>
                    <a href={preview.url} download={preview.name} className="qualiopi-preview-dl-btn">
                      {t('orgs.qualiopi.board.downloadFile')}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

export default QualiopiBoard
