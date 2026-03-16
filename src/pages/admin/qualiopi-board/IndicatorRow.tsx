import React from 'react'
import CustomSelect from '../../../components/admin/CustomSelect'
import { STATUS_CONFIG, STATUS_OPTIONS, getSubProgress } from './types'
import type { QualiopiIndicator, QualiopiFile } from './types'
import SubElementForm from './SubElementForm'

interface IndicatorRowProps {
  indicator: QualiopiIndicator
  criterionId: string
  isExpanded: boolean
  admins: { _id: string; name: string }[]
  onToggle: () => void
  onUpdateIndicator: (criterionId: string, indicatorId: string, patch: Record<string, unknown>) => void
  onUpdateSubElement: (criterionId: string, indicatorId: string, subId: string, patch: Record<string, unknown>) => void
  onAddSubElement: (criterionId: string, indicatorId: string) => void
  onDeleteSubElement: (criterionId: string, indicatorId: string, subId: string) => void
  onUploadFile: (criterionId: string, indicatorId: string, subId: string, file: File) => void
  onDeleteFile: (criterionId: string, indicatorId: string, subId: string, fileId: string) => void
  onUploadIndicatorFile: (criterionId: string, indicatorId: string, file: File) => void
  onDeleteIndicatorFile: (criterionId: string, indicatorId: string, fileId: string) => void
  onPreviewFile: (fileId: string, fileName: string, mimeType: string) => void
  onDownloadFile: (fileId: string, fileName: string) => void
  onConfirmDeleteSub: () => Promise<boolean>
}

const IndicatorRow: React.FC<IndicatorRowProps> = ({
  indicator,
  criterionId,
  isExpanded,
  admins,
  onToggle,
  onUpdateIndicator,
  onUpdateSubElement,
  onAddSubElement,
  onDeleteSubElement,
  onUploadFile,
  onDeleteFile,
  onUploadIndicatorFile,
  onDeleteIndicatorFile,
  onPreviewFile,
  onDownloadFile,
  onConfirmDeleteSub,
}) => {
  const subProg = getSubProgress(indicator.subElements)
  const statusConf = STATUS_CONFIG[indicator.status]
  const fileExt = (name: string) => name.split('.').pop()?.toUpperCase() || 'FILE'
  const fileSize = (size: number) => size > 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} Mo` : `${Math.round(size / 1024)} Ko`

  return (
    <div className="qualiopi-indicator-block">
      {/* Indicator header */}
      <div className="qualiopi-indicator-header" onClick={onToggle}>
        <div className="qualiopi-indicator-left">
          <button className="qualiopi-expand-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <div>
            <div className="qualiopi-indicator-title">
              <span className="qualiopi-indicator-num">#{indicator.number}</span>
              {indicator.title}
            </div>
            <div className="qualiopi-indicator-meta">
              <span className="qualiopi-sub-count">{subProg.done}/{subProg.total} elements</span>
              <span className="qualiopi-file-count">
                {(indicator.files?.length || 0) + indicator.subElements.reduce((acc, s) => acc + s.files.length, 0)} fichier(s)
              </span>
            </div>
          </div>
        </div>
        <div className="qualiopi-indicator-right" onClick={(e) => e.stopPropagation()}>
          <div className="qualiopi-indicator-assignee">
            <CustomSelect
              className="qualiopi-inline-select"
              value={indicator.assignee?._id || ''}
              onChange={(v) => onUpdateIndicator(criterionId, indicator._id, { assignee: v || null })}
              options={[{ value: '', label: 'Non assigne' }, ...admins.map((a) => ({ value: a._id, label: a.name }))]}
            />
          </div>
          <span className="qualiopi-status-badge" style={{ background: statusConf.bg, color: statusConf.color }}>
            <CustomSelect
              className="qualiopi-status-select"
              value={indicator.status}
              onChange={(v) => onUpdateIndicator(criterionId, indicator._id, { status: v })}
              options={STATUS_OPTIONS}
            />
          </span>
          <div className="qualiopi-indicator-dates" onClick={(e) => e.stopPropagation()}>
            <input
              type="date"
              className="qualiopi-date-input"
              value={indicator.startDate?.split('T')[0] || ''}
              onChange={(e) => onUpdateIndicator(criterionId, indicator._id, { startDate: e.target.value || null })}
            />
            <span className="qualiopi-date-arrow">-</span>
            <input
              type="date"
              className="qualiopi-date-input"
              value={indicator.endDate?.split('T')[0] || ''}
              onChange={(e) => onUpdateIndicator(criterionId, indicator._id, { endDate: e.target.value || null })}
            />
          </div>
        </div>
      </div>

      {/* Sub-elements */}
      {isExpanded && (
        <div className="qualiopi-sub-list">
          {/* Indicator-level files */}
          <div className="qualiopi-indicator-files">
            <div className="qualiopi-indicator-files-header">
              <span className="qualiopi-indicator-files-label">Fichiers globaux de l'indicateur</span>
              <label className="qualiopi-upload-btn-sm" title="Ajouter un fichier global">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <input
                  type="file"
                  style={{ display: 'none' }}
                  accept=".pdf,.json,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.zip,.rar,.ppt,.pptx,.txt"
                  onChange={(e) => {
                    if (e.target.files?.[0]) onUploadIndicatorFile(criterionId, indicator._id, e.target.files[0])
                  }}
                />
              </label>
            </div>
            {(indicator.files?.length || 0) > 0 && (
              <div className="qualiopi-file-list">
                {indicator.files.map((f) => (
                  <div key={f._id} className="qualiopi-file-card">
                    <span className="qualiopi-file-ext">{fileExt(f.originalName)}</span>
                    <div className="qualiopi-file-info">
                      <button className="qualiopi-file-name" onClick={() => onPreviewFile(f._id, f.originalName, f.mimeType)} title="Visualiser">
                        {f.originalName}
                      </button>
                      <span className="qualiopi-file-size">{fileSize(f.size)}</span>
                    </div>
                    <button onClick={() => onDownloadFile(f._id, f.originalName)} className="qualiopi-file-dl" title="Telecharger">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                    <button onClick={() => onDeleteIndicatorFile(criterionId, indicator._id, f._id)} className="qualiopi-file-remove" title="Supprimer">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {indicator.subElements.map((sub) => (
            <SubElementForm
              key={sub._id}
              sub={sub}
              criterionId={criterionId}
              indicatorId={indicator._id}
              admins={admins}
              onUpdateSubElement={onUpdateSubElement}
              onUploadFile={onUploadFile}
              onDeleteFile={onDeleteFile}
              onDeleteSubElement={onDeleteSubElement}
              onPreviewFile={onPreviewFile}
              onDownloadFile={onDownloadFile}
              onConfirmDelete={onConfirmDeleteSub}
            />
          ))}
          <button
            className="qualiopi-add-btn"
            onClick={() => onAddSubElement(criterionId, indicator._id)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Ajouter un sous-element
          </button>
        </div>
      )}
    </div>
  )
}

export default IndicatorRow
