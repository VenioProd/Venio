import React from 'react'
import { useI18n } from '../../../../context/I18nContext'
import type { PilotageResponse } from '../../../../types/pilotage.types'
import { STAGE_LABEL_KEYS, displayKey, formatPercent } from './constants'
import type { FunnelStage } from '../../../../types/pilotage.types'
import { translate } from '../../../../i18n'

interface LossPanelProps {
  losses: PilotageResponse['losses']
}

function stageLabel(stage: string): string {
  const key = STAGE_LABEL_KEYS[stage as FunnelStage]
  return key ? translate(key) : displayKey(stage)
}

/** Pourquoi on perd, et à quelle étape. */
const LossPanel: React.FC<LossPanelProps> = ({ losses }) => {
  const { t } = useI18n()
  if (losses.total === 0) {
    return <p className="pilotage-empty">{t('adminTech.pilotage.noLosses')}</p>
  }

  const maxReason = Math.max(...losses.byReason.map((entry) => entry.count), 1)
  const maxStage = Math.max(...losses.byStage.map((entry) => entry.count), 1)

  return (
    <div className="pilotage-losses">
      <div>
        <h4 className="pilotage-subtitle">{t('adminTech.pilotage.byReason')}</h4>
        <div className="pilotage-bars">
          {losses.byReason.map((entry) => (
            <div key={entry.reason} className="pilotage-bar-row">
              <span className="pilotage-bar-label">{displayKey(entry.reason)}</span>
              <div className="pilotage-bar-track">
                <div
                  className={`pilotage-bar-fill${entry.reason === 'NON_RENSEIGNE' ? ' is-unspecified' : ''}`}
                  style={{ width: `${(entry.count / maxReason) * 100}%` }}
                />
              </div>
              <span className="pilotage-bar-value">
                {entry.count} · {formatPercent(entry.share)}
              </span>
            </div>
          ))}
        </div>
        {losses.unspecified > 0 && (
          <p className="pilotage-note">
            {t('adminTech.pilotage.unspecifiedLosses', { share: formatPercent(losses.unspecified / losses.total) })}
          </p>
        )}
      </div>

      <div>
        <h4 className="pilotage-subtitle">{t('adminTech.pilotage.exitStage')}</h4>
        <div className="pilotage-bars">
          {losses.byStage.map((entry) => (
            <div key={entry.stage} className="pilotage-bar-row">
              <span className="pilotage-bar-label">{stageLabel(entry.stage)}</span>
              <div className="pilotage-bar-track">
                <div className="pilotage-bar-fill" style={{ width: `${(entry.count / maxStage) * 100}%` }} />
              </div>
              <span className="pilotage-bar-value">{entry.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default LossPanel
