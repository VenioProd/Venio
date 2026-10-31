import React from 'react'
import type { BillingTabProps } from './types'
import { useI18n } from '../../../context/I18nContext'

const BillingTab: React.FC<BillingTabProps> = ({ billingSummary, billingDocuments }) => {
  const { t } = useI18n()
  return (
    <div className="portal-list">
      <div className="portal-grid">
        <div className="admin-stat-card">
          <p className="admin-stat-label">{t('adminAccess.clientDetail.billingInvoiced')}</p>
          <p className="admin-stat-value">
            {Math.round(billingSummary?.amountInvoiced || 0)} {billingSummary?.currency || 'EUR'}
          </p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">{t('adminAccess.clientDetail.billingPaid')}</p>
          <p className="admin-stat-value">
            {Math.round(billingSummary?.amountPaid || 0)} {billingSummary?.currency || 'EUR'}
          </p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">{t('adminAccess.clientDetail.billingUnpaid')}</p>
          <p className="admin-stat-value">
            {Math.round(billingSummary?.amountUnpaid || 0)} {billingSummary?.currency || 'EUR'}
          </p>
        </div>
      </div>

      <div className="admin-list">
        {billingDocuments.map((document) => (
          <div key={document._id} className="admin-list-item">
            <div className="admin-list-item-content">
              <h3 className="admin-list-item-title">
                {document.number} ({document.type})
              </h3>
              <p className="admin-list-item-subtitle">
                {document.project?.name || t('adminAccess.clientDetail.projectFallback')} • {document.status} •{' '}
                {Math.round(document.total || 0)} {document.currency || 'EUR'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default BillingTab
