import { useId } from 'react'
import { Flame } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { HEAT_LEVELS, type HeatLevel, type HeatProposal } from '../../services/callInsights'
import { recordedDecision, type HeatDecision } from './reviewModel'
import { DecisionBadge, GestureButton, ProposalTag, QuoteLine } from './ui'
import type { AnalysisReview } from '../../services/callInsights'
import './callInsights.css'

interface HeatBreakdownProps {
  heat: HeatProposal
  /** Niveau actuellement enregistré sur la fiche, s'il est connu. */
  currentLevel?: string | null
  decision: HeatDecision | null
  onDecide: (decision: HeatDecision | null) => void
  onQuote?: (quote: string) => void
  /** Analyse déjà validée : on montre ce qui a été décidé, sans gestes. */
  review?: AnalysisReview | null
  readOnly?: boolean
}

const FLAMES: Record<HeatLevel, number> = { FROID: 0, TIEDE: 1, CHAUD: 2, TRES_CHAUD: 3 }

function LevelBadge({ level }: { level: HeatLevel }) {
  const { t } = useI18n()
  return (
    <span className={`ci-heat-level ci-heat-level--${level.toLowerCase()}`}>
      <span className="ci-flames" aria-hidden>
        {[1, 2, 3].map((n) => (
          <Flame key={n} size={14} className={n <= FLAMES[level] ? 'on' : ''} />
        ))}
      </span>
      {t(`callInsights.heat.level.${level}`)}
    </span>
  )
}

export default function HeatBreakdown({
  heat,
  currentLevel,
  decision,
  onDecide,
  onQuote,
  review = null,
  readOnly = false,
}: HeatBreakdownProps) {
  const { t } = useI18n()
  const id = useId()
  const recorded = review ? recordedDecision(review, 'heat') : undefined
  const knownCurrent = HEAT_LEVELS.find((level) => level === currentLevel)
  const proposedLevel = decision?.action === 'EDIT' ? decision.level : heat.level
  const changing = decision?.action === 'EDIT'

  return (
    <section className="ci-card" aria-labelledby={`${id}-title`}>
      <header className="ci-card-head">
        <h3 id={`${id}-title`}>{t('callInsights.heat.title')}</h3>
        {readOnly && <DecisionBadge action={recorded?.action ?? null} />}
      </header>

      <div className="ci-compare">
        {readOnly && (recorded?.action === 'ACCEPT' || recorded?.action === 'EDIT') ? (
          <div className="ci-current">
            <span className="ci-compare-label">{t('callInsights.recorded')}</span>
            <LevelBadge
              level={
                recorded.action === 'EDIT' && HEAT_LEVELS.includes(recorded.after as HeatLevel)
                  ? (recorded.after as HeatLevel)
                  : heat.level
              }
            />
            {recorded.action === 'EDIT' && (
              <span className="ci-muted">
                {t('callInsights.original', { value: t(`callInsights.heat.level.${heat.level}`) })}
              </span>
            )}
          </div>
        ) : (
          <>
            {!readOnly && (
              <div className="ci-current">
                <span className="ci-compare-label">{t('callInsights.current')}</span>
                {knownCurrent ? (
                  <LevelBadge level={knownCurrent} />
                ) : (
                  <span className="ci-muted">{t('callInsights.empty')}</span>
                )}
              </div>
            )}
            <div className="ci-proposed">
              <span className="ci-compare-label">
                <ProposalTag />
              </span>
              <LevelBadge level={proposedLevel} />
              <span
                className="ci-score"
                role="img"
                aria-label={t('callInsights.heat.scoreLabel', { score: heat.score })}
              >
                <span className="ci-score-value">{heat.score}</span>
                <span className="ci-score-max">/ 100</span>
                <span className="ci-score-bar" aria-hidden>
                  <span style={{ width: `${Math.min(100, Math.max(0, heat.score))}%` }} />
                </span>
              </span>
              {changing && decision.level !== heat.level && (
                <span className="ci-muted">
                  {t('callInsights.heat.changedFrom', { level: t(`callInsights.heat.level.${heat.level}`) })}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <ul className="ci-criteria">
        {heat.criteria.map((criterion) => (
          <li key={criterion.key}>
            <div className="ci-criterion-row">
              <span className="ci-criterion-label">{criterion.label}</span>
              <span className="ci-score-bar" aria-hidden>
                <span
                  style={{ width: `${criterion.max ? Math.min(100, (criterion.points / criterion.max) * 100) : 0}%` }}
                />
              </span>
              <span className="ci-points">
                {t('callInsights.heat.points', { points: criterion.points, max: criterion.max })}
              </span>
            </div>
            {criterion.quote && <QuoteLine quote={criterion.quote} onQuote={onQuote} />}
          </li>
        ))}
      </ul>

      {!readOnly && (
        <div className="ci-gestures" role="group" aria-label={t('callInsights.heat.gestures')}>
          <GestureButton
            kind="accept"
            pressed={decision?.action === 'ACCEPT'}
            onClick={() => onDecide(decision?.action === 'ACCEPT' ? null : { action: 'ACCEPT' })}
          >
            {t('callInsights.heat.accept', { level: t(`callInsights.heat.level.${heat.level}`) })}
          </GestureButton>
          <GestureButton
            kind="edit"
            pressed={changing}
            onClick={() => onDecide(changing ? null : { action: 'EDIT', level: heat.level })}
          >
            {t('callInsights.heat.change')}
          </GestureButton>
          <GestureButton
            kind="ignore"
            pressed={decision?.action === 'IGNORE'}
            onClick={() => onDecide(decision?.action === 'IGNORE' ? null : { action: 'IGNORE' })}
          >
            {t('callInsights.ignore')}
          </GestureButton>
          {changing && (
            <label className="ci-inline-field">
              <span>{t('callInsights.heat.chooseLevel')}</span>
              <select
                className="portal-input"
                value={decision.level}
                onChange={(event) => onDecide({ action: 'EDIT', level: event.target.value as HeatLevel })}
              >
                {HEAT_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {t(`callInsights.heat.level.${level}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </section>
  )
}
