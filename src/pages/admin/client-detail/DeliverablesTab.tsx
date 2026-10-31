import React from 'react'
import type { DeliverablesTabProps } from './types'
import { useI18n } from '../../../context/I18nContext'

const DeliverablesTab: React.FC<DeliverablesTabProps> = ({ deliverables }) => {
  const { t } = useI18n()
  return (
    <div className="admin-list">
      {deliverables.length === 0 ? (
        <div className="admin-empty-state">
          <div className="admin-empty-state-icon">📦</div>
          <p className="admin-empty-state-text">{t('adminAccess.clientDetail.noDeliverable')}</p>
        </div>
      ) : (
        deliverables.map((deliverable) => (
          <div key={deliverable._id} className="admin-list-item">
            <div className="admin-list-item-content">
              <h3 className="admin-list-item-title">{deliverable.title}</h3>
              <p className="admin-list-item-subtitle">
                {deliverable.projectName} • {deliverable.itemType}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <span className="portal-badge">
                  {deliverable.visibleToClient
                    ? t('adminAccess.clientDetail.visibleToClient')
                    : t('adminAccess.clientDetail.adminOnly')}
                </span>
                <span className="portal-badge">
                  {deliverable.isDownloadable
                    ? t('adminAccess.clientDetail.downloadable')
                    : t('adminAccess.clientDetail.readOnly')}
                </span>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export default DeliverablesTab
