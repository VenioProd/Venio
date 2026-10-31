import React, { useState, useRef, useCallback } from 'react'
import { translate } from '../../i18n'
import { useI18n } from '../../context/I18nContext'
import '../../styles/file-dropzone.css'

interface Props {
  onFile: (file: File) => void
  accept?: string
  maxSizeMB?: number
  currentFile?: File | null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${translate('compB.fileUnit.b')}`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${translate('compB.fileUnit.kb')}`
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${translate('compB.fileUnit.mb')}`
}

export default function FileDropZone({ onFile, accept, maxSizeMB = 20, currentFile }: Props) {
  const { t } = useI18n()
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      setError('')
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(t('compB.dropZone.tooLarge', { max: maxSizeMB }))
        return
      }
      onFile(file)
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file)
        setPreview(url)
      } else {
        setPreview(null)
      }
    },
    [onFile, maxSizeMB, t],
  )

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const handleClick = () => inputRef.current?.click()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const displayFile = currentFile

  return (
    <div
      className={`file-dropzone ${dragOver ? 'file-dropzone-active' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
    >
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} style={{ display: 'none' }} />

      {preview && (
        <div className="file-dropzone-preview">
          <img src={preview} alt="Preview" />
        </div>
      )}

      {displayFile ? (
        <div className="file-dropzone-info">
          <span className="file-dropzone-name">{displayFile.name}</span>
          <span className="file-dropzone-size">{formatFileSize(displayFile.size)}</span>
        </div>
      ) : (
        <div className="file-dropzone-placeholder">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p>{t('compB.dropZone.prompt')}</p>
          <span className="file-dropzone-limit">{t('compB.dropZone.max', { max: maxSizeMB })}</span>
        </div>
      )}

      {error && <div className="file-dropzone-error">{error}</div>}
    </div>
  )
}
