import React from 'react'
import { Link } from 'react-router-dom'
import type { FilesTabProps } from './types'
import { adminClientFileDownloadUrl } from '../../../services/adminClients'
import { useI18n } from '../../../context/I18nContext'
import { translate, type MessageKey } from '../../../i18n'
import { formatDate, formatDateTime } from '../../../i18n/format'

const CATEGORY_LABEL_KEYS: Record<string, MessageKey> = {
  LOGO: 'adminAccess.clientDetail.categoryLogo',
  TEXTE: 'adminAccess.clientDetail.categoryText',
  PHOTO: 'adminAccess.clientDetail.categoryPhoto',
  BRIEF: 'adminAccess.clientDetail.categoryBrief',
  AUTRE: 'adminAccess.clientDetail.categoryOther',
}

function formatSize(size: number): string {
  if (size < 1024) return translate('adminAccess.clientDetail.sizeBytes', { value: size })
  if (size < 1024 * 1024) return translate('adminAccess.clientDetail.sizeKb', { value: (size / 1024).toFixed(1) })
  return translate('adminAccess.clientDetail.sizeMb', { value: (size / (1024 * 1024)).toFixed(1) })
}

const FilesTab: React.FC<FilesTabProps> = ({ files, clientId }) => {
  const { t } = useI18n()
  return (
    <div className="portal-list">
      {files.length === 0 ? (
        <div className="admin-empty-state" style={{ padding: '24px' }}>
          <p className="admin-empty-state-text">{t('adminAccess.clientDetail.noFile')}</p>
        </div>
      ) : (
        <div className="admin-list">
          {files.map((file) => (
            <div key={file.id} className="admin-list-item">
              <div className="admin-list-item-content">
                <h3 className="admin-list-item-title">
                  {file.originalName}
                  <span className="portal-badge" style={{ marginLeft: 8 }}>
                    {CATEGORY_LABEL_KEYS[file.category] ? t(CATEGORY_LABEL_KEYS[file.category]) : file.category}
                  </span>
                </h3>
                <p className="admin-list-item-subtitle">
                  {formatDateTime(file.createdAt, {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric',
                    second: 'numeric',
                  })}
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
                    ? t('adminAccess.clientDetail.downloadedOn', { date: formatDate(file.downloadedByAdminAt) })
                    : t('adminAccess.clientDetail.notViewed')}
                </p>
              </div>
              <div className="admin-list-item-actions">
                <a className="portal-button secondary" href={adminClientFileDownloadUrl(clientId, file.id)}>
                  {t('adminAccess.clientDetail.download')}
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default FilesTab
