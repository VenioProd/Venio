import React, { useEffect, useState } from 'react'
import { useI18n } from '../../context/I18nContext'
import { translate, type MessageKey } from '../../i18n'
import { formatDate } from '../../i18n/format'
import { apiFetch } from '../../lib/api'
import { listClientFiles, uploadClientFiles, deleteClientFile, clientFileDownloadUrl } from '../../services/clientFiles'
import { useToast } from '../../context/ToastContext'
import ConfirmModal from '../../components/ConfirmModal'
import type { ClientUploadFile } from '../../types/clientVault.types'
import type { Project } from '../../types/project.types'
import './ClientPortal.css'

const CATEGORY_LABEL_KEYS: Record<string, MessageKey> = {
  LOGO: 'client.files.catLogo',
  TEXTE: 'client.files.catText',
  PHOTO: 'client.files.catPhoto',
  BRIEF: 'client.files.catBrief',
  AUTRE: 'client.files.catOther',
}

function formatSize(size: number): string {
  if (size < 1024) return translate('client.documents.sizeBytes', { value: size })
  if (size < 1024 * 1024) return translate('client.documents.sizeKb', { value: (size / 1024).toFixed(1) })
  return translate('client.documents.sizeMb', { value: (size / (1024 * 1024)).toFixed(1) })
}

const ClientMyFiles = () => {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [files, setFiles] = useState<ClientUploadFile[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [category, setCategory] = useState('AUTRE')
  const [projectId, setProjectId] = useState('')
  const [note, setNote] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const load = async () => {
    try {
      const [filesData, projectsData] = await Promise.all([
        listClientFiles(),
        apiFetch<{ projects: Project[] }>('/api/projects'),
      ])
      setFiles(filesData.files)
      setProjects(projectsData.projects || [])
    } catch (err: unknown) {
      setError((err as Error).message || t('client.files.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (selectedFiles.length === 0) return
    setUploading(true)
    try {
      const formData = new FormData()
      selectedFiles.forEach((file) => formData.append('files', file))
      if (projectId) formData.append('projectId', projectId)
      formData.append('category', category)
      if (note.trim()) formData.append('note', note.trim())

      await uploadClientFiles(formData)
      setSelectedFiles([])
      setNote('')
      showToast(t('client.files.uploaded'), 'success')
      await load()
    } catch (err: unknown) {
      showToast((err as Error).message || t('client.files.uploadError'), 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteClientFile(pendingDeleteId)
      setFiles((current) => current.filter((f) => f.id !== pendingDeleteId))
      showToast(t('client.files.deleted'), 'success')
    } catch (err: unknown) {
      showToast((err as Error).message || t('client.files.deleteError'), 'error')
    } finally {
      setPendingDeleteId(null)
    }
  }

  return (
    <div className="portal-container">
      <h1>{t('client.files.title')}</h1>

      {error && (
        <div className="client-dashboard-error">
          <span className="client-dashboard-error-icon">!</span>
          <p>{error}</p>
        </div>
      )}

      <div className="portal-card" style={{ marginBottom: 24 }}>
        <form onSubmit={handleUpload} style={{ display: 'grid', gap: 12 }}>
          <input
            className="portal-input"
            type="file"
            multiple
            onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
          />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{t('client.files.limits')}</p>
          <select className="portal-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABEL_KEYS).map(([value, labelKey]) => (
              <option key={value} value={value}>
                {t(labelKey)}
              </option>
            ))}
          </select>
          <select className="portal-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t('client.files.noProject')}</option>
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
          <textarea
            className="portal-input"
            placeholder={t('client.files.notePlaceholder')}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="portal-button" type="submit" disabled={uploading || selectedFiles.length === 0}>
            {uploading ? t('client.files.uploading') : t('client.files.upload')}
          </button>
        </form>
      </div>

      {loading ? (
        <div className="portal-spinner" />
      ) : files.length === 0 ? (
        <div className="client-dashboard-empty">
          <div className="client-dashboard-empty-icon">📁</div>
          <h3>{t('client.files.emptyTitle')}</h3>
          <p>{t('client.files.emptyBody')}</p>
        </div>
      ) : (
        <div className="portal-list">
          {files.map((file) => (
            <div
              key={file.id}
              className="portal-card"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
            >
              <div>
                <span className="portal-badge">
                  {CATEGORY_LABEL_KEYS[file.category] ? t(CATEGORY_LABEL_KEYS[file.category]) : file.category}
                </span>
                <h3 style={{ margin: '8px 0 4px' }}>{file.originalName}</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                  {formatDate(file.createdAt)} · {formatSize(file.size)}
                  {file.note && ` · ${file.note}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a className="portal-button" href={clientFileDownloadUrl(file.id)}>
                  {t('client.billing.download')}
                </a>
                <button type="button" className="portal-button secondary" onClick={() => setPendingDeleteId(file.id)}>
                  {t('client.files.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={pendingDeleteId !== null}
        title={t('client.files.confirmTitle')}
        message={t('client.files.confirmMessage')}
        confirmLabel={t('client.files.delete')}
        cancelLabel={t('client.files.cancel')}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  )
}

export default ClientMyFiles
