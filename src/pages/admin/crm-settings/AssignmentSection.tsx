import React from 'react'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'

const AssignmentSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting }) => (
  <section className="crm-settings-section">
    <div className="crm-settings-section-header">
      {AUTOMATION_CATEGORIES.find((c) => c.id === 'assignment')?.icon}
      <h2>Attribution automatique</h2>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Round-robin</h3>
        <p>Attribuer automatiquement les nouveaux leads aux commerciaux à tour de rôle</p>
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

export default AssignmentSection
