import React from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'

const AlertsSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting }) => {
  const { t } = useI18n()

  return (
    <section className="crm-settings-section">
      <div className="crm-settings-section-header">
        {AUTOMATION_CATEGORIES.find((c) => c.id === 'alerts')?.icon}
        <h2>{t('crm.settings.cat.alerts')}</h2>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.alerts.cold')}</h3>
          <p>{t('crm.settings.alerts.coldDesc')}</p>
        </div>
        <div className="crm-settings-item-controls">
          <label className="crm-toggle">
            <input
              type="checkbox"
              checked={settings.coldLeadAlertEnabled}
              onChange={(e) => updateSetting('coldLeadAlertEnabled', e.target.checked)}
              disabled={!canManage}
            />
            <span className="crm-toggle-slider" />
          </label>
          {settings.coldLeadAlertEnabled && (
            <div className="crm-settings-inline-input">
              <input
                type="number"
                min="1"
                max="90"
                value={settings.coldLeadThresholdDays}
                onChange={(e) => updateSetting('coldLeadThresholdDays', parseInt(e.target.value) || 7)}
                disabled={!canManage}
              />
              <span>{t('crm.settings.days')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="crm-settings-item crm-settings-item-sub">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.alerts.coldEmail')}</h3>
          <p>{t('crm.settings.alerts.coldEmailDesc')}</p>
        </div>
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.coldLeadEmailEnabled}
            onChange={(e) => updateSetting('coldLeadEmailEnabled', e.target.checked)}
            disabled={!canManage || !settings.coldLeadAlertEnabled}
          />
          <span className="crm-toggle-slider" />
        </label>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.alerts.overdue')}</h3>
          <p>{t('crm.settings.alerts.overdueDesc')}</p>
        </div>
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.overdueAlertEnabled}
            onChange={(e) => updateSetting('overdueAlertEnabled', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
      </div>

      <div className="crm-settings-item crm-settings-item-sub">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.alerts.overdueEmail')}</h3>
          <p>{t('crm.settings.alerts.overdueEmailDesc')}</p>
        </div>
        <div className="crm-settings-item-controls">
          <label className="crm-toggle">
            <input
              type="checkbox"
              checked={settings.dailyOverdueEmailEnabled}
              onChange={(e) => updateSetting('dailyOverdueEmailEnabled', e.target.checked)}
              disabled={!canManage || !settings.overdueAlertEnabled}
            />
            <span className="crm-toggle-slider" />
          </label>
          {settings.dailyOverdueEmailEnabled && (
            <div className="crm-settings-inline-input">
              <span>{t('crm.settings.alerts.at')}</span>
              <input
                type="time"
                value={settings.dailyOverdueEmailTime}
                onChange={(e) => updateSetting('dailyOverdueEmailTime', e.target.value)}
                disabled={!canManage}
              />
            </div>
          )}
        </div>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.alerts.stale')}</h3>
          <p>{t('crm.settings.alerts.staleDesc')}</p>
        </div>
        <div className="crm-settings-item-controls">
          <label className="crm-toggle">
            <input
              type="checkbox"
              checked={settings.staleLeadAlertEnabled}
              onChange={(e) => updateSetting('staleLeadAlertEnabled', e.target.checked)}
              disabled={!canManage}
            />
            <span className="crm-toggle-slider" />
          </label>
          {settings.staleLeadAlertEnabled && (
            <div className="crm-settings-inline-input">
              <input
                type="number"
                min="1"
                max="90"
                value={settings.staleLeadThresholdDays}
                onChange={(e) => updateSetting('staleLeadThresholdDays', parseInt(e.target.value) || 14)}
                disabled={!canManage}
              />
              <span>{t('crm.settings.days')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.alerts.proposal')}</h3>
          <p>{t('crm.settings.alerts.proposalDesc')}</p>
        </div>
        <div className="crm-settings-item-controls">
          <label className="crm-toggle">
            <input
              type="checkbox"
              checked={settings.proposalReminderEnabled}
              onChange={(e) => updateSetting('proposalReminderEnabled', e.target.checked)}
              disabled={!canManage}
            />
            <span className="crm-toggle-slider" />
          </label>
          {settings.proposalReminderEnabled && (
            <div className="crm-settings-inline-input">
              <input
                type="number"
                min="1"
                max="30"
                value={settings.proposalReminderDays}
                onChange={(e) => updateSetting('proposalReminderDays', parseInt(e.target.value) || 7)}
                disabled={!canManage}
              />
              <span>{t('crm.settings.days')}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default AlertsSection
