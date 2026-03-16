import React from 'react'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'

const AlertsSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting }) => (
  <section className="crm-settings-section">
    <div className="crm-settings-section-header">
      {AUTOMATION_CATEGORIES.find((c) => c.id === 'alerts')?.icon}
      <h2>Alertes & Rappels</h2>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Alerte leads froids</h3>
        <p>Afficher une alerte pour les leads sans contact depuis X jours</p>
      </div>
      <div className="crm-settings-item-controls">
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.coldLeadAlertEnabled}
            onChange={(e) => updateSetting('coldLeadAlertEnabled', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
        {settings.coldLeadAlertEnabled && (
          <div className="crm-settings-inline-input">
            <input
              type="number"
              min="1"
              max="90"
              value={settings.coldLeadThresholdDays}
              onChange={(e) => updateSetting('coldLeadThresholdDays', parseInt(e.target.value) || 7)}
              disabled={!canManage}
            />
            <span>jour(s)</span>
          </div>
        )}
      </div>
    </div>

    <div className="crm-settings-item crm-settings-item-sub">
      <div className="crm-settings-item-info">
        <h3>Email de rappel (leads froids)</h3>
        <p>Envoyer un email quotidien aux commerciaux pour leurs leads froids</p>
      </div>
      <label className="crm-toggle">
        <input
          type="checkbox"
          checked={settings.coldLeadEmailEnabled}
          onChange={(e) => updateSetting('coldLeadEmailEnabled', e.target.checked)}
          disabled={!canManage || !settings.coldLeadAlertEnabled}
        />
        <span className="crm-toggle-slider" />
      </label>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Alerte actions en retard</h3>
        <p>Afficher une alerte pour les leads avec une action en retard</p>
      </div>
      <label className="crm-toggle">
        <input
          type="checkbox"
          checked={settings.overdueAlertEnabled}
          onChange={(e) => updateSetting('overdueAlertEnabled', e.target.checked)}
          disabled={!canManage}
        />
        <span className="crm-toggle-slider" />
      </label>
    </div>

    <div className="crm-settings-item crm-settings-item-sub">
      <div className="crm-settings-item-info">
        <h3>Email quotidien (retards)</h3>
        <p>Envoyer un email quotidien récapitulant les actions en retard</p>
      </div>
      <div className="crm-settings-item-controls">
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.dailyOverdueEmailEnabled}
            onChange={(e) => updateSetting('dailyOverdueEmailEnabled', e.target.checked)}
            disabled={!canManage || !settings.overdueAlertEnabled}
          />
          <span className="crm-toggle-slider" />
        </label>
        {settings.dailyOverdueEmailEnabled && (
          <div className="crm-settings-inline-input">
            <span>à</span>
            <input
              type="time"
              value={settings.dailyOverdueEmailTime}
              onChange={(e) => updateSetting('dailyOverdueEmailTime', e.target.value)}
              disabled={!canManage}
            />
          </div>
        )}
      </div>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Alerte leads bloqués</h3>
        <p>Afficher une alerte pour les leads sans changement de statut depuis X jours</p>
      </div>
      <div className="crm-settings-item-controls">
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.staleLeadAlertEnabled}
            onChange={(e) => updateSetting('staleLeadAlertEnabled', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
        {settings.staleLeadAlertEnabled && (
          <div className="crm-settings-inline-input">
            <input
              type="number"
              min="1"
              max="90"
              value={settings.staleLeadThresholdDays}
              onChange={(e) => updateSetting('staleLeadThresholdDays', parseInt(e.target.value) || 14)}
              disabled={!canManage}
            />
            <span>jour(s)</span>
          </div>
        )}
      </div>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Rappel proposition</h3>
        <p>Envoyer un rappel pour les leads en PROPOSITION depuis X jours</p>
      </div>
      <div className="crm-settings-item-controls">
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.proposalReminderEnabled}
            onChange={(e) => updateSetting('proposalReminderEnabled', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
        {settings.proposalReminderEnabled && (
          <div className="crm-settings-inline-input">
            <input
              type="number"
              min="1"
              max="30"
              value={settings.proposalReminderDays}
              onChange={(e) => updateSetting('proposalReminderDays', parseInt(e.target.value) || 7)}
              disabled={!canManage}
            />
            <span>jour(s)</span>
          </div>
        )}
      </div>
    </div>
  </section>
)

export default AlertsSection
