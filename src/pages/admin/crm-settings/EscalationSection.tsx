import React from 'react'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'
import CustomSelect from '../../../components/admin/CustomSelect'

const EscalationSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting, admins = [] }) => (
  <section className="crm-settings-section">
    <div className="crm-settings-section-header">
      {AUTOMATION_CATEGORIES.find((c) => c.id === 'escalation')?.icon}
      <h2>Escalade</h2>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Escalade sur inactivité</h3>
        <p>Escalader automatiquement les leads sans activité depuis X jours</p>
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
            <span>jour(s)</span>
          </div>
        )}
      </div>
    </div>

    {settings.escalationEnabled && (
      <>
        <div className="crm-settings-item crm-settings-item-sub">
          <div className="crm-settings-item-info">
            <h3>Action d'escalade</h3>
            <p>Que faire lors de l'escalade</p>
          </div>
          <CustomSelect
            className="crm-settings-select"
            value={settings.escalationAction}
            onChange={(v) => updateSetting('escalationAction', v)}
            options={[
              { value: 'NOTIFY_MANAGER', label: 'Notifier le manager' },
              { value: 'REASSIGN', label: 'Réassigner à un autre commercial' },
              { value: 'BOTH', label: 'Les deux' },
            ]}
          />
        </div>

        {(settings.escalationAction === 'NOTIFY_MANAGER' || settings.escalationAction === 'BOTH') && (
          <div className="crm-settings-item crm-settings-item-sub">
            <div className="crm-settings-item-info">
              <h3>Manager à notifier</h3>
              <p>Sélectionner le manager qui recevra les notifications</p>
            </div>
            <CustomSelect
              className="crm-settings-select"
              value={settings.escalationManagerId || ''}
              onChange={(v) => updateSetting('escalationManagerId', v || null)}
              options={[{ value: '', label: '-- Sélectionner --' }, ...admins.map((a) => ({ value: a._id, label: `${a.name} (${a.email})` }))]}
            />
          </div>
        )}
      </>
    )}
  </section>
)

export default EscalationSection
