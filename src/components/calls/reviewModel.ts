import { formatDate, formatMoney } from '../../i18n/format'
import type {
  AnalysisReview,
  ApplyInput,
  CallAnalysisOutput,
  FieldKey,
  FieldValue,
  HeatLevel,
  ReviewAction,
} from '../../services/callInsights'

/** Décision prise sur un champ ; absence de décision = pas encore tranché, donc rien d'appliqué. */
export type FieldDecision = { action: 'ACCEPT' } | { action: 'EDIT'; value: FieldValue } | { action: 'IGNORE' }
export type HeatDecision = { action: 'ACCEPT' } | { action: 'EDIT'; level: HeatLevel } | { action: 'IGNORE' }
export interface ActionState {
  decision: 'ACCEPT' | 'IGNORE' | null
  dueAt: string | null
}

export interface ReviewState {
  fields: Partial<Record<FieldKey, FieldDecision>>
  heat: HeatDecision | null
  actions: Record<string, ActionState>
}

export const MAX_ACTIONS = 3

export function initialState(output: CallAnalysisOutput): ReviewState {
  return {
    fields: {},
    heat: null,
    actions: Object.fromEntries(
      output.actions.slice(0, MAX_ACTIONS).map((a) => [a.id, { decision: null, dueAt: a.dueAt }]),
    ),
  }
}

export function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

/** Valeur lisible d'un champ (montant, date, liste…). */
export function displayValue(key: FieldKey, value: unknown): string {
  if (isEmptyValue(value)) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (key === 'budget' && typeof value === 'number') return formatMoney(value, 'EUR', { maximumFractionDigits: 0 })
  if (key === 'expectedCloseAt' && typeof value === 'string') return formatDate(value) || value
  return String(value)
}

/** Texte à éditer pour une valeur proposée. */
export function editableText(value: unknown): string {
  if (isEmptyValue(value)) return ''
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

/** Reconvertit le texte saisi ; `undefined` si invalide (nombre illisible, valeur vide). */
export function parseEdited(key: FieldKey, text: string): FieldValue | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  if (key === 'budget') {
    const amount = Number(trimmed.replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(amount) && amount >= 0 ? amount : undefined
  }
  if (key === 'qualification.objections' || key === 'qualification.competitors') {
    const items = trimmed
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
    return items.length ? items : undefined
  }
  return trimmed
}

/** Corps de l'envoi unique. Ce qui n'a pas été tranché part en IGNORE : ça n'écrit rien sur la fiche. */
export function buildApplyInput(output: CallAnalysisOutput, state: ReviewState, clientRequestId: string): ApplyInput {
  return {
    clientRequestId,
    fields: output.fields.map((field) => {
      const decision = state.fields[field.key]
      if (!decision || decision.action === 'IGNORE') return { key: field.key, action: 'IGNORE' as const }
      return decision.action === 'EDIT'
        ? { key: field.key, action: 'EDIT' as const, value: decision.value }
        : { key: field.key, action: 'ACCEPT' as const }
    }),
    heat:
      !state.heat || state.heat.action === 'IGNORE'
        ? { action: 'IGNORE' }
        : state.heat.action === 'EDIT'
          ? { action: 'EDIT', level: state.heat.level }
          : { action: 'ACCEPT' },
    actions: output.actions.slice(0, MAX_ACTIONS).map((action) => {
      const current = state.actions[action.id]
      return current?.decision === 'ACCEPT'
        ? { id: action.id, action: 'ACCEPT' as const, dueAt: current.dueAt }
        : { id: action.id, action: 'IGNORE' as const }
    }),
  }
}

export function countDecisions(output: CallAnalysisOutput, state: ReviewState) {
  let accepted = 0
  let ignored = 0
  let pending = 0
  const tally = (decision: 'ACCEPT' | 'EDIT' | 'IGNORE' | null | undefined) => {
    if (!decision) pending++
    else if (decision === 'IGNORE') ignored++
    else accepted++
  }
  output.fields.forEach((field) => tally(state.fields[field.key]?.action))
  tally(state.heat?.action)
  output.actions.slice(0, MAX_ACTIONS).forEach((action) => tally(state.actions[action.id]?.decision))
  return { accepted, ignored, pending }
}

/** Décision enregistrée pour un chemin (`budget`, `fields.budget`, `heat`, `actions.<id>`…). */
export function recordedDecision(review: AnalysisReview | null, key: string) {
  const match = review?.decisions.find((decision) => {
    const path = decision.path.replace(/^(fields|actions)[.[]/, '').replace(/\]$/, '')
    return path === key
  })
  return match as { action: ReviewAction; before: unknown; after: unknown } | undefined
}

export function reviewerName(review: AnalysisReview | null): string {
  return review && typeof review.by === 'object' ? (review.by.name ?? '') : ''
}
