import { Fragment, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import type { TesterRun, TesterScenario } from '../../services/betaTester'

const VERDICT_LABEL_KEY: Record<string, MessageKey> = {
  WORKS: 'beta.verdict.works',
  BROKEN: 'beta.verdict.broken',
  TO_OPTIMIZE: 'beta.verdict.toOptimize',
  BLOCKED: 'beta.verdict.blocked',
}

const VERDICT_TONE: Record<string, string> = {
  WORKS: 'ok',
  BROKEN: 'fail',
  // Un blocage n'est pas un défaut du produit : encre neutre, pas de rouge.
  TO_OPTIMIZE: 'warn',
  BLOCKED: 'blocked',
}

interface Props {
  scenarios: TesterScenario[]
  /** Le verdict déjà rendu par le testeur, par démarche. */
  myRuns: Record<string, TesterRun | undefined>
  /** Les étapes cochées localement, par démarche. */
  checkedByScenario: Record<string, number[] | undefined>
  openId: string | null
  onToggle: (scenarioId: string) => void
  renderDetail: (scenario: TesterScenario) => ReactNode
}

/**
 * Vue d'ensemble des démarches, en tableau : une ligne par démarche, son rang
 * dans le parcours, l'avancement des coches et le verdict déjà rendu.
 *
 * Elle remplace l'empilement de cartes dépliées, illisible passé une poignée
 * de démarches : le testeur voit d'un coup ce qui reste à faire et n'ouvre que
 * celle qu'il traite. Le rang remplace l'identifiant `BETA-n`, qui ne dit rien
 * à quelqu'un d'extérieur — c'est la position dans le parcours qui compte.
 */
export default function ScenarioTable({ scenarios, myRuns, checkedByScenario, openId, onToggle, renderDetail }: Props) {
  const { t } = useI18n()
  return (
    <table className="bt-table">
      <thead>
        <tr>
          <th scope="col" className="bt-col-rank">
            <span className="bt-sr">{t('beta.table.rank')}</span>
          </th>
          <th scope="col">{t('beta.shared.scenario')}</th>
          <th scope="col" className="bt-col-steps">
            {t('beta.shared.steps')}
          </th>
          <th scope="col" className="bt-col-verdict">
            {t('beta.table.verdict')}
          </th>
        </tr>
      </thead>
      <tbody>
        {scenarios.map((scenario, index) => {
          const run = myRuns[scenario._id]
          const checked = checkedByScenario[scenario._id] ?? []
          const total = scenario.steps.length
          const isOpen = openId === scenario._id
          // Un retour corrigé ne dit plus l'état du produit : il demande une
          // revalidation, ce qui est une action, pas un statut.
          const toRecheck = run?.status === 'FIXED'

          return (
            <Fragment key={scenario._id}>
              <tr className={isOpen ? 'bt-row open' : 'bt-row'}>
                <td className="bt-col-rank">{index + 1}</td>
                <th scope="row" className="bt-col-title">
                  <button type="button" onClick={() => onToggle(scenario._id)} aria-expanded={isOpen}>
                    <ChevronDown size={14} aria-hidden className="bt-chevron" />
                    <span>{scenario.title}</span>
                  </button>
                </th>
                <td className="bt-col-steps">
                  {total > 0 ? (
                    <span className={checked.length === total ? 'bt-steps-done' : undefined}>
                      {checked.length} / {total}
                    </span>
                  ) : (
                    <span className="bt-sr">{t('beta.table.noSteps')}</span>
                  )}
                </td>
                <td className="bt-col-verdict">
                  {toRecheck ? (
                    <span className="bt-pill bt-pill-retest">{t('beta.shared.toRecheck')}</span>
                  ) : run ? (
                    <span className={`bt-pill bt-pill-${VERDICT_TONE[run.verdict]}`}>
                      {t(VERDICT_LABEL_KEY[run.verdict])}
                    </span>
                  ) : (
                    <span className="bt-pill bt-pill-todo">{t('beta.table.todo')}</span>
                  )}
                </td>
              </tr>
              {isOpen && (
                <tr className="bt-row-detail">
                  <td colSpan={4}>{renderDetail(scenario)}</td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
