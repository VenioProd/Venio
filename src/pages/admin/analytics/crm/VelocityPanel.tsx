import React from 'react'
import { useI18n } from '../../../../context/I18nContext'
import type { PilotageResponse } from '../../../../types/pilotage.types'
import { STAGE_LABEL_KEYS, formatDays } from './constants'

interface VelocityPanelProps {
  velocity: PilotageResponse['velocity']
}

/**
 * Durées observées. La médiane est mise en avant, la moyenne reste consultable :
 * un seul lead oublié plusieurs mois dans une étape suffit à emporter une
 * moyenne, jamais une médiane.
 */
const VelocityPanel: React.FC<VelocityPanelProps> = ({ velocity }) => {
  const { t } = useI18n()
  const measured = velocity.stages.filter((stage) => stage.samples > 0)

  return (
    <div className="pilotage-velocity">
      <div className="pilotage-cycle">
        <span className="pilotage-cycle-label">{t('adminTech.pilotage.cycleLabel')}</span>
        <span className="pilotage-cycle-value">{formatDays(velocity.cycle.medianDays)}</span>
        <span className="pilotage-cycle-sub">
          {velocity.cycle.samples === 0
            ? t('adminTech.pilotage.noSignedDeals')
            : t('adminTech.pilotage.cycleSub', {
                count: velocity.cycle.samples,
                average: formatDays(velocity.cycle.averageDays),
              })}
        </span>
      </div>

      {measured.length === 0 ? (
        <p className="pilotage-empty">{t('adminTech.pilotage.noStages')}</p>
      ) : (
        <table className="pilotage-table">
          <thead>
            <tr>
              <th>{t('adminTech.pilotage.colStage')}</th>
              <th>{t('adminTech.pilotage.colMedian')}</th>
              <th>{t('adminTech.pilotage.colAverage')}</th>
              <th>{t('adminTech.pilotage.colSamples')}</th>
            </tr>
          </thead>
          <tbody>
            {measured.map((stage) => (
              <tr key={stage.stage}>
                <td>{t(STAGE_LABEL_KEYS[stage.stage])}</td>
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
