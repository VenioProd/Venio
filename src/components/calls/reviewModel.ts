import { formatDate, formatMoney } from '../../i18n/format'
import type {
  ActionChoices,
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
  /** Libellé modifié par la personne ; absent : celui de la proposition. */
  label?: string
  /** `SEQUENCE` : séquence choisie. */
  sequenceId?: string
  /** `HANDOFF` de l'équipe : membre à qui passer la main. */
  assigneeId?: string
}

export interface ReviewState {
  fields: Partial<Record<FieldKey, FieldDecision>>
  heat: HeatDecision | null
  actions: Record<string, ActionState>
}

export const MAX_ACTIONS = 3

/** Actions qui demandent un choix (séquence, membre) : acceptables seulement si le serveur fournit les choix. */
export const CHOICE_ACTIONS: readonly string[] = ['SEQUENCE', 'HANDOFF']
export const isActionAcceptable = (action: { type: string }, choices?: ActionChoices) =>
  !CHOICE_ACTIONS.includes(action.type) || (Boolean(choices) && !choices!.teamOnly.includes(action.type as never))
/** Choix encore manquant pour pouvoir accepter : la séquence, ou le membre qui reprend la fiche. */
export function missingChoice(
  action: { type: string },
  state: ActionState | undefined,
  choices?: ActionChoices,
): 'sequence' | 'member' | null {
  if (action.type === 'SEQUENCE' && !state?.sequenceId) return 'sequence'
  if (action.type === 'HANDOFF' && choices?.handoff === 'MEMBER' && !state?.assigneeId) return 'member'
  return null
}

/** Vrai si la clé peut être acceptée par l'auteur ; sans liste (`acceptableKeys` absent), toutes le peuvent. */
export const isKeyAcceptable = (acceptableKeys: readonly string[] | undefined, key: string) =>
  !acceptableKeys || acceptableKeys.includes(key)

export function initialState(output: CallAnalysisOutput, choices?: ActionChoices): ReviewState {
  return {
    fields: {},
    heat: null,
    actions: Object.fromEntries(
      output.actions.slice(0, MAX_ACTIONS).map((a) => {
        // Séquence préremplie quand l'analyse en nomme une.
        const sequenceId = a.type === 'SEQUENCE' ? choices?.suggestedSequences[a.id] : undefined
        return [a.id, { decision: null, dueAt: a.dueAt, ...(sequenceId ? { sequenceId } : {}) }]
      }),
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
export function buildApplyInput(
  output: CallAnalysisOutput,
  state: ReviewState,
  clientRequestId: string,
  choices?: ActionChoices,
): ApplyInput {
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
      if (current?.decision !== 'ACCEPT' || !isActionAcceptable(action, choices))
        return { id: action.id, action: 'IGNORE' as const }
      if (action.type === 'SEQUENCE')
        return { id: action.id, action: 'ACCEPT' as const, sequenceId: current.sequenceId }
      if (action.type === 'HANDOFF')
        return {
          id: action.id,
          action: 'ACCEPT' as const,
          ...(choices?.handoff === 'MEMBER' ? { assigneeId: current.assigneeId } : {}),
        }
      const label = current.label?.trim()
      return {
        id: action.id,
        action: 'ACCEPT' as const,
        dueAt: current.dueAt,
        ...(label && label !== action.label ? { label } : {}),
      }
    }),
  }
}

export function countDecisions(
  output: CallAnalysisOutput,
  state: ReviewState,
  acceptableKeys?: readonly string[],
  choices?: ActionChoices,
) {
  let accepted = 0
  let ignored = 0
  let pending = 0
  const tally = (decision: 'ACCEPT' | 'EDIT' | 'IGNORE' | null | undefined) => {
    if (!decision) pending++
    else if (decision === 'IGNORE') ignored++
    else accepted++
  }
  // Un champ réservé à l'équipe n'est pas à décider ici : il part en IGNORE.
  output.fields
    .filter((field) => isKeyAcceptable(acceptableKeys, field.key))
    .forEach((field) => tally(state.fields[field.key]?.action))
  tally(state.heat?.action)
  // Les actions qu'on ne peut pas accepter ne sont ni à décider ni comptées : elles partent en IGNORE.
  output.actions
    .slice(0, MAX_ACTIONS)
    .filter((action) => isActionAcceptable(action, choices))
    .forEach((action) => tally(state.actions[action.id]?.decision))
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
