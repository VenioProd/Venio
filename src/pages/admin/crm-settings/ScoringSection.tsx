import React from 'react'
import type { SectionProps } from './types'
import { AUTOMATION_CATEGORIES } from './constants'

const ScoringSection: React.FC<SectionProps> = ({ settings, canManage, updateSetting, updateNestedSetting }) => (
  <section className="crm-settings-section">
    <div className="crm-settings-section-header">
      {AUTOMATION_CATEGORIES.find((c) => c.id === 'scoring')?.icon}
      <h2>Scoring automatique</h2>
    </div>

    <div className="crm-settings-item">
      <div className="crm-settings-item-info">
        <h3>Activer le scoring</h3>
        <p>Calculer automatiquement un score pour chaque lead</p>
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
        <h4>Pondérations (sur 100 points)</h4>

        <div className="crm-settings-weight-group">
          <span className="crm-settings-weight-label">Budget</span>
          <div className="crm-settings-weight-row">
            <label>&gt; 10K€</label>
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
            <label>1K-10K€</label>
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
            <label>&lt; 1K€</label>
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
          <span className="crm-settings-weight-label">Source</span>
          <div className="crm-settings-weight-row">
            <label>Recommandation</label>
            <input
              type="number"
              min="0"
              max="100"
              value={settings.scoringWeights?.sourceReferral || 25}
              onChange={(e) => updateNestedSetting?.('scoringWeights', 'sourceReferral', parseInt(e.target.value) || 0)}
              disabled={!canManage}
            />
          </div>
          <div className="crm-settings-weight-row">
            <label>Publicité</label>
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
            <label>Autre</label>
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
          <span className="crm-settings-weight-label">Priorité</span>
          <div className="crm-settings-weight-row">
            <label>Urgente</label>
            <input
              type="number"
              min="0"
              max="100"
              value={settings.scoringWeights?.priorityUrgent || 20}
              onChange={(e) => updateNestedSetting?.('scoringWeights', 'priorityUrgent', parseInt(e.target.value) || 0)}
              disabled={!canManage}
            />
          </div>
          <div className="crm-settings-weight-row">
            <label>Haute</label>
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
            <label>Normale</label>
            <input
              type="number"
              min="0"
              max="100"
              value={settings.scoringWeights?.priorityNormal || 5}
              onChange={(e) => updateNestedSetting?.('scoringWeights', 'priorityNormal', parseInt(e.target.value) || 0)}
              disabled={!canManage}
            />
          </div>
        </div>

        <div className="crm-settings-weight-group">
          <span className="crm-settings-weight-label">Contact</span>
          <div className="crm-settings-weight-row">
            <label>Email renseigné</label>
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
            <label>Téléphone renseigné</label>
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

export default ScoringSection
