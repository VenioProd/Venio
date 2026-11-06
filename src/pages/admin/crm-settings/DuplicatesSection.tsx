import React from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'

const DuplicatesSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting }) => {
  const { t } = useI18n()

  return (
    <section className="crm-settings-section">
      <div className="crm-settings-section-header">
        {AUTOMATION_CATEGORIES.find((c) => c.id === 'duplicates')?.icon}
        <h2>{t('crm.settings.duplicates.title')}</h2>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.duplicates.enable')}</h3>
          <p>{t('crm.settings.duplicates.enableDesc')}</p>
        </div>
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.duplicateDetectionEnabled}
            onChange={(e) => updateSetting('duplicateDetectionEnabled', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
      </div>

      {settings.duplicateDetectionEnabled && (
        <>
          <div className="crm-settings-item crm-settings-item-sub">
            <div className="crm-settings-item-info">
              <h3>{t('crm.settings.duplicates.email')}</h3>
              <p>{t('crm.settings.duplicates.emailDesc')}</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={settings.duplicateCheckEmail}
                onChange={(e) => updateSetting('duplicateCheckEmail', e.target.checked)}
                disabled={!canManage}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>

          <div className="crm-settings-item crm-settings-item-sub">
            <div className="crm-settings-item-info">
              <h3>{t('crm.settings.duplicates.company')}</h3>
              <p>{t('crm.settings.duplicates.companyDesc')}</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={settings.duplicateCheckCompany}
                onChange={(e) => updateSetting('duplicateCheckCompany', e.target.checked)}
                disabled={!canManage}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>

          <div className="crm-settings-item crm-settings-item-sub">
            <div className="crm-settings-item-info">
              <h3>{t('crm.settings.duplicates.phone')}</h3>
              <p>{t('crm.settings.duplicates.phoneDesc')}</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={settings.duplicateCheckPhone}
                onChange={(e) => updateSetting('duplicateCheckPhone', e.target.checked)}
                disabled={!canManage}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>

          <div className="crm-settings-item crm-settings-item-sub">
            <div className="crm-settings-item-info">
              <h3>{t('crm.settings.duplicates.block')}</h3>
              <p>{t('crm.settings.duplicates.blockDesc')}</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={Boolean(settings.duplicateBlockOnCreate)}
                onChange={(e) => updateSetting('duplicateBlockOnCreate', e.target.checked)}
                disabled={!canManage}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>
        </>
      )}
    </section>
  )
}

export default DuplicatesSection
