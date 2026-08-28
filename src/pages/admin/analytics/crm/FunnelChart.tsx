import React from 'react'
import type { FunnelStageResult } from '../../../../types/pilotage.types'
import { STAGE_LABELS, formatPercent } from './constants'

interface FunnelChartProps {
  stages: FunnelStageResult[]
  total: number
}

/**
 * Entonnoir par étape. Chaque barre est proportionnelle au nombre de leads
 * arrivés au moins jusque-là ; le taux affiché est celui du passage depuis
 * l'étape précédente — c'est là que se lit la déperdition.
 */
const FunnelChart: React.FC<FunnelChartProps> = ({ stages, total }) => {
  if (total === 0) {
    return <p className="pilotage-empty">Aucun lead créé sur la période.</p>
  }

  return (
    <div className="pilotage-funnel">
      {stages.map((stage) => (
        <div key={stage.stage} className="pilotage-funnel-row">
          <span className="pilotage-funnel-label">{STAGE_LABELS[stage.stage]}</span>
          <div className="pilotage-funnel-track">
            <div
              className={`pilotage-funnel-fill${stage.stage === 'WON' ? ' is-won' : ''}`}
              style={{ width: `${total === 0 ? 0 : (stage.count / total) * 100}%` }}
            />
          </div>
          {/* Le compte vit hors de la barre : sur les dernières étapes elle est
              trop étroite pour l'accueillir lisiblement. */}
          <span className="pilotage-funnel-count">{stage.count}</span>
          <span
            className={`pilotage-funnel-rate${
              stage.rateFromPrevious !== null && stage.rateFromPrevious < 0.5 ? ' is-low' : ''
            }`}
            title={stage.rateFromPrevious === null ? 'Première étape' : "Depuis l'étape précédente"}
          >
            {formatPercent(stage.rateFromPrevious)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default FunnelChart
