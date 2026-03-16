import React from 'react'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'

const DuplicatesSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting }) => (
  <section className="crm-settings-section">
    <div className="crm-settings-section-header">
      {AUTOMATION_CATEGORIES.find((c) => c.id === 'duplicates')?.icon}
      <h2>Détection de doublons</h2>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Activer la détection</h3>
        <p>Vérifier les doublons potentiels lors de la création d'un lead</p>
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
            <h3>Vérifier l'email</h3>
            <p>Détecter les leads avec le même email de contact</p>
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
            <h3>Vérifier l'entreprise</h3>
            <p>Détecter les leads avec le même nom d'entreprise</p>
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
            <h3>Vérifier le téléphone</h3>
            <p>Détecter les leads avec le même numéro de téléphone</p>
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
      </>
    )}
  </section>
)

export default DuplicatesSection
