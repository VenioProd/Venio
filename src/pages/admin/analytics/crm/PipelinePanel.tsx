import React from 'react'
import { useI18n } from '../../../../context/I18nContext'
import type { PipelineResult, RevenueBlock } from '../../../../types/pilotage.types'
import { STAGE_LABEL_KEYS, formatAmount, formatEuro, formatPercent } from './constants'

interface PipelinePanelProps {
  pipeline: PipelineResult
  revenue: RevenueBlock
}

/**
 * Réalisé et prévisionnel.
 *
 * Le prévisionnel est le chiffre le plus facile à mal lire de tout le tableau
 * de bord : ses taux viennent de la cohorte passée et s'appliquent au pipeline
 * courant. On le dit, plutôt que de le présenter comme une certitude.
 */
const PipelinePanel: React.FC<PipelinePanelProps> = ({ pipeline, revenue }) => {
  const { t } = useI18n()
  const stages = pipeline.stages.filter((stage) => stage.count > 0)
  // Les autres devises ne sont jamais additionnées à l'euro : on les liste à part.
  const otherCurrencies = Object.entries(revenue.byCurrency ?? {}).filter(
    ([currency, sums]) => currency !== 'EUR' && (sums.signed > 0 || sums.collected > 0),
  )

  return (
    <div className="pilotage-revenue">
      <div className="pilotage-money">
        <div className="pilotage-money-item">
          <span className="pilotage-money-label">{t('adminTech.pilotage.declaredBudget')}</span>
          <span className="pilotage-money-value is-muted">{formatEuro(revenue.declaredBudget)}</span>
          <span className="pilotage-money-sub">{t('adminTech.pilotage.declaredBudgetSub')}</span>
        </div>
        <div className="pilotage-money-item">
          <span className="pilotage-money-label">{t('adminTech.pilotage.signed')}</span>
          <span className="pilotage-money-value">{formatEuro(revenue.signed)}</span>
          <span className="pilotage-money-sub">
            {t('adminTech.pilotage.linkedProjects', { count: revenue.linkedProjects })}
          </span>
        </div>
        <div className="pilotage-money-item">
          <span className="pilotage-money-label">{t('adminTech.pilotage.collected')}</span>
          <span className="pilotage-money-value">{formatEuro(revenue.collected)}</span>
          <span className="pilotage-money-sub">{t('adminTech.pilotage.collectedSub')}</span>
        </div>
      </div>

      {otherCurrencies.length > 0 && (
        <p className="pilotage-note">
          {t('adminTech.pilotage.otherCurrencies', {
            list: otherCurrencies
              .map(([currency, sums]) =>
                t('adminTech.pilotage.currencyLine', {
                  currency,
                  signed: formatAmount(sums.signed, currency),
                  collected: formatAmount(sums.collected, currency),
                }),
              )
              .join(' · '),
          })}
        </p>
      )}

      {revenue.linkedProjects === 0 && <p className="pilotage-coverage">{t('adminTech.pilotage.noLinkedProjects')}</p>}

      <h4 className="pilotage-subtitle" style={{ marginTop: 18 }}>
        {t('adminTech.pilotage.weightedPipeline', { amount: formatEuro(pipeline.total) })}
      </h4>

      <p className="pilotage-note">{t('adminTech.pilotage.weightedDefinition')}</p>

      {stages.length === 0 ? (
        <p className="pilotage-empty">{t('adminTech.pilotage.noDeals')}</p>
      ) : (
        <table className="pilotage-table">
          <thead>
            <tr>
              <th>{t('adminTech.pilotage.colStage')}</th>
              <th>{t('adminTech.pilotage.colDeals')}</th>
              <th>{t('adminTech.pilotage.colChance')}</th>
              <th>{t('adminTech.pilotage.colWeighted')}</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => (
              <tr key={stage.stage}>
                <td>{t(STAGE_LABEL_KEYS[stage.stage])}</td>
                <td className="is-muted">{stage.count}</td>
                <td className="is-muted">{formatPercent(stage.probability)}</td>
                <td className="is-strong">{formatEuro(stage.weighted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pipeline.withoutBudget > 0 && (
        <p className="pilotage-note">{t('adminTech.pilotage.withoutBudget', { count: pipeline.withoutBudget })}</p>
      )}
    </div>
  )
}

export default PipelinePanel
