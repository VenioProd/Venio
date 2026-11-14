import { useId } from 'react'
import { CalendarDays, Handshake, Layers, ListChecks, Mail, Phone, type LucideIcon } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { formatDateTime } from '../../i18n/format'
import type { ActionChoices, AnalysisReview, ProposedAction } from '../../services/callInsights'
import {
  CHOICE_ACTIONS,
  isActionAcceptable,
  MAX_ACTIONS,
  missingChoice,
  recordedDecision,
  type ActionState,
} from './reviewModel'
import { refusalReason } from './SuggestedActions.errors'
import { DecisionBadge, GestureButton, ProposalTag } from './ui'
import './callInsights.css'

const ACTION_ICONS: Record<string, LucideIcon> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: CalendarDays,
  TASK: ListChecks,
  SEQUENCE: Layers,
  HANDOFF: Handshake,
}

interface SuggestedActionsProps {
  actions: ProposedAction[]
  state: Record<string, ActionState>
  onChange: (id: string, next: ActionState) => void
  review?: AnalysisReview | null
  readOnly?: boolean
  /** Choix des actions `SEQUENCE` et `HANDOFF` ; absent : elles se lisent sans s'accepter. */
  choices?: ActionChoices
}

/** Ce qu'a produit une action `SEQUENCE` / `HANDOFF` acceptée (`after` de la décision enregistrée). */
interface ChoiceOutcome {
  sequenceName?: string
  enrollment?: { status: 'ENROLLED' } | { status: 'REFUSED'; reason: string }
  closingHandoff?: boolean
  assigneeName?: string
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
  choices,
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
            const labelId = `${id}-${action.id}-label`
            const acceptable = isActionAcceptable(action, choices)
            const withChoice = CHOICE_ACTIONS.includes(action.type)
            const toMember = action.type === 'HANDOFF' && choices?.handoff === 'MEMBER'
            const missing = acceptable ? missingChoice(action, current, choices) : null
            const hintId = `${id}-${action.id}-hint`
            const selectId = `${id}-${action.id}-choice`
            const outcome = (recorded?.action === 'ACCEPT' ? recorded.after : null) as ChoiceOutcome | null
            const outcomeText = !outcome
              ? ''
              : outcome.sequenceName
                ? outcome.enrollment?.status === 'REFUSED'
                  ? t('suggestedActions.recorded.refused', {
                      name: outcome.sequenceName,
                      reason: refusalReason(outcome.enrollment.reason, t),
                    })
                  : t(outcome.enrollment ? 'suggestedActions.recorded.enrolled' : 'suggestedActions.recorded.pending', {
                      name: outcome.sequenceName,
                    })
                : outcome.closingHandoff
                  ? t('suggestedActions.recorded.closer')
                  : outcome.assigneeName !== undefined
                    ? t('suggestedActions.recorded.member', { name: outcome.assigneeName })
                    : ''
            return (
              <li key={action.id} className="ci-action">
                <span className="ci-action-ico" aria-hidden>
                  {(() => {
                    const Icon = ACTION_ICONS[action.type] ?? ListChecks
                    return <Icon size={16} />
                  })()}
                </span>
                <div className="ci-action-body">
                  <div className="ci-action-head">
                    <ProposalTag />
                    <span className="ci-tag">
                      {toMember
                        ? t('suggestedActions.type.HANDOFF_MEMBER')
                        : t(`callInsights.actions.type.${action.type}`)}
                    </span>
                    {readOnly && <DecisionBadge action={recorded?.action ?? null} />}
                  </div>
                  <p className="ci-action-label">{current.label?.trim() || action.label}</p>
                  <p className="ci-muted">
                    {t('callInsights.actions.reason')} {action.reason}
                  </p>
                  {!acceptable && (
                    <p className="ci-muted" id={`${id}-${action.id}-unavailable`}>
                      {choices?.teamOnly.includes(action.type)
                        ? t('suggestedActions.teamOnly')
                        : t('callInsights.actions.notExecuted')}
                    </p>
                  )}
                  {readOnly ? (
                    withChoice ? (
                      outcomeText && <p className="ci-muted">{outcomeText}</p>
                    ) : (
                      <p className="ci-muted">
                        {t('callInsights.actions.due')}{' '}
                        {formatDateTime(action.dueAt) || t('callInsights.actions.noDate')}
                      </p>
                    )
                  ) : (
                    <div className="ci-action-controls">
                      {acceptable && action.type === 'SEQUENCE' && (
                        <>
                          {choices!.sequences.length === 0 ? (
                            <p className="ci-muted">{t('suggestedActions.sequence.none')}</p>
                          ) : (
                            <label className="ci-inline-field" htmlFor={selectId}>
                              <span>{t('suggestedActions.sequence.field')}</span>
                              <select
                                id={selectId}
                                className="portal-input"
                                value={current.sequenceId ?? ''}
                                aria-describedby={hintId}
                                onChange={(event) =>
                                  onChange(action.id, {
                                    ...current,
                                    sequenceId: event.target.value || undefined,
                                    // Sans choix, l'action n'est plus acceptée.
                                    decision: event.target.value ? current.decision : null,
                                  })
                                }
                              >
                                <option value="">{t('suggestedActions.sequence.placeholder')}</option>
                                {choices!.sequences.map((sequence) => (
                                  <option key={sequence._id} value={sequence._id}>
                                    {choices!.suggestedSequences[action.id] === sequence._id
                                      ? t('suggestedActions.sequence.suggested', { name: sequence.name })
                                      : sequence.status === 'DRAFT' || sequence.status === 'PAUSED'
                                        ? t(`suggestedActions.sequence.status.${sequence.status}`, {
                                            name: sequence.name,
                                          })
                                        : sequence.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <p className="ci-muted" id={hintId}>
                            {missing ? t('suggestedActions.sequence.missing') : t('suggestedActions.sequence.guards')}
                          </p>
                        </>
                      )}
                      {acceptable && action.type === 'HANDOFF' && !toMember && (
                        <p className="ci-muted" id={hintId}>
                          {t('suggestedActions.handoff.closer')}
                        </p>
                      )}
                      {acceptable && toMember && (
                        <>
                          {choices!.members.length === 0 ? (
                            <p className="ci-muted">{t('suggestedActions.handoff.none')}</p>
                          ) : (
                            <label className="ci-inline-field" htmlFor={selectId}>
                              <span>{t('suggestedActions.handoff.member')}</span>
                              <select
                                id={selectId}
                                className="portal-input"
                                value={current.assigneeId ?? ''}
                                aria-describedby={missing ? hintId : undefined}
                                onChange={(event) =>
                                  onChange(action.id, {
                                    ...current,
                                    assigneeId: event.target.value || undefined,
                                    // Sans choix, l'action n'est plus acceptée.
                                    decision: event.target.value ? current.decision : null,
                                  })
                                }
                              >
                                <option value="">{t('suggestedActions.handoff.placeholder')}</option>
                                {choices!.members.map((member) => (
                                  <option key={member._id} value={member._id}>
                                    {member.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {missing && (
                            <p className="ci-muted" id={hintId}>
                              {t('suggestedActions.handoff.missing')}
                            </p>
                          )}
                        </>
                      )}
                      {acceptable && !withChoice && (
                        <label className="ci-inline-field" htmlFor={labelId}>
                          <span>{t('callInsights.actions.labelField')}</span>
                          <input
                            id={labelId}
                            className="portal-input"
                            type="text"
                            maxLength={200}
                            value={current.label ?? action.label}
                            onChange={(event) => onChange(action.id, { ...current, label: event.target.value })}
                          />
                        </label>
                      )}
                      {acceptable && !withChoice && (
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
                      )}
                      <div
                        className="ci-gestures"
                        role="group"
                        aria-label={t('callInsights.actions.gestures', { label: action.label })}
                      >
                        <GestureButton
                          kind="accept"
                          pressed={acceptable && !missing && current.decision === 'ACCEPT'}
                          disabled={!acceptable || Boolean(missing)}
                          describedBy={!acceptable ? `${id}-${action.id}-unavailable` : withChoice ? hintId : undefined}
                          onClick={() =>
                            onChange(action.id, {
                              ...current,
                              decision: current.decision === 'ACCEPT' ? null : 'ACCEPT',
                            })
                          }
                        >
                          {t('callInsights.accept')}
                        </GestureButton>
                        {acceptable && (
                          <GestureButton
                            kind="ignore"
                            pressed={current.decision === 'IGNORE'}
                            onClick={() =>
                              onChange(action.id, {
                                ...current,
                                decision: current.decision === 'IGNORE' ? null : 'IGNORE',
                              })
                            }
                          >
                            {t('callInsights.ignore')}
                          </GestureButton>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
