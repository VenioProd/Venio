import React from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'

const StatusSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting }) => {
  const { t } = useI18n()

  return (
    <section className="crm-settings-section">
      <div className="crm-settings-section-header">
        {AUTOMATION_CATEGORIES.find((c) => c.id === 'status')?.icon}
        <h2>{t('crm.settings.cat.status')}</h2>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.status.lastContact')}</h3>
          <p>{t('crm.settings.status.lastContactDesc')}</p>
        </div>
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.autoLastContactOnContacted}
            onChange={(e) => updateSetting('autoLastContactOnContacted', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.status.postDemo')}</h3>
          <p>{t('crm.settings.status.postDemoDesc')}</p>
        </div>
        <div className="crm-settings-item-controls">
          <label className="crm-toggle">
            <input
              type="checkbox"
              checked={settings.autoNextActionOnDemo}
              onChange={(e) => updateSetting('autoNextActionOnDemo', e.target.checked)}
              disabled={!canManage}
            />
            <span className="crm-toggle-slider" />
          </label>
          {settings.autoNextActionOnDemo && (
            <div className="crm-settings-inline-input">
              <input
                type="number"
                min="1"
                max="30"
                value={settings.demoFollowUpDays}
                onChange={(e) => updateSetting('demoFollowUpDays', parseInt(e.target.value) || 1)}
                disabled={!canManage}
              />
              <span>{t('crm.settings.days')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.status.postProposal')}</h3>
          <p>{t('crm.settings.status.postProposalDesc')}</p>
        </div>
        <div className="crm-settings-item-controls">
          <label className="crm-toggle">
            <input
              type="checkbox"
              checked={settings.autoNextActionOnProposal}
              onChange={(e) => updateSetting('autoNextActionOnProposal', e.target.checked)}
              disabled={!canManage}
            />
            <span className="crm-toggle-slider" />
          </label>
          {settings.autoNextActionOnProposal && (
            <div className="crm-settings-inline-input">
              <input
                type="number"
                min="1"
                max="30"
                value={settings.proposalFollowUpDays}
                onChange={(e) => updateSetting('proposalFollowUpDays', parseInt(e.target.value) || 3)}
                disabled={!canManage}
              />
              <span>{t('crm.settings.days')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.status.clearOnClose')}</h3>
          <p>{t('crm.settings.status.clearOnCloseDesc')}</p>
        </div>
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.clearNextActionOnClose}
            onChange={(e) => updateSetting('clearNextActionOnClose', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
      </div>
    </section>
  )
}

export default StatusSection
