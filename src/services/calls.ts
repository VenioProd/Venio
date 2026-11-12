import { apiFetch } from '../lib/api'
import type { AnalysisStatus, TranscriptStatus } from './callInsights'

/** Routes « Appel » du lot A et ajouts de la vague 2 (contrat commun). Le préfixe est un paramètre : `/api/commercial` côté commercial. */

export const DEFAULT_CALLS_PREFIX = '/api/commercial'

export interface CallsConfig {
  enabled: boolean
  callerId: string | null
  /** Edge Twilio à passer au `Device` (ex. `dublin`). */
  edge?: string | null
  callingHours: unknown
  attemptCap: number | null
  /** Vague 2 : l'enregistrement est actif, et l'annonce automatique est jouée ou non. */
  recording?: { enabled: boolean; notice: boolean }
}

/** NONE : pas d'enregistrement · RECORDING : en cours · STOPPED : arrêté (opposition), rien conservé · READY : prêt · DELETED : supprimé après transcription. */
export type RecordingStatus = 'NONE' | 'RECORDING' | 'STOPPED' | 'READY' | 'DELETED'

export interface CallRecording {
  status: RecordingStatus
  objection: boolean
}

export type CallStatus =
  'CREATED' | 'RINGING' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_ANSWER' | 'BUSY' | 'FAILED' | 'CANCELED'

/** États après lesquels le serveur ne change plus rien. */
export const FINAL_CALL_STATUSES: CallStatus[] = ['COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED', 'CANCELED']

export interface CallRecord {
  _id: string
  lead: string
  status: CallStatus
  startedAt: string | null
  answeredAt: string | null
  endedAt: string | null
  durationSec: number | null
  answeredBy: 'HUMAN' | 'MACHINE' | 'UNKNOWN'
  suggestedOutcome: string | null
  recording?: CallRecording
}

/** Une ligne de `GET /leads/:id/calls` : les 20 derniers appels de l'auteur sur la fiche. */
export interface LeadCall {
  _id: string
  /** Équipe seulement : l'appel d'un commercial externe sur une fiche transmise porte son auteur. */
  author?: { _id: string; name: string }
  /** Équipe seulement : vrai pour mes propres appels. */
  own?: boolean
  status: CallStatus
  startedAt: string | null
  answeredAt: string | null
  endedAt: string | null
  durationSec: number | null
  recording: CallRecording
  transcriptStatus: TranscriptStatus | null
  analysisStatus: AnalysisStatus | null
}

export interface VoiceToken {
  token: string
  identity: string
  expiresAt: string
}

/** Codes d'erreur renvoyés par le serveur ; ils sont portés par le message de l'erreur d'API. */
export const CALL_ERROR_CODES = [
  'TELEPHONY_DISABLED',
  'LEAD_NOT_CALLABLE',
  'PHONE_SUPPRESSED',
  'OUTSIDE_CALLING_HOURS',
  'ATTEMPT_CAP_REACHED',
] as const
export type CallErrorCode = (typeof CALL_ERROR_CODES)[number]

export function callErrorCode(err: unknown): CallErrorCode | null {
  const candidates: unknown[] = [(err as Error | undefined)?.message]
  const payload = (err as { payload?: unknown } | undefined)?.payload
  if (payload && typeof payload === 'object') {
    const { error, code, message } = payload as Record<string, unknown>
    candidates.push(error, code, message)
  }
  return CALL_ERROR_CODES.find((known) => candidates.includes(known)) ?? null
}

export function createCallsApi(prefix: string = DEFAULT_CALLS_PREFIX) {
  const call = (callId: string) => `${prefix}/calls/${encodeURIComponent(callId)}`
  return {
    config: () => apiFetch<CallsConfig>(`${prefix}/calls/config`),
    token: () => apiFetch<VoiceToken>(`${prefix}/calls/token`, { method: 'POST' }),
    create: (leadId: string, clientRequestId: string) =>
      apiFetch<{ callId: string }>(`${prefix}/leads/${encodeURIComponent(leadId)}/calls`, {
        method: 'POST',
        body: JSON.stringify({ clientRequestId }),
      }),
    get: (callId: string) => apiFetch<CallRecord>(call(callId)),
    hangup: (callId: string) => apiFetch<{ status: CallStatus }>(`${call(callId)}/hangup`, { method: 'POST' }),
    /** Les appels de la fiche, du plus récent au plus ancien. */
    forLead: (leadId: string) =>
      apiFetch<{ calls?: LeadCall[] }>(`${prefix}/leads/${encodeURIComponent(leadId)}/calls`).then(
        (data) => data.calls ?? [],
      ),
    /** Le prospect refuse l'enregistrement : arrêt immédiat, ce qui a été capté est effacé. Rejouable. */
    stopRecording: (callId: string) =>
      apiFetch<{ recording: CallRecording }>(`${call(callId)}/recording/stop`, { method: 'POST' }),
    /** Adresse de l'audio relayé par Venio (même origine, cookie de session) ; 404 s'il n'est pas conservé. */
    recordingUrl: (callId: string) => `${call(callId)}/recording`,
  }
}

export type CallsApi = ReturnType<typeof createCallsApi>

export const callsApi = createCallsApi()

/**
 * Relit l'appel jusqu'à ce que son état soit définitif : l'opérateur envoie son dernier état
 * un instant après la fin de la communication, et `suggestedOutcome` en dépend.
 */
export async function settleCall(
  callId: string,
  options: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void>; prefix?: string } = {},
): Promise<CallRecord | null> {
  const api = options.prefix && options.prefix !== DEFAULT_CALLS_PREFIX ? createCallsApi(options.prefix) : callsApi
  const { attempts = 8, delayMs = 1500, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = options
  let last: CallRecord | null = null
  for (let index = 0; index < attempts; index += 1) {
    try {
      last = await api.get(callId)
      if (FINAL_CALL_STATUSES.includes(last.status)) return last
    } catch {
      // Une lecture ratée ne doit pas faire perdre le résultat : on réessaie, puis on rend le dernier état connu.
    }
    if (index < attempts - 1) await sleep(delayMs)
  }
  return last
}
