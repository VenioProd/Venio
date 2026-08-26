import React, { useEffect, useState } from 'react'
import type { ProjectDocumentsTabProps } from './types'
import {
  listProjectClientFiles,
  projectClientFileDownloadUrl,
  type AdminProjectClientFile,
} from '../../../services/adminProjectFiles'

const getDocumentTypeLabel = (type: string): string => {
  switch (type) {
    case 'DEVIS':
      return 'Devis'
    case 'FACTURE':
      return 'Facture'
    case 'FICHIER_PROJET':
      return 'Fichier projet'
    default:
      return type
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  LOGO: 'Logo',
  TEXTE: 'Texte',
  PHOTO: 'Photo',
  BRIEF: 'Brief',
  AUTRE: 'Autre',
}

const ProjectDocumentsTab: React.FC<ProjectDocumentsTabProps> = ({
  documents,
  canEditProjects,
  onUpload,
  projectId,
}) => {
  const [clientFiles, setClientFiles] = useState<AdminProjectClientFile[]>([])

  useEffect(() => {
    if (!projectId) return
    listProjectClientFiles(projectId)
      .then((data) => setClientFiles(data.files || []))
      .catch(() => setClientFiles([]))
  }, [projectId])

  return (
    <div style={{ marginTop: 24 }}>
      <div className="admin-form-section">
        <h2>Téléverser un document (ancien système)</h2>
        {canEditProjects ? (
          <form className="portal-list" onSubmit={onUpload}>
            <select className="portal-input" name="type" required>
              <option value="">Type de document</option>
              <option value="DEVIS">Devis</option>
              <option value="FACTURE">Facture</option>
              <option value="FICHIER_PROJET">Fichier projet</option>
            </select>
            <input className="portal-input" type="file" name="file" required style={{ padding: '8px 14px' }} />
            <button className="portal-button" type="submit">
              📎 Téléverser
            </button>
          </form>
        ) : (
          <div className="admin-info">Accès lecture seule aux documents.</div>
        )}
      </div>

      <div className="admin-form-section" style={{ marginTop: 24 }}>
        <h2>Documents</h2>
        <div className="portal-list">
          {documents.length === 0 ? (
            <div className="admin-empty-state" style={{ padding: '24px' }}>
              <p className="admin-empty-state-text">Aucun document</p>
            </div>
          ) : (
            documents.map((doc) => (
              <div key={doc._id} className="admin-document-item">
                <strong>{doc.originalName}</strong>
                <p>
                  <span className="admin-badge" style={{ marginRight: '8px' }}>
                    {getDocumentTypeLabel(doc.type)}
                  </span>
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {clientFiles.length > 0 && (
        <div className="admin-form-section" style={{ marginTop: 24 }}>
          <h2>Fichiers déposés par le client</h2>
          <div className="portal-list">
            {clientFiles.map((file) => (
              <div key={file.id} className="admin-document-item">
                <strong>{file.originalName}</strong>
                <p>
                  <span className="admin-badge" style={{ marginRight: '8px' }}>
                    {CATEGORY_LABELS[file.category] || file.category}
                  </span>
                  {file.client && (file.client.companyName || file.client.name)}
                  {' · '}
                  {new Date(file.createdAt).toLocaleDateString('fr-FR')}
                  {file.note && ` · ${file.note}`}
                </p>
                <a className="portal-button secondary" href={projectClientFileDownloadUrl(projectId, file.id)}>
                  Télécharger
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProjectDocumentsTab
