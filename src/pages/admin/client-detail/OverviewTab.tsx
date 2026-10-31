import React from 'react'
import type { OverviewTabProps } from './types'
import { STATUS_OPTIONS, HEALTH_OPTIONS, STATUS_LABEL_KEYS, HEALTH_LABEL_KEYS } from './types'
import { useI18n } from '../../../context/I18nContext'
import { CRM_SERVICE_TYPES } from '../../../lib/formatUtils'
import CustomSelect from '../../../components/admin/CustomSelect'

const OverviewTab: React.FC<OverviewTabProps> = ({
  client,
  setClient,
  progress,
  projects,
  deliverables,
  billingSummary,
  saveClientPatch,
}) => {
  const { t } = useI18n()
  return (
    <div className="portal-list">
      <div className="portal-grid">
        <div className="admin-stat-card">
          <p className="admin-stat-label">{t('adminAccess.clientDetail.statProgress')}</p>
          <p className="admin-stat-value">{progress?.progressPercent ?? 0}%</p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">{t('adminAccess.clientDetail.statActiveProjects')}</p>
          <p className="admin-stat-value">{projects.filter((project) => !project.isArchived).length}</p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">{t('adminAccess.clientDetail.statDeliverables')}</p>
          <p className="admin-stat-value">{deliverables.length}</p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">{t('adminAccess.clientDetail.statUnpaid')}</p>
          <p className="admin-stat-value">{billingSummary?.unpaidCount ?? 0}</p>
        </div>
      </div>

      <div className="portal-grid">
        <div>
          <label style={{ display: 'block', marginBottom: 8, opacity: 0.7 }}>
            {t('adminAccess.clientDetail.company')}
          </label>
          <input
            className="portal-input"
            value={client?.companyName || ''}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setClient((current) => (current ? { ...current, companyName: event.target.value } : current))
            }
            onBlur={(event: React.FocusEvent<HTMLInputElement>) => saveClientPatch({ companyName: event.target.value })}
            placeholder={t('adminAccess.clientDetail.companyPlaceholder')}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 8, opacity: 0.7 }}>
            {t('adminAccess.clientDetail.serviceLabel')}
          </label>
          <CustomSelect
            className="portal-input"
            value={client?.serviceType || ''}
            onChange={(v) => {
              setClient((current) => (current ? { ...current, serviceType: v } : current))
              saveClientPatch({ serviceType: v })
            }}
            options={[{ value: '', label: '—' }, ...CRM_SERVICE_TYPES.map((s) => ({ value: s, label: s }))]}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 8, opacity: 0.7 }}>
            {t('adminAccess.clientDetail.clientStatus')}
          </label>
          <CustomSelect
            className="portal-input"
            value={client?.status || 'ACTIF'}
            onChange={(v) => saveClientPatch({ status: v })}
            options={STATUS_OPTIONS.map((s) => ({
              value: s,
              label: STATUS_LABEL_KEYS[s] ? t(STATUS_LABEL_KEYS[s]) : s,
            }))}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 8, opacity: 0.7 }}>
            {t('adminAccess.clientDetail.health')}
          </label>
          <CustomSelect
            className="portal-input"
            value={client?.healthStatus || 'BON'}
            onChange={(v) => saveClientPatch({ healthStatus: v })}
            options={HEALTH_OPTIONS.map((h) => ({
              value: h,
              label: HEALTH_LABEL_KEYS[h] ? t(HEALTH_LABEL_KEYS[h]) : h,
            }))}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 8, opacity: 0.7 }}>
            {t('adminAccess.clientDetail.phone')}
          </label>
          <input
            className="portal-input"
            value={client?.phone || ''}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setClient((current) => (current ? { ...current, phone: event.target.value } : current))
            }
            onBlur={(event: React.FocusEvent<HTMLInputElement>) => saveClientPatch({ phone: event.target.value })}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 8, opacity: 0.7 }}>
            {t('adminAccess.clientDetail.website')}
          </label>
          <input
            className="portal-input"
            value={client?.website || ''}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setClient((current) => (current ? { ...current, website: event.target.value } : current))
            }
            onBlur={(event: React.FocusEvent<HTMLInputElement>) => saveClientPatch({ website: event.target.value })}
          />
        </div>
      </div>
    </div>
  )
}

export default OverviewTab
