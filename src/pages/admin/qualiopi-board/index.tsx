import React, { useEffect, useState, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useConfirm } from '@/hooks/useConfirm'
import { Link } from 'react-router-dom'
import { apiFetch, getToken } from '@/lib/api'
import { logger } from '@/lib/logger'
import { useAuth } from '@/context/AuthContext'
import QualiopiQuestionnaires from '@/components/admin/QualiopiQuestionnaires'
import { CRITERIA_COLORS, getProgress } from './types'
import type { QualiopiCriterion, QualiopiStatus } from './types'
import QualiopiStats from './QualiopiStats'
import CriterionCard from './CriterionCard'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'

const QualiopiBoard = () => {
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
      logger.error(err)
      setError(err.message || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

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
      const updated = await apiFetch<QualiopiCriterion>(`/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      setCriteria((prev) => prev.map((c) => c._id === updated._id ? updated : c))
    } catch (err) { logger.error(err) }
  }

  const updateSubElement = async (criterionId: string, indicatorId: string, subId: string, patch: Record<string, unknown>) => {
    try {
      const updated = await apiFetch<QualiopiCriterion>(`/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}/sub/${subId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      setCriteria((prev) => prev.map((c) => c._id === updated._id ? updated : c))
    } catch (err) { logger.error(err) }
  }

  const addSubElement = async (criterionId: string, indicatorId: string) => {
    try {
      const updated = await apiFetch<QualiopiCriterion>(`/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}/sub`, {
        method: 'POST',
        body: JSON.stringify({ title: 'Nouveau sous-element' }),
      })
      setCriteria((prev) => prev.map((c) => c._id === updated._id ? updated : c))
    } catch (err) { logger.error(err) }
  }

  const deleteSubElement = async (criterionId: string, indicatorId: string, subId: string) => {
    try {
      const updated = await apiFetch<QualiopiCriterion>(`/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}/sub/${subId}`, {
        method: 'DELETE',
      })
      setCriteria((prev) => prev.map((c) => c._id === updated._id ? updated : c))
    } catch (err) { logger.error(err) }
  }

  const uploadFile = async (criterionId: string, indicatorId: string, subId: string, file: File) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      const token = getToken()
      const res = await fetch(`/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}/sub/${subId}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      const updated = await res.json()
      setCriteria((prev) => prev.map((c) => c._id === updated._id ? updated : c))
    } catch (err) { logger.error(err) }
  }

  const downloadFile = async (fileId: string, fileName: string) => {
    try {
      const token = getToken()
      const res = await fetch(`/api/admin/qualiopi/files/${fileId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) { logger.error(err) }
  }

  const previewFile = async (fileId: string, fileName: string, mimeType: string) => {
    try {
      const token = getToken()
      const res = await fetch(`/api/admin/qualiopi/files/${fileId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Preview failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setPreview({ url, name: fileName, mime: mimeType })
    } catch (err) { logger.error(err) }
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
      setCriteria((prev) => prev.map((c) => c._id === updated._id ? updated : c))
    } catch (err) { logger.error(err) }
  }

  const deleteCriterion = async (criterionId: string) => {
    try {
      await apiFetch(`/api/admin/qualiopi/criteria/${criterionId}`, { method: 'DELETE' })
      setCriteria((prev) => prev.filter((c) => c._id !== criterionId))
    } catch (err) { logger.error(err) }
  }

  const reorderCriterion = async (criterionId: string, direction: 'up' | 'down') => {
    try {
      const all = await apiFetch<QualiopiCriterion[]>('/api/admin/qualiopi/criteria-reorder', {
        method: 'PATCH',
        body: JSON.stringify({ criterionId, direction }),
      })
      setCriteria(all)
    } catch (err) { logger.error(err) }
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
      const updated = await apiFetch<QualiopiCriterion>(`/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}/sub/${subId}/files/${fileId}`, {
        method: 'DELETE',
      })
      setCriteria((prev) => prev.map((c) => c._id === updated._id ? updated : c))
    } catch (err) { logger.error(err) }
  }

  const uploadIndicatorFile = async (criterionId: string, indicatorId: string, file: File) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      const token = getToken()
      const res = await fetch(`/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      const updated = await res.json()
      setCriteria((prev) => prev.map((c) => c._id === updated._id ? updated : c))
    } catch (err) { logger.error(err) }
  }

  const deleteIndicatorFile = async (criterionId: string, indicatorId: string, fileId: string) => {
    try {
      const updated = await apiFetch<QualiopiCriterion>(`/api/admin/qualiopi/criteria/${criterionId}/indicators/${indicatorId}/files/${fileId}`, {
        method: 'DELETE',
      })
      setCriteria((prev) => prev.map((c) => c._id === updated._id ? updated : c))
    } catch (err) { logger.error(err) }
  }

  // Global progress
  const allIndicators = criteria.flatMap((c) => c.indicators)
  const globalProgress = getProgress(allIndicators)
  // All sub-elements progress
  const allSubs = allIndicators.flatMap((i) => i.subElements)
  const allSubsDone = allSubs.filter((s) => s.status === 'FAIT' || s.status === 'NON_CONCERNE').length

  if (loading) return (
    <div className="portal-container">
      <div className="portal-card" style={{ padding: 60, textAlign: 'center' }}>
        <div className="qualiopi-loading-spinner" />
        <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>Chargement du referentiel Qualiopi...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="portal-container">
      <div className="portal-card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#ef4444', marginBottom: 16 }}>Erreur : {error}</p>
        <button onClick={load} style={{ background: '#ff0080', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
          Reessayer
        </button>
      </div>
    </div>
  )

  return (
    <div className="portal-container">
      {ConfirmDialog}
      {/* Header */}
      <div className="qualiopi-hero">
        <div className="qualiopi-hero-content">
          <Link to="/admin" className="qualiopi-back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Retour au dashboard
          </Link>
          <h1 className="qualiopi-hero-title">Suivi Qualiopi — <span>Formatio</span></h1>
          <p className="qualiopi-hero-subtitle">Referentiel National Qualite — Certification des organismes de formation</p>
        </div>
        <div className="qualiopi-hero-badge">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff0080" strokeWidth="1.5">
            <path d="M9 12l2 2 4-4" />
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
          </svg>
          <span>Qualiopi</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="qualiopi-tabs">
        <button className={`qualiopi-tab ${activeTab === 'board' ? 'active' : ''}`} onClick={() => setActiveTab('board')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Tableau de bord
        </button>
        <button className={`qualiopi-tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
          Tous les fichiers
          {allSubs.reduce((acc, s) => acc + s.files.length, 0) > 0 && (
            <span className="qualiopi-tab-badge">{allSubs.reduce((acc, s) => acc + s.files.length, 0)}</span>
          )}
        </button>
        <button className={`qualiopi-tab ${activeTab === 'questionnaires' ? 'active' : ''}`} onClick={() => setActiveTab('questionnaires')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          Questionnaires
        </button>
      </div>

      {activeTab === 'board' && <>
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
        {viewMode === 'list' && criteria.map((criterion, ci) => (
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
            onConfirmDeleteCriterion={() => confirm({ message: 'Supprimer ce critere et tous ses indicateurs ?', title: 'Suppression' })}
            onConfirmDeleteSub={() => confirm({ message: 'Supprimer ce sous-element ?', title: 'Suppression' })}
          />
        ))}

        {/* === VUE KANBAN === */}
        {viewMode === 'kanban' && (() => {
          const columns: { key: QualiopiStatus; label: string; color: string }[] = [
            { key: 'A_FAIRE', label: 'A faire', color: '#94a3b8' },
            { key: 'EN_COURS', label: 'En cours', color: '#f59e0b' },
            { key: 'FAIT', label: 'Fait', color: '#22c55e' },
            { key: 'BLOQUE', label: 'Bloque', color: '#ef4444' },
          ]

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
                        <div className="qualiopi-kanban-empty">Aucun indicateur</div>
                      )}
                      {indicators.map((ind) => {
                        const criterion = criteria.find((c) => c.indicators.some((i) => i._id === ind._id))
                        const ci = criterion ? criterion.number - 1 : 0
                        const color = CRITERIA_COLORS[ci % CRITERIA_COLORS.length]
                        const subDone = ind.subElements.filter((s) => s.status === 'FAIT' || s.status === 'NON_CONCERNE').length
                        const subTotal = ind.subElements.length
                        const filesCount = (ind.files?.length || 0) + ind.subElements.reduce((acc, s) => acc + s.files.length, 0)

                        return (
                          <div key={ind._id} className="qualiopi-kanban-card" style={{ borderLeftColor: color }}>
                            <div className="qualiopi-kanban-card-header">
                              <span className="qualiopi-kanban-card-badge" style={{ background: color }}>C{criterion?.number}</span>
                              <span className="qualiopi-kanban-card-num">#{ind.number}</span>
                            </div>
                            <div className="qualiopi-kanban-card-title">{ind.title}</div>
                            <div className="qualiopi-kanban-card-meta">
                              <span>{subDone}/{subTotal} elements</span>
                              {filesCount > 0 && <span>{filesCount} fichier(s)</span>}
                              {ind.assignee && <span>{ind.assignee.name}</span>}
                            </div>
                            <div className="qualiopi-kanban-card-bar">
                              <div style={{ width: `${subTotal > 0 ? (subDone / subTotal) * 100 : 0}%`, background: color }} />
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

      </>}

      {/* Files tab */}
      {activeTab === 'files' && (
        <div className="qualiopi-files-tab">
          {(() => {
            const allFiles: { file: { _id: string; originalName: string; storagePath: string; mimeType: string; size: number; uploadedAt: string }; criterionNum: number; criterionTitle: string; indicatorNum: number; indicatorTitle: string; subTitle: string; criterionId: string; indicatorId: string; subId: string; isIndicatorFile?: boolean }[] = []
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
                      subTitle: '(fichier global)',
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
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                  <p>Aucun fichier uploade pour le moment</p>
                </div>
              )
            }

            const fileExt = (name: string) => name.split('.').pop()?.toUpperCase() || 'FILE'
            const fileSize = (size: number) => size > 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} Mo` : `${Math.round(size / 1024)} Ko`
            const fileDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })

            // Group by criterion
            const byCriterion = new Map<number, typeof allFiles>()
            allFiles.forEach((item) => {
              const list = byCriterion.get(item.criterionNum) || []
              list.push(item)
              byCriterion.set(item.criterionNum, list)
            })

            return (
              <>
                <div className="qualiopi-files-count">{allFiles.length} fichier(s) au total</div>
                {Array.from(byCriterion.entries()).sort((a, b) => a[0] - b[0]).map(([num, files]) => {
                  const color = CRITERIA_COLORS[(num - 1) % CRITERIA_COLORS.length]
                  return (
                    <div key={num} className="qualiopi-files-criterion-group">
                      <div className="qualiopi-files-criterion-header" style={{ borderLeftColor: color }}>
                        <span style={{ color, fontWeight: 700 }}>Critere {num}</span>
                        <span style={{ color: 'var(--text-muted)' }}> — {files[0].criterionTitle}</span>
                        <span className="qualiopi-files-criterion-count">{files.length} fichier(s)</span>
                      </div>
                      <div className="qualiopi-files-grid">
                        {files.map((item) => (
                          <div key={item.file._id} className="qualiopi-file-full-card">
                            <div className="qualiopi-file-full-top">
                              <span className="qualiopi-file-ext" style={{ background: color }}>{fileExt(item.file.originalName)}</span>
                              <div className="qualiopi-file-full-info">
                                <button className="qualiopi-file-name" onClick={() => previewFile(item.file._id, item.file.originalName, item.file.mimeType)}>
                                  {item.file.originalName}
                                </button>
                                <span className="qualiopi-file-size">{fileSize(item.file.size)} — {fileDate(item.file.uploadedAt)}</span>
                              </div>
                            </div>
                            <div className="qualiopi-file-full-origin">
                              <span className="qualiopi-file-origin-badge" style={{ background: color }}>Ind. {item.indicatorNum}</span>
                              <span className="qualiopi-file-origin-text">{item.subTitle}</span>
                            </div>
                            <div className="qualiopi-file-full-actions">
                              <button onClick={() => previewFile(item.file._id, item.file.originalName, item.file.mimeType)} className="qualiopi-file-action-btn" title="Visualiser">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              </button>
                              <button onClick={() => downloadFile(item.file._id, item.file.originalName)} className="qualiopi-file-action-btn" title="Telecharger">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              </button>
                              <button onClick={() => item.isIndicatorFile ? deleteIndicatorFile(item.criterionId, item.indicatorId, item.file._id) : deleteFile(item.criterionId, item.indicatorId, item.subId, item.file._id)} className="qualiopi-file-action-btn qualiopi-file-action-delete" title="Supprimer">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
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
      {preview && ReactDOM.createPortal(
        <div className="qualiopi-preview-overlay" onClick={closePreview}>
          <div className="qualiopi-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="qualiopi-preview-header">
              <span className="qualiopi-preview-title">{preview.name}</span>
              <div className="qualiopi-preview-actions">
                <a href={preview.url} download={preview.name} className="qualiopi-preview-dl" title="Telecharger">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </a>
                <button className="qualiopi-preview-close" onClick={closePreview}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
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
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff0080" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                  <p>Apercu non disponible pour ce format</p>
                  <a href={preview.url} download={preview.name} className="qualiopi-preview-dl-btn">Telecharger le fichier</a>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default QualiopiBoard
