import React from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'

const QualificationSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting }) => {
  const { t } = useI18n()

  return (
    <section className="crm-settings-section">
      <div className="crm-settings-section-header">
        {AUTOMATION_CATEGORIES.find((c) => c.id === 'qualification')?.icon}
        <h2>{t('crm.settings.cat.qualification')}</h2>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.qualification.auto')}</h3>
          <p>{t('crm.settings.qualification.autoDesc')}</p>
        </div>
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.autoQualifyEnabled}
            onChange={(e) => updateSetting('autoQualifyEnabled', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
      </div>
    </section>
  )
}

export default QualificationSection
