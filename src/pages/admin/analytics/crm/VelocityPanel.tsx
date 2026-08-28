import React from 'react'
import type { PilotageResponse } from '../../../../types/pilotage.types'
import { STAGE_LABELS, formatDays } from './constants'

interface VelocityPanelProps {
  velocity: PilotageResponse['velocity']
}

/**
 * Durées observées. La médiane est mise en avant, la moyenne reste consultable :
 * un seul lead oublié plusieurs mois dans une étape suffit à emporter une
 * moyenne, jamais une médiane.
 */
const VelocityPanel: React.FC<VelocityPanelProps> = ({ velocity }) => {
  const measured = velocity.stages.filter((stage) => stage.samples > 0)

  return (
    <div className="pilotage-velocity">
      <div className="pilotage-cycle">
        <span className="pilotage-cycle-label">Cycle complet, création → signature</span>
        <span className="pilotage-cycle-value">{formatDays(velocity.cycle.medianDays)}</span>
        <span className="pilotage-cycle-sub">
          {velocity.cycle.samples === 0
            ? 'Aucune affaire signée sur la période'
            : `médiane sur ${velocity.cycle.samples} affaire${velocity.cycle.samples > 1 ? 's' : ''} · moyenne ${formatDays(velocity.cycle.averageDays)}`}
        </span>
      </div>

      {measured.length === 0 ? (
        <p className="pilotage-empty">Aucune étape entièrement traversée sur la période.</p>
      ) : (
        <table className="pilotage-table">
          <thead>
            <tr>
              <th>Étape</th>
              <th>Médiane</th>
              <th>Moyenne</th>
              <th>Mesures</th>
            </tr>
          </thead>
          <tbody>
            {measured.map((stage) => (
              <tr key={stage.stage}>
                <td>{STAGE_LABELS[stage.stage]}</td>
                <td className="is-strong">{formatDays(stage.medianDays)}</td>
                <td className="is-muted">{formatDays(stage.averageDays)}</td>
                <td className="is-muted">{stage.samples}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default VelocityPanel
