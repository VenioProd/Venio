import React from 'react'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'

const StatusSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting }) => (
  <section className="crm-settings-section">
    <div className="crm-settings-section-header">
      {AUTOMATION_CATEGORIES.find((c) => c.id === 'status')?.icon}
      <h2>Changements de statut</h2>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Mise à jour date de contact</h3>
        <p>Mettre à jour "Dernier contact" lors du passage en CONTACTÉ</p>
      </div>
      <label className="crm-toggle">
        <input
          type="checkbox"
          checked={settings.autoLastContactOnContacted}
          onChange={(e) => updateSetting('autoLastContactOnContacted', e.target.checked)}
          disabled={!canManage}
        />
        <span className="crm-toggle-slider" />
      </label>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Rappel post-démo</h3>
        <p>Créer automatiquement une action de suivi après une démo</p>
      </div>
      <div className="crm-settings-item-controls">
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.autoNextActionOnDemo}
            onChange={(e) => updateSetting('autoNextActionOnDemo', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
        {settings.autoNextActionOnDemo && (
          <div className="crm-settings-inline-input">
            <input
              type="number"
              min="1"
              max="30"
              value={settings.demoFollowUpDays}
              onChange={(e) => updateSetting('demoFollowUpDays', parseInt(e.target.value) || 1)}
              disabled={!canManage}
            />
            <span>jour(s)</span>
          </div>
        )}
      </div>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Rappel post-proposition</h3>
        <p>Créer automatiquement une action de suivi après envoi d'une proposition</p>
      </div>
      <div className="crm-settings-item-controls">
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.autoNextActionOnProposal}
            onChange={(e) => updateSetting('autoNextActionOnProposal', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
        {settings.autoNextActionOnProposal && (
          <div className="crm-settings-inline-input">
            <input
              type="number"
              min="1"
              max="30"
              value={settings.proposalFollowUpDays}
              onChange={(e) => updateSetting('proposalFollowUpDays', parseInt(e.target.value) || 3)}
              disabled={!canManage}
            />
            <span>jour(s)</span>
          </div>
        )}
      </div>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Effacer action à la clôture</h3>
        <p>Effacer la prochaine action lors du passage en WON/LOST</p>
      </div>
      <label className="crm-toggle">
        <input
          type="checkbox"
          checked={settings.clearNextActionOnClose}
          onChange={(e) => updateSetting('clearNextActionOnClose', e.target.checked)}
          disabled={!canManage}
        />
        <span className="crm-toggle-slider" />
      </label>
    </div>
  </section>
)

export default StatusSection
