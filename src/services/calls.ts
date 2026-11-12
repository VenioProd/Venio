import { apiFetch } from '../lib/api'

/** Routes « Appel » du lot A (contrat commun, préfixe /api/commercial). */

export interface CallsConfig {
  enabled: boolean
  callerId: string | null
  callingHours: unknown
  attemptCap: number | null
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

export const callsApi = {
  config: () => apiFetch<CallsConfig>('/api/commercial/calls/config'),
  token: () => apiFetch<VoiceToken>('/api/commercial/calls/token', { method: 'POST' }),
  create: (leadId: string, clientRequestId: string) =>
    apiFetch<{ callId: string }>(`/api/commercial/leads/${leadId}/calls`, {
      method: 'POST',
      body: JSON.stringify({ clientRequestId }),
    }),
  get: (callId: string) => apiFetch<CallRecord>(`/api/commercial/calls/${callId}`),
  hangup: (callId: string) =>
    apiFetch<{ status: CallStatus }>(`/api/commercial/calls/${callId}/hangup`, { method: 'POST' }),
}

/**
 * Relit l'appel jusqu'à ce que son état soit définitif : l'opérateur envoie son dernier état
 * un instant après la fin de la communication, et `suggestedOutcome` en dépend.
 */
export async function settleCall(
  callId: string,
  options: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<CallRecord | null> {
  const { attempts = 8, delayMs = 1500, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = options
  let last: CallRecord | null = null
  for (let index = 0; index < attempts; index += 1) {
    try {
      last = await callsApi.get(callId)
      if (FINAL_CALL_STATUSES.includes(last.status)) return last
    } catch {
      // Une lecture ratée ne doit pas faire perdre le résultat : on réessaie, puis on rend le dernier état connu.
    }
    if (index < attempts - 1) await sleep(delayMs)
  }
  return last
}
