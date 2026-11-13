import { ApiError } from '../../lib/api'
import type { MessageKey, MessageParams } from '../../context/I18nContext'
import { apiErrorCode } from '../../services/callInsights'

/** Codes de refus propres aux actions `SEQUENCE` et `HANDOFF` (`suggestedActions.apiError.<CODE>`). */
const CODES = [
  'ACTION_TEAM_ONLY',
  'SEQUENCE_REQUIRED',
  'SEQUENCE_NOT_FOUND',
  'EMPTY_SEQUENCE',
  'SEQUENCE_NOT_ALLOWED',
  'HANDOFF_ASSIGNEE_REQUIRED',
  'HANDOFF_SAME_ASSIGNEE',
  'INVALID_ASSIGNEE',
  'LEAD_NOT_OPEN',
]
const REASONS = [
  'ANONYMIZED',
  'OPT_OUT_PENDING',
  'DO_NOT_CONTACT',
  'DO_NOT_CALL',
  'CONSENT_WITHDRAWN',
  'CONSENT_REQUIRED',
  'SUPPRESSED',
  'NO_EMAIL',
  'CLOSED',
  'ARCHIVED',
  'ENTITY_MISMATCH',
  'ALREADY_ENROLLED',
  'NOT_FOUND',
]

type Translate = (key: MessageKey, params?: MessageParams) => string

/** Motif lisible d'un refus d'inscription (`reason` du serveur). */
export function refusalReason(reason: unknown, t: Translate): string {
  const known = typeof reason === 'string' && REASONS.includes(reason) ? reason : 'NOT_FOUND'
  return t(`suggestedActions.reason.${known}` as MessageKey)
}

/** Message lisible d'un refus d'action `SEQUENCE` / `HANDOFF`, ou `null` si l'erreur n'en est pas un. */
export function suggestedActionError(failure: unknown, t: Translate): string | null {
  const code = apiErrorCode(failure)
  if (!CODES.includes(code)) return null
  const payload = failure instanceof ApiError ? (failure.payload as Record<string, unknown> | null) : null
  return t(`suggestedActions.apiError.${code}` as MessageKey, { reason: refusalReason(payload?.reason, t) })
}
