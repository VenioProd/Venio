import React from 'react'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'
import CustomSelect from '../../../components/admin/CustomSelect'

const ReportsSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting, handleRecipientsChange }) => (
  <section className="crm-settings-section">
    <div className="crm-settings-section-header">
      {AUTOMATION_CATEGORIES.find((c) => c.id === 'reports')?.icon}
      <h2>Rapport hebdomadaire</h2>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Activer le rapport</h3>
        <p>Envoyer un rapport hebdomadaire automatique</p>
      </div>
      <label className="crm-toggle">
        <input
          type="checkbox"
          checked={settings.weeklyReportEnabled}
          onChange={(e) => updateSetting('weeklyReportEnabled', e.target.checked)}
          disabled={!canManage}
        />
        <span className="crm-toggle-slider" />
      </label>
    </div>

    {settings.weeklyReportEnabled && (
      <>
        <div className="crm-settings-item crm-settings-item-sub">
          <div className="crm-settings-item-info">
            <h3>Jour d'envoi</h3>
            <p>Jour de la semaine pour l'envoi du rapport</p>
          </div>
          <CustomSelect
            className="crm-settings-select"
            value={String(settings.weeklyReportDay)}
            onChange={(v) => updateSetting('weeklyReportDay', parseInt(v))}
            options={[
              { value: '0', label: 'Dimanche' },
              { value: '1', label: 'Lundi' },
              { value: '2', label: 'Mardi' },
              { value: '3', label: 'Mercredi' },
              { value: '4', label: 'Jeudi' },
              { value: '5', label: 'Vendredi' },
              { value: '6', label: 'Samedi' },
            ]}
          />
        </div>

        <div className="crm-settings-item crm-settings-item-sub">
          <div className="crm-settings-item-info">
            <h3>Heure d'envoi</h3>
            <p>Heure à laquelle le rapport est envoyé</p>
          </div>
          <input
            type="time"
            className="crm-settings-time-input"
            value={settings.weeklyReportTime}
            onChange={(e) => updateSetting('weeklyReportTime', e.target.value)}
            disabled={!canManage}
          />
        </div>

        <div className="crm-settings-item crm-settings-item-sub crm-settings-item-full">
          <div className="crm-settings-item-info">
            <h3>Destinataires</h3>
            <p>Emails séparés par des virgules</p>
          </div>
          <input
            type="text"
            className="crm-settings-text-input"
            placeholder="email1@example.com, email2@example.com"
            value={(settings.weeklyReportRecipients || []).join(', ')}
            onBlur={(e) => handleRecipientsChange?.(e.target.value)}
            disabled={!canManage}
          />
        </div>
      </>
    )}
  </section>
)

export default ReportsSection
