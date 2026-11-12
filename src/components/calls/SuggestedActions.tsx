import { useId } from 'react'
import { useI18n } from '../../context/I18nContext'
import { formatDateTime } from '../../i18n/format'
import type { AnalysisReview, ProposedAction } from '../../services/callInsights'
import { MAX_ACTIONS, recordedDecision, type ActionState } from './reviewModel'
import { DecisionBadge, GestureButton, ProposalTag } from './ui'
import './callInsights.css'

interface SuggestedActionsProps {
  actions: ProposedAction[]
  state: Record<string, ActionState>
  onChange: (id: string, next: ActionState) => void
  review?: AnalysisReview | null
  readOnly?: boolean
}

/** ISO → valeur d'un `datetime-local` (heure locale). */
function toLocalInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export default function SuggestedActions({
  actions,
  state,
  onChange,
  review = null,
  readOnly = false,
}: SuggestedActionsProps) {
  const { t } = useI18n()
  const id = useId()
  const shown = actions.slice(0, MAX_ACTIONS)

  return (
    <section className="ci-card" aria-labelledby={`${id}-title`}>
      <header className="ci-card-head">
        <h3 id={`${id}-title`}>{t('callInsights.actions.title')}</h3>
      </header>
      {shown.length === 0 ? (
        <p className="ci-muted">{t('callInsights.actions.none')}</p>
      ) : (
        <ul className="ci-action-list">
          {shown.map((action) => {
            const current = state[action.id] ?? { decision: null, dueAt: action.dueAt }
            const recorded = recordedDecision(review, action.id)
            const dateId = `${id}-${action.id}-date`
            return (
              <li key={action.id} className="ci-proposed ci-action">
                <div className="ci-action-head">
                  <ProposalTag />
                  <span className="ci-tag">{t(`callInsights.actions.type.${action.type}`)}</span>
                  {readOnly && <DecisionBadge action={recorded?.action ?? null} />}
                </div>
                <p className="ci-action-label">{action.label}</p>
                <p className="ci-muted">
                  {t('callInsights.actions.reason')} {action.reason}
                </p>
                {(action.type === 'SEQUENCE' || action.type === 'HANDOFF') && (
                  <p className="ci-muted">{t('callInsights.actions.notExecuted')}</p>
                )}
                {readOnly ? (
                  <p className="ci-muted">
                    {t('callInsights.actions.due')} {formatDateTime(action.dueAt) || t('callInsights.actions.noDate')}
                  </p>
                ) : (
                  <div className="ci-action-controls">
                    <label className="ci-inline-field" htmlFor={dateId}>
                      <span>{t('callInsights.actions.due')}</span>
                      <input
                        id={dateId}
                        className="portal-input"
                        type="datetime-local"
                        value={toLocalInput(current.dueAt)}
                        onChange={(event) =>
                          onChange(action.id, { ...current, dueAt: fromLocalInput(event.target.value) })
                        }
                      />
                    </label>
                    <div
                      className="ci-gestures"
                      role="group"
                      aria-label={t('callInsights.actions.gestures', { label: action.label })}
                    >
                      <GestureButton
                        kind="accept"
                        pressed={current.decision === 'ACCEPT'}
                        onClick={() =>
                          onChange(action.id, { ...current, decision: current.decision === 'ACCEPT' ? null : 'ACCEPT' })
                        }
                      >
                        {t('callInsights.accept')}
                      </GestureButton>
                      <GestureButton
                        kind="ignore"
                        pressed={current.decision === 'IGNORE'}
                        onClick={() =>
                          onChange(action.id, { ...current, decision: current.decision === 'IGNORE' ? null : 'IGNORE' })
                        }
                      >
                        {t('callInsights.ignore')}
                      </GestureButton>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
