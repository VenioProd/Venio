import React from 'react'
import type { CloudTabProps } from './types'
import { FOLDER_ICONS } from './types'
import { useI18n } from '../../../context/I18nContext'

const CloudTab: React.FC<CloudTabProps> = ({ cloudInfo }) => {
  const { t } = useI18n()
  return (
    <div className="portal-list">
      {!cloudInfo || !cloudInfo.enabled ? (
        <div className="admin-empty-state">
          <div className="admin-empty-state-icon">☁️</div>
          <p className="admin-empty-state-text">{t('adminAccess.clientDetail.cloudNotConfigured')}</p>
          <p style={{ opacity: 0.5, fontSize: 13 }}>{t('adminAccess.clientDetail.cloudConfigHint')}</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{ margin: 0, opacity: 0.7, fontSize: 14 }}>
              {t('adminAccess.clientDetail.cloudFolderLabel')} <strong>{cloudInfo.clientFolder}</strong>
            </p>
            <a
              href={cloudInfo.webUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="portal-button secondary"
              style={{ fontSize: 13, textDecoration: 'none' }}
            >
              {t('adminAccess.clientDetail.cloudOpenRoot')}
            </a>
          </div>
          <div className="cloud-folders-grid">
            {(cloudInfo.folders || []).map((folder) => (
              <a
                key={folder.name}
                href={folder.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cloud-folder-card"
              >
                <span className="cloud-folder-icon">{FOLDER_ICONS[folder.name] || '📁'}</span>
                <span className="cloud-folder-name">{folder.name}</span>
                <span className="cloud-folder-open">
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default CloudTab
