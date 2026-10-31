import React from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'
import CustomSelect from '../../../components/admin/CustomSelect'

const ReportsSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting, handleRecipientsChange }) => {
  const { t } = useI18n()

  return (
    <section className="crm-settings-section">
      <div className="crm-settings-section-header">
        {AUTOMATION_CATEGORIES.find((c) => c.id === 'reports')?.icon}
        <h2>{t('crm.settings.reports.title')}</h2>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.reports.enable')}</h3>
          <p>{t('crm.settings.reports.enableDesc')}</p>
        </div>
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.weeklyReportEnabled}
            onChange={(e) => updateSetting('weeklyReportEnabled', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
      </div>

      {settings.weeklyReportEnabled && (
        <>
          <div className="crm-settings-item crm-settings-item-sub">
            <div className="crm-settings-item-info">
              <h3>{t('crm.settings.reports.day')}</h3>
              <p>{t('crm.settings.reports.dayDesc')}</p>
            </div>
            <CustomSelect
              className="crm-settings-select"
              value={String(settings.weeklyReportDay)}
              onChange={(v) => updateSetting('weeklyReportDay', parseInt(v))}
              options={[
                { value: '0', label: t('crm.settings.reports.sunday') },
                { value: '1', label: t('crm.settings.reports.monday') },
                { value: '2', label: t('crm.settings.reports.tuesday') },
                { value: '3', label: t('crm.settings.reports.wednesday') },
                { value: '4', label: t('crm.settings.reports.thursday') },
                { value: '5', label: t('crm.settings.reports.friday') },
                { value: '6', label: t('crm.settings.reports.saturday') },
              ]}
            />
          </div>

          <div className="crm-settings-item crm-settings-item-sub">
            <div className="crm-settings-item-info">
              <h3>{t('crm.settings.reports.time')}</h3>
              <p>{t('crm.settings.reports.timeDesc')}</p>
            </div>
            <input
              type="time"
              className="crm-settings-time-input"
              value={settings.weeklyReportTime}
              onChange={(e) => updateSetting('weeklyReportTime', e.target.value)}
              disabled={!canManage}
            />
          </div>

          <div className="crm-settings-item crm-settings-item-sub crm-settings-item-full">
            <div className="crm-settings-item-info">
              <h3>{t('crm.settings.reports.recipients')}</h3>
              <p>{t('crm.settings.reports.recipientsDesc')}</p>
            </div>
            <input
              type="text"
              className="crm-settings-text-input"
              placeholder="email1@example.com, email2@example.com"
              value={(settings.weeklyReportRecipients || []).join(', ')}
              onBlur={(e) => handleRecipientsChange?.(e.target.value)}
              disabled={!canManage}
            />
          </div>
        </>
      )}
    </section>
  )
}

export default ReportsSection
