import React from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'

const ScoringSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting, updateNestedSetting }) => {
  const { t } = useI18n()

  return (
    <section className="crm-settings-section">
      <div className="crm-settings-section-header">
        {AUTOMATION_CATEGORIES.find((c) => c.id === 'scoring')?.icon}
        <h2>{t('crm.settings.scoring.title')}</h2>
      </div>

      <div className="crm-settings-item">
        <div className="crm-settings-item-info">
          <h3>{t('crm.settings.scoring.enable')}</h3>
          <p>{t('crm.settings.scoring.enableDesc')}</p>
        </div>
        <label className="crm-toggle">
          <input
            type="checkbox"
            checked={settings.scoringEnabled}
            onChange={(e) => updateSetting('scoringEnabled', e.target.checked)}
            disabled={!canManage}
          />
          <span className="crm-toggle-slider" />
        </label>
      </div>

      {settings.scoringEnabled && (
        <div className="crm-settings-scoring-weights">
          <h4>{t('crm.settings.scoring.weights')}</h4>

          <div className="crm-settings-weight-group">
            <span className="crm-settings-weight-label">{t('crm.col.budget')}</span>
            <div className="crm-settings-weight-row">
              <label>{t('crm.settings.scoring.budgetHigh')}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.scoringWeights?.budgetHigh || 30}
                onChange={(e) => updateNestedSetting?.('scoringWeights', 'budgetHigh', parseInt(e.target.value) || 0)}
                disabled={!canManage}
              />
            </div>
            <div className="crm-settings-weight-row">
              <label>{t('crm.settings.scoring.budgetMedium')}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.scoringWeights?.budgetMedium || 15}
                onChange={(e) => updateNestedSetting?.('scoringWeights', 'budgetMedium', parseInt(e.target.value) || 0)}
                disabled={!canManage}
              />
            </div>
            <div className="crm-settings-weight-row">
              <label>{t('crm.settings.scoring.budgetLow')}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.scoringWeights?.budgetLow || 5}
                onChange={(e) => updateNestedSetting?.('scoringWeights', 'budgetLow', parseInt(e.target.value) || 0)}
                disabled={!canManage}
              />
            </div>
          </div>

          <div className="crm-settings-weight-group">
            <span className="crm-settings-weight-label">{t('crm.col.source')}</span>
            <div className="crm-settings-weight-row">
              <label>{t('crm.settings.scoring.sourceReferral')}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.scoringWeights?.sourceReferral || 25}
                onChange={(e) =>
                  updateNestedSetting?.('scoringWeights', 'sourceReferral', parseInt(e.target.value) || 0)
                }
                disabled={!canManage}
              />
            </div>
            <div className="crm-settings-weight-row">
              <label>{t('crm.settings.scoring.sourceAds')}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.scoringWeights?.sourceAds || 15}
                onChange={(e) => updateNestedSetting?.('scoringWeights', 'sourceAds', parseInt(e.target.value) || 0)}
                disabled={!canManage}
              />
            </div>
            <div className="crm-settings-weight-row">
              <label>{t('crm.source.other')}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.scoringWeights?.sourceOther || 10}
                onChange={(e) => updateNestedSetting?.('scoringWeights', 'sourceOther', parseInt(e.target.value) || 0)}
                disabled={!canManage}
              />
            </div>
          </div>

          <div className="crm-settings-weight-group">
            <span className="crm-settings-weight-label">{t('crm.col.priority')}</span>
            <div className="crm-settings-weight-row">
              <label>{t('crm.priority.urgent')}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.scoringWeights?.priorityUrgent || 20}
                onChange={(e) =>
                  updateNestedSetting?.('scoringWeights', 'priorityUrgent', parseInt(e.target.value) || 0)
                }
                disabled={!canManage}
              />
            </div>
            <div className="crm-settings-weight-row">
              <label>{t('crm.priority.high')}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.scoringWeights?.priorityHigh || 15}
                onChange={(e) => updateNestedSetting?.('scoringWeights', 'priorityHigh', parseInt(e.target.value) || 0)}
                disabled={!canManage}
              />
            </div>
            <div className="crm-settings-weight-row">
              <label>{t('crm.priority.normal')}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.scoringWeights?.priorityNormal || 5}
                onChange={(e) =>
                  updateNestedSetting?.('scoringWeights', 'priorityNormal', parseInt(e.target.value) || 0)
                }
                disabled={!canManage}
              />
            </div>
          </div>

          <div className="crm-settings-weight-group">
            <span className="crm-settings-weight-label">{t('crm.col.contact')}</span>
            <div className="crm-settings-weight-row">
              <label>{t('crm.settings.scoring.hasEmail')}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.scoringWeights?.hasEmail || 10}
                onChange={(e) => updateNestedSetting?.('scoringWeights', 'hasEmail', parseInt(e.target.value) || 0)}
                disabled={!canManage}
              />
            </div>
            <div className="crm-settings-weight-row">
              <label>{t('crm.settings.scoring.hasPhone')}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.scoringWeights?.hasPhone || 10}
                onChange={(e) => updateNestedSetting?.('scoringWeights', 'hasPhone', parseInt(e.target.value) || 0)}
                disabled={!canManage}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default ScoringSection
