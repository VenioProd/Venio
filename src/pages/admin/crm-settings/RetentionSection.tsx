import React, { useState } from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { SectionProps } from './types'

/** Bornes du serveur (lib/crmRetention.ts). */
const MIN_MONTHS = 6
const MAX_MONTHS = 120
const DEFAULT_MONTHS = 36

/**
 * Conservation des données personnelles (RGPD) : durée au-delà de laquelle un
 * lead non gagné et inactif est anonymisé, et activation de la purge
 * automatique (désactivée par défaut : la tâche quotidienne ne fait que compter).
 */
const RetentionSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting }) => {
  const { t } = useI18n()
  const saved = Number(settings.retentionMonths) || DEFAULT_MONTHS
  // Saisie en cours ; `null` : on affiche la valeur enregistrée.
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    const months = Math.round(Number(draft))
    setDraft(null)
    if (draft === null || !Number.isFinite(months) || months < MIN_MONTHS || months > MAX_MONTHS) return
    if (months !== saved) void updateSetting('retentionMonths', months)
  }

  return (
    <section className="crm-settings-section" aria-labelledby="crm-settings-retention">
      <div className="crm-settings-section-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h2 id="crm-settings-retention">{t('crmPrivacy.settings.title')}</h2>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crmPrivacy.settings.retention')}</h3>
          <p>{t('crmPrivacy.settings.retentionDesc')}</p>
        </div>
        <div className="crm-settings-inline-input">
          <input
            type="number"
            min={MIN_MONTHS}
            max={MAX_MONTHS}
            aria-label={t('crmPrivacy.settings.retention')}
            value={draft ?? String(saved)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            disabled={!canManage}
          />
          <span>{t('crmPrivacy.settings.months')}</span>
        </div>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crmPrivacy.settings.purge')}</h3>
          <p>{t('crmPrivacy.settings.purgeDesc')}</p>
        </div>
        <label className="crm-toggle">
          <input
            type="checkbox"
            aria-label={t('crmPrivacy.settings.purge')}
            checked={settings.retentionPurgeEnabled === true}
            onChange={(e) => updateSetting('retentionPurgeEnabled', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
      </div>
    </section>
  )
}

export default RetentionSection
