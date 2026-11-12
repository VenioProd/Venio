import React from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'
import CustomSelect from '../../../components/admin/CustomSelect'

const AssignmentSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting, admins = [] }) => {
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

      <div className="crm-settings-item crm-settings-item-full">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.assignment.defaultCloser')}</h3>
          <p>{t('crm.settings.assignment.defaultCloserDesc')}</p>
        </div>
        <CustomSelect
          className="crm-settings-select"
          value={settings.defaultCloserId || ''}
          onChange={(v) => updateSetting('defaultCloserId', v || null)}
          options={[
            { value: '', label: t('crm.settings.assignment.defaultCloserFallback') },
            ...admins.map((a) => ({ value: a._id, label: `${a.name} (${a.email})` })),
          ]}
        />
      </div>
    </section>
  )
}

export default AssignmentSection
