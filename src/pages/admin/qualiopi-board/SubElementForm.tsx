import React from 'react'
import CustomSelect from '../../../components/admin/CustomSelect'
import { STATUS_CONFIG, STATUS_OPTIONS } from './types'
import type { QualiopiSubElement, QualiopiFile } from './types'

interface SubElementFormProps {
  sub: QualiopiSubElement
  criterionId: string
  indicatorId: string
  admins: { _id: string; name: string }[]
  onUpdateSubElement: (criterionId: string, indicatorId: string, subId: string, patch: Record<string, unknown>) => void
  onUploadFile: (criterionId: string, indicatorId: string, subId: string, file: File) => void
  onDeleteFile: (criterionId: string, indicatorId: string, subId: string, fileId: string) => void
  onDeleteSubElement: (criterionId: string, indicatorId: string, subId: string) => void
  onPreviewFile: (fileId: string, fileName: string, mimeType: string) => void
  onDownloadFile: (fileId: string, fileName: string) => void
  onConfirmDelete: () => Promise<boolean>
}

const SubElementForm: React.FC<SubElementFormProps> = ({
  sub,
  criterionId,
  indicatorId,
  admins,
  onUpdateSubElement,
  onUploadFile,
  onDeleteFile,
  onDeleteSubElement,
  onPreviewFile,
  onDownloadFile,
  onConfirmDelete,
}) => {
  const subStatusConf = STATUS_CONFIG[sub.status]
  const fileExt = (name: string) => name.split('.').pop()?.toUpperCase() || 'FILE'
  const fileSize = (size: number) => size > 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} Mo` : `${Math.round(size / 1024)} Ko`

  return (
    <div className="qualiopi-sub-item">
      {/* Top row: title + controls */}
      <div className="qualiopi-sub-top">
        <div className="qualiopi-sub-title">{sub.title}</div>
        <div className="qualiopi-sub-actions">
          <CustomSelect
            className="qualiopi-inline-select"
            value={sub.assignee?._id || ''}
            onChange={(v) => onUpdateSubElement(criterionId, indicatorId, sub._id, { assignee: v || null })}
            options={[{ value: '', label: '—' }, ...admins.map((a) => ({ value: a._id, label: a.name }))]}
          />
          <span className="qualiopi-status-badge qualiopi-status-badge-sm" style={{ background: subStatusConf.bg, color: subStatusConf.color }}>
            <CustomSelect
              className="qualiopi-status-select"
              value={sub.status}
              onChange={(v) => onUpdateSubElement(criterionId, indicatorId, sub._id, { status: v })}
              options={STATUS_OPTIONS}
            />
          </span>
          <input
            type="date"
            className="qualiopi-date-input"
            value={sub.dueDate?.split('T')[0] || ''}
            onChange={(e) => onUpdateSubElement(criterionId, indicatorId, sub._id, { dueDate: e.target.value || null })}
          />
          <label className="qualiopi-upload-btn-sm" title="Ajouter un fichier">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <input
              type="file"
              style={{ display: 'none' }}
              accept=".pdf,.json,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.zip,.rar,.ppt,.pptx,.txt"
              onChange={(e) => {
                if (e.target.files?.[0]) onUploadFile(criterionId, indicatorId, sub._id, e.target.files[0])
              }}
            />
          </label>
          <button
            className="qualiopi-delete-sub"
            onClick={async () => { if (await onConfirmDelete()) onDeleteSubElement(criterionId, indicatorId, sub._id) }}
            title="Supprimer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
      {/* Files */}
      {sub.files.length > 0 && (
        <div className="qualiopi-file-list">
          {sub.files.map((f) => (
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
              <button onClick={() => onDeleteFile(criterionId, indicatorId, sub._id, f._id)} className="qualiopi-file-remove" title="Supprimer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SubElementForm
