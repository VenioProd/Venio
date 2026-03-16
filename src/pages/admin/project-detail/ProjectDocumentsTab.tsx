import React from 'react'
import type { ProjectDocumentsTabProps } from './types'

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

const ProjectDocumentsTab: React.FC<ProjectDocumentsTabProps> = ({
  documents,
  canEditProjects,
  onUpload,
}) => {
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
                <input
                  className="portal-input"
                  type="file"
                  name="file"
                  required
                  style={{ padding: '8px 14px' }}
                />
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
        </div>
  )
}

export default ProjectDocumentsTab
