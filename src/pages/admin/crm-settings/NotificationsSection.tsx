import React from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'

const NotificationsSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting }) => {
  const { t } = useI18n()

  return (
    <section className="crm-settings-section">
      <div className="crm-settings-section-header">
        {AUTOMATION_CATEGORIES.find((c) => c.id === 'notifications')?.icon}
        <h2>{t('crm.settings.cat.notifications')}</h2>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.notifications.emailOnAssign')}</h3>
          <p>{t('crm.settings.notifications.emailOnAssignDesc')}</p>
        </div>
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.emailOnAssignment}
            onChange={(e) => updateSetting('emailOnAssignment', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.notifications.logging')}</h3>
          <p>{t('crm.settings.notifications.loggingDesc')}</p>
        </div>
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.activityLogging}
            onChange={(e) => updateSetting('activityLogging', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
      </div>
    </section>
  )
}

export default NotificationsSection
