import React from 'react'
import { useI18n } from '../../../../context/I18nContext'
import type { ForecastMonth } from '../../../../types/pilotage.types'
import { formatEuro, formatMonth } from './constants'

interface ForecastBarsProps {
  months: ForecastMonth[]
}

/**
 * Une barre par mois : réalisé (plein), pondéré empilé derrière (clair),
 * repère vertical pour l'objectif. Même échelle pour tous les mois.
 */
const ForecastBars: React.FC<ForecastBarsProps> = ({ months }) => {
  const { t } = useI18n()
  const max = Math.max(0, ...months.map((row) => Math.max(row.wonAmount + row.weighted, row.goal?.amountTarget ?? 0)))
  const pct = (value: number) => (max > 0 ? Math.min(100, (value / max) * 100) : 0)

  return (
    <div className="forecast-bars">
      <div className="forecast-legend">
        <span className="forecast-legend-item is-realised">{t('adminTech.forecast.legendRealised')}</span>
        <span className="forecast-legend-item is-weighted">{t('adminTech.forecast.legendWeighted')}</span>
        <span className="forecast-legend-item is-goal">{t('adminTech.forecast.legendGoal')}</span>
      </div>
      <ul className="forecast-bar-list" aria-label={t('adminTech.forecast.barsTitle')}>
        {months.map((row) => {
          const target = row.goal?.amountTarget ?? 0
          return (
            <li key={row.month} className="forecast-bar-row">
              <span className="pilotage-bar-label">{formatMonth(row.month)}</span>
              <div className="forecast-bar-track">
                <div className="forecast-bar-weighted" style={{ width: pct(row.wonAmount + row.weighted) + '%' }} />
                <div className="forecast-bar-realised" style={{ width: pct(row.wonAmount) + '%' }} />
                {target > 0 && <div className="forecast-bar-goal" style={{ left: pct(target) + '%' }} />}
              </div>
              <span className="pilotage-bar-value">
                {formatEuro(row.wonAmount)} / {formatEuro(row.weighted)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default ForecastBars
