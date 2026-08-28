import React from 'react'
import type { PilotageResponse } from '../../../../types/pilotage.types'
import { STAGE_LABELS, displayKey, formatPercent } from './constants'
import type { FunnelStage } from '../../../../types/pilotage.types'

interface LossPanelProps {
  losses: PilotageResponse['losses']
}

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as FunnelStage] ?? displayKey(stage)
}

/** Pourquoi on perd, et à quelle étape. */
const LossPanel: React.FC<LossPanelProps> = ({ losses }) => {
  if (losses.total === 0) {
    return <p className="pilotage-empty">Aucune affaire perdue sur la période.</p>
  }

  const maxReason = Math.max(...losses.byReason.map((entry) => entry.count), 1)
  const maxStage = Math.max(...losses.byStage.map((entry) => entry.count), 1)

  return (
    <div className="pilotage-losses">
      <div>
        <h4 className="pilotage-subtitle">Par motif</h4>
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
            {formatPercent(losses.unspecified / losses.total)} des pertes n'ont pas de motif renseigné : ces affaires-là
            ne diront rien tant qu'il manquera.
          </p>
        )}
      </div>

      <div>
        <h4 className="pilotage-subtitle">Étape de sortie</h4>
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
