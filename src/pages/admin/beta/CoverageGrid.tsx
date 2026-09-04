import { AlertTriangle } from 'lucide-react'
import type { BetaCoverage, BetaScenario, BetaTester } from '../../../services/beta'
import { VERDICT_LABEL, coverageRatio, sortScenariosByAttention, verdictTone } from './helpers'

interface Props {
  scenarios: BetaScenario[]
  testers: BetaTester[]
  coverage: BetaCoverage
}

/**
 * Grille testeurs × démarches. Sa raison d'être est de rendre visibles deux
 * choses en un coup d'œil : les cases vides (personne n'a testé) et les
 * lignes où les verdicts se contredisent.
 *
 * Chaque case porte un libellé accessible, la couleur seule ne portant jamais
 * l'information.
 */
export default function CoverageGrid({ scenarios, testers, coverage }: Props) {
  const active = testers.filter((tester) => !tester.revokedAt)
  const ordered = sortScenariosByAttention(scenarios)
  const disputed = new Set(coverage.disputedScenarioIds)

  if (active.length === 0) {
    return (
      <div className="beta-coverage beta-coverage-empty">
        <p>Aucun testeur invité pour l’instant.</p>
        <p className="beta-muted">Invitez quelqu’un pour commencer à suivre qui a testé quoi.</p>
      </div>
    )
  }

  return (
    <div className="beta-coverage">
      <header className="beta-coverage-head">
        <div>
          <span className="beta-coverage-ratio">{coverageRatio(coverage)} %</span>
          <span className="beta-muted">
            {coverage.testedCount} / {coverage.expectedCount} verdicts rendus
          </span>
        </div>
        {coverage.silentTesterIds.length > 0 && (
          <span className="beta-chip beta-chip-warn">
            {coverage.silentTesterIds.length} testeur(s) sans aucun retour
          </span>
        )}
      </header>

      <div className="beta-coverage-scroll">
        <table className="beta-coverage-table">
          <thead>
            <tr>
              <th scope="col" className="beta-coverage-corner">
                Démarche
              </th>
              {active.map((tester) => (
                <th key={tester._id} scope="col" className="beta-coverage-tester">
                  {tester.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((scenario) => (
              <tr key={scenario._id}>
                <th scope="row" className="beta-coverage-scenario">
                  <span className="beta-coverage-id">{scenario.identifier}</span>
                  <span className="beta-coverage-title">{scenario.title}</span>
                  {disputed.has(scenario._id) && (
                    <span title="Les testeurs ne sont pas d’accord" className="beta-disputed">
                      <AlertTriangle size={13} aria-hidden />
                    </span>
                  )}
                </th>
                {active.map((tester) => {
                  const verdict = coverage.cells[scenario._id]?.[tester._id] ?? null
                  const label = verdict ? VERDICT_LABEL[verdict] : 'pas encore testé'
                  return (
                    <td key={tester._id} className="beta-coverage-cell">
                      <span
                        className={`beta-dot beta-dot-${verdict ? verdictTone(verdict) : 'empty'}`}
                        aria-label={`${tester.name} : ${label}`}
                        role="img"
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
