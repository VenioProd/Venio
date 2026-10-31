import React from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'
import CustomSelect from '../../../components/admin/CustomSelect'

const EscalationSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting, admins = [] }) => {
  const { t } = useI18n()

  return (
    <section className="crm-settings-section">
      <div className="crm-settings-section-header">
        {AUTOMATION_CATEGORIES.find((c) => c.id === 'escalation')?.icon}
        <h2>{t('crm.settings.cat.escalation')}</h2>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.escalation.inactivity')}</h3>
          <p>{t('crm.settings.escalation.inactivityDesc')}</p>
        </div>
        <div className="crm-settings-item-controls">
          <label className="crm-toggle">
            <input
              type="checkbox"
              checked={settings.escalationEnabled}
              onChange={(e) => updateSetting('escalationEnabled', e.target.checked)}
              disabled={!canManage}
            />
            <span className="crm-toggle-slider" />
          </label>
          {settings.escalationEnabled && (
            <div className="crm-settings-inline-input">
              <input
                type="number"
                min="1"
                max="90"
                value={settings.escalationThresholdDays}
                onChange={(e) => updateSetting('escalationThresholdDays', parseInt(e.target.value) || 10)}
                disabled={!canManage}
              />
              <span>{t('crm.settings.days')}</span>
            </div>
          )}
        </div>
      </div>

      {settings.escalationEnabled && (
        <>
          <div className="crm-settings-item crm-settings-item-sub">
            <div className="crm-settings-item-info">
              <h3>{t('crm.settings.escalation.action')}</h3>
              <p>{t('crm.settings.escalation.actionDesc')}</p>
            </div>
            <CustomSelect
              className="crm-settings-select"
              value={settings.escalationAction}
              onChange={(v) => updateSetting('escalationAction', v)}
              options={[
                { value: 'NOTIFY_MANAGER', label: t('crm.settings.escalation.notify') },
                { value: 'REASSIGN', label: t('crm.settings.escalation.reassign') },
                { value: 'BOTH', label: t('crm.settings.escalation.both') },
              ]}
            />
          </div>

          {(settings.escalationAction === 'NOTIFY_MANAGER' || settings.escalationAction === 'BOTH') && (
            <div className="crm-settings-item crm-settings-item-sub">
              <div className="crm-settings-item-info">
                <h3>{t('crm.settings.escalation.manager')}</h3>
                <p>{t('crm.settings.escalation.managerDesc')}</p>
              </div>
              <CustomSelect
                className="crm-settings-select"
                value={settings.escalationManagerId || ''}
                onChange={(v) => updateSetting('escalationManagerId', v || null)}
                options={[
                  { value: '', label: t('crm.settings.escalation.select') },
                  ...admins.map((a) => ({ value: a._id, label: `${a.name} (${a.email})` })),
                ]}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default EscalationSection
