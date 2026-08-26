import React from 'react'
import { Link } from 'react-router-dom'
import type { FilesTabProps } from './types'
import { adminClientFileDownloadUrl } from '../../../services/adminClients'

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

const FilesTab: React.FC<FilesTabProps> = ({ files, clientId }) => (
  <div className="portal-list">
    {files.length === 0 ? (
      <div className="admin-empty-state" style={{ padding: '24px' }}>
        <p className="admin-empty-state-text">Aucun fichier reçu pour le moment.</p>
      </div>
    ) : (
      <div className="admin-list">
        {files.map((file) => (
          <div key={file.id} className="admin-list-item">
            <div className="admin-list-item-content">
              <h3 className="admin-list-item-title">
                {file.originalName}
                <span className="portal-badge" style={{ marginLeft: 8 }}>
                  {CATEGORY_LABELS[file.category] || file.category}
                </span>
              </h3>
              <p className="admin-list-item-subtitle">
                {new Date(file.createdAt).toLocaleString('fr-FR')}
                {file.project && (
                  <>
                    {' · '}
                    <Link to={`/admin/projets/${file.project.id}`}>{file.project.name}</Link>
                  </>
                )}
                {' · '}
                {formatSize(file.size)}
                {file.note && ` · ${file.note}`}
                {' · '}
                {file.downloadedByAdminAt
                  ? `téléchargé le ${new Date(file.downloadedByAdminAt).toLocaleDateString('fr-FR')}`
                  : 'non consulté'}
              </p>
            </div>
            <div className="admin-list-item-actions">
              <a className="portal-button secondary" href={adminClientFileDownloadUrl(clientId, file.id)}>
                Télécharger
              </a>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)

export default FilesTab
