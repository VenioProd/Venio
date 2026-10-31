import React from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'

const AssignmentSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting }) => {
  const { t } = useI18n()

  return (
    <section className="crm-settings-section">
      <div className="crm-settings-section-header">
        {AUTOMATION_CATEGORIES.find((c) => c.id === 'assignment')?.icon}
        <h2>{t('crm.settings.cat.assignment')}</h2>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.assignment.roundRobin')}</h3>
          <p>{t('crm.settings.assignment.roundRobinDesc')}</p>
        </div>
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.roundRobinEnabled}
            onChange={(e) => updateSetting('roundRobinEnabled', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
      </div>
    </section>
  )
}

export default AssignmentSection
