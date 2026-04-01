import React from 'react'
import { CRITERIA_COLORS, getProgress } from './types'
import type { QualiopiCriterion } from './types'
import IndicatorRow from './IndicatorRow'

interface CriterionCardProps {
  criterion: QualiopiCriterion
  index: number
  totalCount: number
  isExpanded: boolean
  expandedIndicators: Set<string>
  admins: { _id: string; name: string }[]
  editingCriterion: string | null
  editTitle: string
  onToggleCriterion: (id: string) => void
  onToggleIndicator: (id: string) => void
  onStartEditCriterion: (criterion: QualiopiCriterion) => void
  onSetEditTitle: (title: string) => void
  onSaveEditCriterion: (criterionId: string) => void
  onCancelEdit: () => void
  onReorderCriterion: (criterionId: string, direction: 'up' | 'down') => void
  onDeleteCriterion: (criterionId: string) => void
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
  onConfirmDeleteCriterion: () => Promise<boolean>
  onConfirmDeleteSub: () => Promise<boolean>
}

const CriterionCard: React.FC<CriterionCardProps> = ({
  criterion,
  index: ci,
  totalCount,
  isExpanded,
  expandedIndicators,
  admins,
  editingCriterion,
  editTitle,
  onToggleCriterion,
  onToggleIndicator,
  onStartEditCriterion,
  onSetEditTitle,
  onSaveEditCriterion,
  onCancelEdit,
  onReorderCriterion,
  onDeleteCriterion,
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
  onConfirmDeleteCriterion,
  onConfirmDeleteSub,
}) => {
  const progress = getProgress(criterion.indicators)
  const color = CRITERIA_COLORS[ci % CRITERIA_COLORS.length]

  return (
    <div className="qualiopi-criterion">
      {/* Criterion header */}
      <div
        className="qualiopi-criterion-header"
        style={{ borderLeftColor: color }}
        onClick={() => onToggleCriterion(criterion._id)}
      >
        <div className="qualiopi-criterion-title-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <div className="qualiopi-criterion-info">
            {editingCriterion === criterion._id ? (
              <div className="qualiopi-criterion-edit" onClick={(e) => e.stopPropagation()}>
                <span style={{ color, fontWeight: 700 }}>Critere {criterion.number} — </span>
                <input
                  className="qualiopi-criterion-edit-input"
                  value={editTitle}
                  onChange={(e) => onSetEditTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onSaveEditCriterion(criterion._id); if (e.key === 'Escape') onCancelEdit() }}
                  autoFocus
                />
                <button className="qualiopi-criterion-edit-save" onClick={() => onSaveEditCriterion(criterion._id)} title="Sauvegarder">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                </button>
                <button className="qualiopi-criterion-edit-cancel" onClick={() => onCancelEdit()} title="Annuler">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            ) : (
              <div className="qualiopi-criterion-name">
                <span style={{ color, fontWeight: 700 }}>Critere {criterion.number}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}> — {criterion.title}</span>
              </div>
            )}
            <div className="qualiopi-criterion-objective">{criterion.objective}</div>
          </div>
        </div>
        <div className="qualiopi-criterion-meta">
          <div className="qualiopi-criterion-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="qualiopi-criterion-action-btn"
              onClick={() => onStartEditCriterion(criterion)}
              title="Modifier le titre"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
          <span className="qualiopi-criterion-count">{criterion.indicators.length} ind.</span>
          <div className="qualiopi-mini-bar">
            <div style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%`, background: '#22c55e' }} />
            <div style={{ width: `${(progress.inProgress / Math.max(progress.total, 1)) * 100}%`, background: '#f59e0b' }} />
            <div style={{ width: `${(progress.blocked / Math.max(progress.total, 1)) * 100}%`, background: '#ef4444' }} />
          </div>
          <span className="qualiopi-criterion-percent">{progress.percent}%</span>
        </div>
      </div>

      {/* Indicators */}
      {isExpanded && (
        <div className="qualiopi-indicators">
          {criterion.indicators.map((indicator) => (
            <IndicatorRow
              key={indicator._id}
              indicator={indicator}
              criterionId={criterion._id}
              isExpanded={expandedIndicators.has(indicator._id)}
              admins={admins}
              onToggle={() => onToggleIndicator(indicator._id)}
              onUpdateIndicator={onUpdateIndicator}
              onUpdateSubElement={onUpdateSubElement}
              onAddSubElement={onAddSubElement}
              onDeleteSubElement={onDeleteSubElement}
              onUploadFile={onUploadFile}
              onDeleteFile={onDeleteFile}
              onUploadIndicatorFile={onUploadIndicatorFile}
              onDeleteIndicatorFile={onDeleteIndicatorFile}
              onPreviewFile={onPreviewFile}
              onDownloadFile={onDownloadFile}
              onConfirmDeleteSub={onConfirmDeleteSub}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default CriterionCard
