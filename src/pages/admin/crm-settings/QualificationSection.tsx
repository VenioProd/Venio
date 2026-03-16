import React from 'react'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'

const QualificationSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting }) => (
  <section className="crm-settings-section">
    <div className="crm-settings-section-header">
      {AUTOMATION_CATEGORIES.find((c) => c.id === 'qualification')?.icon}
      <h2>Qualification</h2>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Auto-qualification</h3>
        <p>Qualifier automatiquement les leads avec budget et source renseignés</p>
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

export default QualificationSection
