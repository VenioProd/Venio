import React from 'react'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'

const NotificationsSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting }) => (
  <section className="crm-settings-section">
    <div className="crm-settings-section-header">
      {AUTOMATION_CATEGORIES.find((c) => c.id === 'notifications')?.icon}
      <h2>Notifications</h2>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Email à l'assignation</h3>
        <p>Envoyer un email au commercial lors de l'attribution d'un lead</p>
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
        <h3>Journalisation des activités</h3>
        <p>Enregistrer un historique de toutes les actions sur les leads</p>
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

export default NotificationsSection
