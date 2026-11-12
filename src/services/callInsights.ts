import { apiFetch, ApiError } from '../lib/api'

/**
 * Transcript et analyse d'un appel — formes du contrat « poste d'appel et IA »
 * (sections « Transcription (lot C) » et « Analyse (lot D) »).
 * Le préfixe d'API est un paramètre : `/api/commercial` côté commercial, autre côté équipe.
 */

// ─── Transcript (lot C) ─────────────────────────────────────────────────────

export type TranscriptStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'SKIPPED'
export type Speaker = 'REP' | 'PROSPECT'

export interface TranscriptSegment {
  speaker: Speaker
  startMs: number
  endMs: number
  text: string
}

export interface CallTranscript {
  status: TranscriptStatus
  language: string
  segments: TranscriptSegment[]
  durationSec: number | null
}

// ─── Analyse (lot D) ────────────────────────────────────────────────────────

export type FieldKey =
  | 'budget'
  | 'expectedCloseAt'
  | 'serviceType'
  | 'sector'
  | 'companySize'
  | 'contactName'
  | 'contactEmail'
  | 'qualification.need'
  | 'qualification.timeline'
  | 'qualification.decisionMaker'
  | 'qualification.objections'
  | 'qualification.competitors'

export type FieldValue = string | number | string[] | null
export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH'

export interface ProposedField {
  key: FieldKey
  value: FieldValue
  confidence: Confidence
  quote: string
  /** Posé par le serveur, jamais par le modèle : faux = la citation n'a pas été retrouvée dans le transcript. */
  quoteVerified: boolean
}

export type HeatLevel = 'FROID' | 'TIEDE' | 'CHAUD' | 'TRES_CHAUD'
export const HEAT_LEVELS: HeatLevel[] = ['FROID', 'TIEDE', 'CHAUD', 'TRES_CHAUD']

export interface HeatCriterion {
  key: string
  label: string
  points: number
  max: number
  quote: string | null
}

export interface HeatProposal {
  score: number
  level: HeatLevel
  criteria: HeatCriterion[]
}

export type ActionType = 'CALL' | 'EMAIL' | 'MEETING' | 'TASK' | 'SEQUENCE' | 'HANDOFF'

export interface ProposedAction {
  id: string
  type: ActionType
  label: string
  dueAt: string | null
  reason: string
}

export interface CallAnalysisOutput {
  summary: string
  suggestedOutcome: string | null
  optOut: { detected: boolean; quote: string | null }
  fields: ProposedField[]
  heat: HeatProposal
  actions: ProposedAction[]
}

export type AnalysisStatus = 'PENDING' | 'READY' | 'APPLIED' | 'PARTIAL' | 'REJECTED' | 'FAILED'
export type ReviewAction = 'ACCEPT' | 'EDIT' | 'IGNORE'

export interface AnalysisReview {
  /** Identifiant seul dans le contrat ; un objet `{ _id, name }` si le serveur peuple l'auteur de la validation. */
  by: string | { _id: string; name?: string }
  at: string
  decisions: { path: string; action: ReviewAction; before: unknown; after: unknown }[]
}

export interface CallAnalysis {
  _id: string
  status: AnalysisStatus
  output: CallAnalysisOutput | null
  review: AnalysisReview | null
}

/** Retenue d'une fiche après une opposition détectée par l'analyse (`Lead.callHold`). */
export interface CallHold {
  at: string
  reason: string
  /** L'appel dont l'analyse a posé la retenue. */
  call?: string | null
}

export interface AnalysisResponse {
  analysis: CallAnalysis
  /** Valeurs actuellement enregistrées sur la fiche, par clé de champ (plus `leadTemperature`, `nextActionAt`, `callHold`). */
  current: Record<string, unknown>
  /** Champs que l'auteur peut accepter ; les autres reviennent à l'équipe. Absent : tous. */
  acceptableKeys?: FieldKey[]
}

export interface ApplyInput {
  clientRequestId: string
  fields: { key: FieldKey; action: ReviewAction; value?: FieldValue }[]
  heat: { action: ReviewAction; level?: HeatLevel }
  actions: { id: string; action: 'ACCEPT' | 'IGNORE'; label?: string; dueAt?: string | null }[]
}

export const DEFAULT_API_PREFIX = '/api/commercial'

// ─── Appels ─────────────────────────────────────────────────────────────────

/** `null` quand le serveur répond 404 : pas de transcript / pas d'analyse pour cet appel. */
async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export function createCallInsightsApi(prefix: string = DEFAULT_API_PREFIX) {
  const base = (callId: string) => `${prefix}/calls/${encodeURIComponent(callId)}`
  const post = (path: string, body?: unknown) =>
    apiFetch<{ analysis: CallAnalysis }>(path, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  return {
    transcript: (callId: string) => orNull(apiFetch<CallTranscript>(`${base(callId)}/transcript`)),
    analysis: (callId: string) => orNull(apiFetch<AnalysisResponse>(`${base(callId)}/analysis`)),
    apply: (callId: string, input: ApplyInput) =>
      apiFetch<{ lead: unknown; analysis: CallAnalysis }>(`${base(callId)}/analysis/apply`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    reject: (callId: string) => post(`${base(callId)}/analysis/reject`),
    retry: (callId: string) => post(`${base(callId)}/analysis/retry`),
    /** Opposition détectée : l'externe peut seulement confirmer ; lever la retenue revient à l'équipe. */
    optOut: (callId: string, action: 'CONFIRM' | 'DISMISS') =>
      apiFetch<{ lead: unknown }>(`${base(callId)}/analysis/opt-out`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
  }
}

export type CallInsightsApi = ReturnType<typeof createCallInsightsApi>

/**
 * Code d'erreur métier d'une réponse d'erreur. Le serveur répond `{ error: <message>, code: 'LEAD_HANDED_OFF', …détails }` ;
 * des routes plus anciennes mettent le code dans `error`. Chaîne vide si rien d'exploitable.
 */
export function apiErrorCode(error: unknown): string {
  if (!(error instanceof ApiError)) return ''
  const payload = error.payload
  if (typeof payload === 'object' && payload !== null) {
    const { code, error: legacy } = payload as Record<string, unknown>
    if (typeof code === 'string' && code) return code
    if (typeof legacy === 'string' && /^[A-Z][A-Z0-9_]+$/.test(legacy)) return legacy
  }
  return ''
}

/** Champ visé par une erreur de validation (`key` dans les détails de la réponse), sinon chaîne vide. */
export function apiErrorKey(error: unknown): string {
  if (!(error instanceof ApiError)) return ''
  const payload = error.payload
  const key = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>).key : null
  return typeof key === 'string' ? key : ''
}
