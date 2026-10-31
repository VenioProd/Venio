import React, { useEffect, useState } from 'react'
import type { ProjectDocumentsTabProps } from './types'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import { formatDate } from '../../../i18n/format'
import {
  listProjectClientFiles,
  projectClientFileDownloadUrl,
  type AdminProjectClientFile,
} from '../../../services/adminProjectFiles'

const DOCUMENT_TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  DEVIS: 'projects.documents.docTypeQuote',
  FACTURE: 'projects.documents.docTypeInvoice',
  FICHIER_PROJET: 'projects.documents.docTypeProjectFile',
}

const CATEGORY_LABEL_KEYS: Record<string, MessageKey> = {
  LOGO: 'projects.documents.categoryLogo',
  TEXTE: 'projects.documents.categoryText',
  PHOTO: 'projects.documents.categoryPhoto',
  BRIEF: 'projects.documents.categoryBrief',
  AUTRE: 'projects.documents.categoryOther',
}

const ProjectDocumentsTab: React.FC<ProjectDocumentsTabProps> = ({
  documents,
  canEditProjects,
  onUpload,
  projectId,
}) => {
  const { t } = useI18n()
  const getDocumentTypeLabel = (type: string): string =>
    DOCUMENT_TYPE_LABEL_KEYS[type] ? t(DOCUMENT_TYPE_LABEL_KEYS[type]) : type
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
        <h2>{t('projects.documents.uploadHeading')}</h2>
        {canEditProjects ? (
          <form className="portal-list" onSubmit={onUpload}>
            <select className="portal-input" name="type" required>
              <option value="">{t('projects.documents.typePlaceholder')}</option>
              <option value="DEVIS">{t('projects.documents.docTypeQuote')}</option>
              <option value="FACTURE">{t('projects.documents.docTypeInvoice')}</option>
              <option value="FICHIER_PROJET">{t('projects.documents.docTypeProjectFile')}</option>
            </select>
            <input className="portal-input" type="file" name="file" required style={{ padding: '8px 14px' }} />
            <button className="portal-button" type="submit">
              {t('projects.documents.upload')}
            </button>
          </form>
        ) : (
          <div className="admin-info">{t('projects.documents.readOnly')}</div>
        )}
      </div>

      <div className="admin-form-section" style={{ marginTop: 24 }}>
        <h2>{t('projects.documents.heading')}</h2>
        <div className="portal-list">
          {documents.length === 0 ? (
            <div className="admin-empty-state" style={{ padding: '24px' }}>
              <p className="admin-empty-state-text">{t('projects.documents.empty')}</p>
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
          <h2>{t('projects.documents.clientFiles')}</h2>
          <div className="portal-list">
            {clientFiles.map((file) => (
              <div key={file.id} className="admin-document-item">
                <strong>{file.originalName}</strong>
                <p>
                  <span className="admin-badge" style={{ marginRight: '8px' }}>
                    {CATEGORY_LABEL_KEYS[file.category] ? t(CATEGORY_LABEL_KEYS[file.category]) : file.category}
                  </span>
                  {file.client && (file.client.companyName || file.client.name)}
                  {' · '}
                  {formatDate(file.createdAt)}
                  {file.note && ` · ${file.note}`}
                </p>
                <a className="portal-button secondary" href={projectClientFileDownloadUrl(projectId, file.id)}>
                  {t('projects.documents.download')}
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
