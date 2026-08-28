import React from 'react'
import type { PipelineResult, RevenueBlock } from '../../../../types/pilotage.types'
import { STAGE_LABELS, formatEuro, formatPercent } from './constants'

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
  const stages = pipeline.stages.filter((stage) => stage.count > 0)

  return (
    <div className="pilotage-revenue">
      <div className="pilotage-money">
        <div className="pilotage-money-item">
          <span className="pilotage-money-label">Budget déclaré</span>
          <span className="pilotage-money-value is-muted">{formatEuro(revenue.declaredBudget)}</span>
          <span className="pilotage-money-sub">à la saisie des leads</span>
        </div>
        <div className="pilotage-money-item">
          <span className="pilotage-money-label">Signé</span>
          <span className="pilotage-money-value">{formatEuro(revenue.signed)}</span>
          <span className="pilotage-money-sub">
            {revenue.linkedProjects} projet{revenue.linkedProjects > 1 ? 's' : ''} rattaché
            {revenue.linkedProjects > 1 ? 's' : ''}
          </span>
        </div>
        <div className="pilotage-money-item">
          <span className="pilotage-money-label">Encaissé</span>
          <span className="pilotage-money-value">{formatEuro(revenue.collected)}</span>
          <span className="pilotage-money-sub">factures payées</span>
        </div>
      </div>

      {revenue.linkedProjects === 0 && (
        <p className="pilotage-coverage">
          Aucun projet n'est rattaché aux leads de cette période : les montants resteront à zéro tant que la chaîne ne
          sera pas établie depuis les fiches leads.
        </p>
      )}

      <h4 className="pilotage-subtitle" style={{ marginTop: 18 }}>
        Pipeline pondéré — {formatEuro(pipeline.total)}
      </h4>

      {!pipeline.reliable && (
        <p className="pilotage-coverage">
          Projection à prendre avec précaution : elle s'appuie sur {pipeline.cohortSize} lead
          {pipeline.cohortSize > 1 ? 's' : ''} seulement. Les taux observés ne sont pas encore stables.
        </p>
      )}

      {stages.length === 0 ? (
        <p className="pilotage-empty">Aucune affaire en cours.</p>
      ) : (
        <table className="pilotage-table">
          <thead>
            <tr>
              <th>Étape</th>
              <th>Affaires</th>
              <th>Chance de signer</th>
              <th>Valeur pondérée</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => (
              <tr key={stage.stage}>
                <td>{STAGE_LABELS[stage.stage]}</td>
                <td className="is-muted">{stage.count}</td>
                <td className="is-muted">{formatPercent(stage.probability)}</td>
                <td className="is-strong">{formatEuro(stage.weighted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pipeline.withoutBudget > 0 && (
        <p className="pilotage-note">
          {pipeline.withoutBudget} affaire{pipeline.withoutBudget > 1 ? 's' : ''} en cours sans budget saisi{' '}
          {pipeline.withoutBudget > 1 ? 'comptent' : 'compte'} pour zéro : la projection est sous-estimée d'autant.
        </p>
      )}
    </div>
  )
}

export default PipelinePanel
