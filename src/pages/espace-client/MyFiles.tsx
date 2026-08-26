import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { listClientFiles, uploadClientFiles, deleteClientFile, clientFileDownloadUrl } from '../../services/clientFiles'
import { useToast } from '../../context/ToastContext'
import ConfirmModal from '../../components/ConfirmModal'
import type { ClientUploadFile } from '../../types/clientVault.types'
import type { Project } from '../../types/project.types'
import './ClientPortal.css'

const CATEGORY_LABELS: Record<string, string> = {
  LOGO: 'Logo',
  TEXTE: 'Texte',
  PHOTO: 'Photo',
  BRIEF: 'Brief',
  AUTRE: 'Autre',
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} o`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`
}

const ClientMyFiles = () => {
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
      setError((err as Error).message || 'Erreur chargement fichiers')
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
      showToast('Fichiers envoyés', 'success')
      await load()
    } catch (err: unknown) {
      showToast((err as Error).message || 'Erreur lors de l’envoi', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteClientFile(pendingDeleteId)
      setFiles((current) => current.filter((f) => f.id !== pendingDeleteId))
      showToast('Fichier supprimé', 'success')
    } catch (err: unknown) {
      showToast((err as Error).message || 'Erreur suppression', 'error')
    } finally {
      setPendingDeleteId(null)
    }
  }

  return (
    <div className="portal-container">
      <h1>Vos fichiers</h1>

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
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            10 fichiers max, 20 Mo par fichier — images, PDF, documents bureautiques, ZIP
          </p>
          <select className="portal-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select className="portal-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Aucun projet — compte</option>
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
          <textarea
            className="portal-input"
            placeholder="Note facultative"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="portal-button" type="submit" disabled={uploading || selectedFiles.length === 0}>
            {uploading ? 'Envoi...' : 'Déposer'}
          </button>
        </form>
      </div>

      {loading ? (
        <div className="portal-spinner" />
      ) : files.length === 0 ? (
        <div className="client-dashboard-empty">
          <div className="client-dashboard-empty-icon">📁</div>
          <h3>Déposez ici vos logos, textes, photos et briefs</h3>
          <p>L'équipe Venio est notifiée à chaque dépôt.</p>
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
                <span className="portal-badge">{CATEGORY_LABELS[file.category] || file.category}</span>
                <h3 style={{ margin: '8px 0 4px' }}>{file.originalName}</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                  {new Date(file.createdAt).toLocaleDateString('fr-FR')} · {formatSize(file.size)}
                  {file.note && ` · ${file.note}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a className="portal-button" href={clientFileDownloadUrl(file.id)}>
                  Télécharger
                </a>
                <button type="button" className="portal-button secondary" onClick={() => setPendingDeleteId(file.id)}>
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={pendingDeleteId !== null}
        title="Supprimer le fichier"
        message="Voulez-vous vraiment supprimer ce fichier ? Cette action est irréversible."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  )
}

export default ClientMyFiles
