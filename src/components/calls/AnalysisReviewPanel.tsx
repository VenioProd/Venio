import { useId, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { formatDateTime } from '../../i18n/format'
import {
  apiErrorCode,
  apiErrorKey,
  type ActionChoices,
  type ApplyInput,
  type CallAnalysis,
  type CallAnalysisOutput,
  type FieldKey,
  type ProposedField,
} from '../../services/callInsights'
import HeatBreakdown from './HeatBreakdown'
import SuggestedActions from './SuggestedActions'
import { suggestedActionError } from './SuggestedActions.errors'
import {
  buildApplyInput,
  countDecisions,
  displayValue,
  editableText,
  initialState,
  isEmptyValue,
  isKeyAcceptable,
  parseEdited,
  recordedDecision,
  reviewerName,
  type FieldDecision,
  type ReviewState,
} from './reviewModel'
import { ConfidenceMeter, DecisionBadge, GestureButton, ProposalTag, QuoteLine } from './ui'
import './callInsights.css'

interface AnalysisReviewPanelProps {
  analysis: CallAnalysis
  /** Valeurs actuellement enregistrées sur la fiche, par clé de champ. */
  current: Record<string, unknown>
  /** Champs que l'auteur peut accepter ; les autres reviennent à l'équipe. Absent : tous. */
  acceptableKeys?: readonly string[]
  /** Envoie la sélection en une fois ; doit rejeter en cas d'échec. */
  onApply: (input: ApplyInput) => Promise<void>
  /** Rejette l'analyse entière ; doit rejeter en cas d'échec. */
  onReject: () => Promise<void>
  /** Appelée quand on choisit une citation, pour la surligner dans le transcript. */
  onQuote?: (quote: string) => void
  /** Lecture seule : aucun geste (consultation par l'équipe). */
  readOnly?: boolean
  /** Choix des actions `SEQUENCE` et `HANDOFF` (séquences, membres) ; absent : elles ne s'acceptent pas. */
  actionChoices?: ActionChoices
}

/** Codes d'erreur d'`apply`, `reject` et `opt-out` qui ont un message dédié (`callInsights.apiError.<CODE>`). */
const KNOWN_ERROR_CODES = [
  'INVALID_BODY',
  'UNKNOWN_PROPOSAL',
  'FIELD_NOT_ALLOWED',
  'QUOTE_NOT_VERIFIED',
  'INVALID_VALUE',
  'ACTION_DUE_REQUIRED',
  'ACTION_NOT_AVAILABLE',
  'LEAD_HANDED_OFF',
  'LEAD_CLOSED',
  'ANALYSIS_NOT_READY',
  'ANALYSIS_ALREADY_REVIEWED',
  'IDEMPOTENCY_CONFLICT',
  'NOT_FOUND',
]
const FIELD_LABELS: Record<string, true> = Object.fromEntries(
  [
    'budget',
    'expectedCloseAt',
    'serviceType',
    'sector',
    'companySize',
    'contactName',
    'contactEmail',
    'qualification.need',
    'qualification.timeline',
    'qualification.decisionMaker',
    'qualification.objections',
    'qualification.competitors',
  ].map((key) => [key, true as const]),
)

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// ─── Une ligne par champ proposé ────────────────────────────────────────────

interface FieldRowProps {
  field: ProposedField
  current: unknown
  decision: FieldDecision | undefined
  onDecide: (decision: FieldDecision | undefined) => void
  onQuote?: (quote: string) => void
  /** Consultation d'une analyse déjà traitée. */
  recorded?: { action: 'ACCEPT' | 'EDIT' | 'IGNORE'; after: unknown } | null
  settled?: boolean
  /** Champ réservé à l'équipe : rien à décider depuis cet espace. */
  teamOnly?: boolean
}

function FieldRow({
  field,
  current,
  decision,
  onDecide,
  onQuote,
  recorded,
  settled = false,
  teamOnly = false,
}: FieldRowProps) {
  const { t } = useI18n()
  const id = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const label = t(`callInsights.field.${field.key}`)
  const blocked = !field.quoteVerified
  const parsed = parseEdited(field.key, draft)
  const multiline =
    field.key === 'qualification.need' ||
    field.key === 'qualification.timeline' ||
    field.key === 'qualification.decisionMaker'

  function startEdit() {
    const base = decision?.action === 'EDIT' ? decision.value : field.value
    const text = editableText(base)
    setDraft(field.key === 'expectedCloseAt' ? text.slice(0, 10) : text)
    setEditing(true)
  }

  const shownProposed = displayValue(
    field.key,
    settled && recorded && recorded.action !== 'IGNORE' && recorded.after !== undefined ? recorded.after : field.value,
  )

  return (
    <li className="ci-field" aria-labelledby={`${id}-label`}>
      <div className="ci-field-head">
        <h4 id={`${id}-label`}>{label}</h4>
        {settled ? (
          <DecisionBadge action={recorded?.action ?? null} />
        ) : (
          <span className={`ci-tag ${decision ? `ci-tag--${decision.action.toLowerCase()}` : ''}`}>
            {t(decision ? `callInsights.state.${decision.action}` : 'callInsights.state.none')}
          </span>
        )}
      </div>

      <div className="ci-compare">
        {settled && (recorded?.action === 'ACCEPT' || recorded?.action === 'EDIT') ? (
          <div className="ci-current">
            <span className="ci-compare-label">{t('callInsights.recorded')}</span>
            <span className="ci-value">{shownProposed}</span>
            {recorded.action === 'EDIT' && (
              <span className="ci-muted">
                {t('callInsights.original', { value: displayValue(field.key, field.value) || t('callInsights.empty') })}
              </span>
            )}
          </div>
        ) : (
          <>
            {!settled && (
              <div className="ci-current">
                <span className="ci-compare-label">{t('callInsights.current')}</span>
                {isEmptyValue(current) ? (
                  <span className="ci-muted">{t('callInsights.empty')}</span>
                ) : (
                  <span className="ci-value">{displayValue(field.key, current)}</span>
                )}
              </div>
            )}
            <div className="ci-proposed">
              <span className="ci-compare-label">
                <ProposalTag />
                <ConfidenceMeter level={field.confidence} />
              </span>
              <span className="ci-value">
                {shownProposed || <span className="ci-muted">{t('callInsights.empty')}</span>}
              </span>
              {decision?.action === 'EDIT' && !editing && (
                <span className="ci-edited">
                  {t('callInsights.edited', { value: displayValue(field.key, decision.value) })}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <QuoteLine quote={field.quote} onQuote={onQuote} verified={field.quoteVerified} />
      {blocked && (
        <p className="ci-warning" id={`${id}-unverified`}>
          <AlertTriangle size={14} aria-hidden />
          {t('callInsights.field.unverified')}
        </p>
      )}

      {teamOnly && !settled && (
        <p className="ci-muted ci-team-only" id={`${id}-team`}>
          {t('callInsights.field.teamOnly')}
        </p>
      )}

      {!settled && !teamOnly && (
        <div className="ci-gestures" role="group" aria-label={t('callInsights.field.gestures', { field: label })}>
          <GestureButton
            kind="accept"
            pressed={decision?.action === 'ACCEPT'}
            disabled={blocked || isEmptyValue(field.value)}
            describedBy={blocked ? `${id}-unverified` : undefined}
            onClick={() => {
              setEditing(false)
              onDecide(decision?.action === 'ACCEPT' ? undefined : { action: 'ACCEPT' })
            }}
          >
            {t('callInsights.accept')}
          </GestureButton>
          <GestureButton kind="edit" pressed={decision?.action === 'EDIT' || editing} onClick={startEdit}>
            {t('callInsights.field.editAccept')}
          </GestureButton>
          <GestureButton
            kind="ignore"
            pressed={decision?.action === 'IGNORE'}
            onClick={() => {
              setEditing(false)
              onDecide(decision?.action === 'IGNORE' ? undefined : { action: 'IGNORE' })
            }}
          >
            {t('callInsights.ignore')}
          </GestureButton>
        </div>
      )}

      {editing && (
        <div className="ci-edit">
          <label className="ci-inline-field" htmlFor={`${id}-edit`}>
            <span>{t('callInsights.field.newValue', { field: label })}</span>
            {multiline ? (
              <textarea
                id={`${id}-edit`}
                className="portal-input"
                rows={3}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            ) : (
              <input
                id={`${id}-edit`}
                className="portal-input"
                type={field.key === 'budget' ? 'number' : field.key === 'expectedCloseAt' ? 'date' : 'text'}
                {...(field.key === 'budget' ? { min: 0, step: 'any' } : {})}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            )}
          </label>
          {(field.key === 'qualification.objections' || field.key === 'qualification.competitors') && (
            <span className="ci-muted">{t('callInsights.field.listHint')}</span>
          )}
          <div className="ci-gestures">
            <button
              type="button"
              className="portal-button"
              disabled={parsed === undefined}
              onClick={() => {
                if (parsed === undefined) return
                onDecide({ action: 'EDIT', value: parsed })
                setEditing(false)
              }}
            >
              {t('callInsights.field.confirmEdit')}
            </button>
            <button
              type="button"
              className="portal-button secondary"
              onClick={() => {
                setEditing(false)
                if (decision?.action === 'EDIT') onDecide(undefined)
              }}
            >
              {t('callInsights.cancel')}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

// ─── Panneau ────────────────────────────────────────────────────────────────

export default function AnalysisReviewPanel({
  analysis,
  current,
  acceptableKeys,
  onApply,
  onReject,
  onQuote,
  readOnly = false,
  actionChoices,
}: AnalysisReviewPanelProps) {
  const { t } = useI18n()
  const output = analysis.output as CallAnalysisOutput
  const settled = analysis.status !== 'READY'
  const viewOnly = readOnly || settled
  const [state, setState] = useState<ReviewState>(() => initialState(output, actionChoices))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmReject, setConfirmReject] = useState(false)
  // Même corps = même clientRequestId : une nouvelle tentative ne peut pas appliquer deux fois.
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null)
  const sending = useRef(false)

  const counts = countDecisions(output, state, acceptableKeys, actionChoices)
  const decided = counts.accepted + counts.ignored > 0

  /** Message lisible pour un code d'erreur du serveur ; le message générique quand le code est inconnu. */
  function errorText(failure: unknown, fallback: 'callInsights.error.apply' | 'callInsights.error.reject') {
    const code = apiErrorCode(failure)
    const actionError = suggestedActionError(failure, t)
    if (actionError) return actionError
    if (!code || !KNOWN_ERROR_CODES.includes(code)) return t(fallback)
    const key = apiErrorKey(failure)
    const field = key && key in FIELD_LABELS ? t(`callInsights.field.${key}` as 'callInsights.field.budget') : key
    return t(`callInsights.apiError.${code}` as 'callInsights.apiError.INVALID_BODY', { field })
  }

  async function run(action: () => Promise<void>, fallback: 'callInsights.error.apply' | 'callInsights.error.reject') {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (failure) {
      setError(errorText(failure, fallback))
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  function apply() {
    const body = buildApplyInput(output, state, '', actionChoices)
    const fingerprint = JSON.stringify(body)
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newKey() }
    const key = attempt.current.key
    void run(() => onApply({ ...body, clientRequestId: key }), 'callInsights.error.apply')
  }

  const reviewer = reviewerName(analysis.review)
  const reviewedAt = analysis.review ? formatDateTime(analysis.review.at) : ''
  const rejected = analysis.status === 'REJECTED'
  const statusKey =
    `callInsights.review.${rejected ? 'rejected' : 'validated'}${reviewedAt ? (reviewer ? 'ByAt' : 'At') : ''}` as const
  const statusText =
    t(statusKey, { name: reviewer, date: reviewedAt }) +
    (analysis.status === 'PARTIAL' ? ` ${t('callInsights.review.partial')}` : '')

  return (
    <div className="ci-review">
      {settled && (
        <p className={`ci-status ci-status--${analysis.status === 'REJECTED' ? 'rejected' : 'applied'}`} role="status">
          {analysis.status === 'REJECTED' ? <XCircle size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
          <span>{statusText}</span>
        </p>
      )}

      <section className="ci-card" aria-label={t('callInsights.summary.title')}>
        <header className="ci-card-head">
          <h3>{t('callInsights.summary.title')}</h3>
        </header>
        <p className="ci-summary">{output.summary}</p>
      </section>

      <section className="ci-card" aria-labelledby="ci-fields-title">
        <header className="ci-card-head">
          <h3 id="ci-fields-title">{t('callInsights.fields.title')}</h3>
        </header>
        {!viewOnly && <p className="ci-muted">{t('callInsights.fields.intro')}</p>}
        {output.fields.length === 0 ? (
          <p className="ci-muted">{t('callInsights.fields.none')}</p>
        ) : (
          <ul className="ci-fields">
            {output.fields.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                current={current[field.key as FieldKey]}
                decision={state.fields[field.key]}
                onDecide={(decision) =>
                  setState((previous) => {
                    const fields = { ...previous.fields }
                    if (decision) fields[field.key] = decision
                    else delete fields[field.key]
                    return { ...previous, fields }
                  })
                }
                onQuote={onQuote}
                teamOnly={!isKeyAcceptable(acceptableKeys, field.key)}
                settled={viewOnly}
                recorded={viewOnly ? (recordedDecision(analysis.review, field.key) ?? null) : null}
              />
            ))}
          </ul>
        )}
      </section>

      <HeatBreakdown
        heat={output.heat}
        currentLevel={typeof current.leadTemperature === 'string' ? current.leadTemperature : null}
        decision={state.heat}
        onDecide={(heat) => setState((previous) => ({ ...previous, heat }))}
        onQuote={onQuote}
        review={analysis.review}
        readOnly={viewOnly}
      />

      <SuggestedActions
        actions={output.actions}
        state={state.actions}
        onChange={(id, next) => setState((previous) => ({ ...previous, actions: { ...previous.actions, [id]: next } }))}
        review={analysis.review}
        readOnly={viewOnly}
        choices={actionChoices}
      />

      {!viewOnly && (
        <div className="ci-apply" role="region" aria-label={t('callInsights.apply.title')}>
          <p className="ci-apply-count" aria-live="polite">
            {t('callInsights.apply.count', {
              accepted: counts.accepted,
              ignored: counts.ignored,
              pending: counts.pending,
            })}
          </p>
          {counts.pending > 0 && decided && <p className="ci-muted">{t('callInsights.apply.pendingNote')}</p>}
          {error && (
            <p className="ci-error" role="alert">
              {error}
            </p>
          )}
          {confirmReject ? (
            <div className="ci-gestures" role="group" aria-label={t('callInsights.reject.confirmTitle')}>
              <span>{t('callInsights.reject.confirmMessage')}</span>
              <button
                type="button"
                className="portal-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await onReject()
                    setConfirmReject(false)
                  }, 'callInsights.error.reject')
                }
              >
                {t('callInsights.reject.confirm')}
              </button>
              <button
                type="button"
                className="portal-button secondary"
                disabled={busy}
                onClick={() => setConfirmReject(false)}
              >
                {t('callInsights.cancel')}
              </button>
            </div>
          ) : (
            <div className="ci-gestures">
              <button type="button" className="portal-button" disabled={busy || !decided} onClick={apply}>
                {busy ? t('callInsights.apply.sending') : t('callInsights.apply.button')}
              </button>
              <button
                type="button"
                className="portal-button secondary"
                disabled={busy}
                onClick={() => setConfirmReject(true)}
              >
                {t('callInsights.reject.button')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
