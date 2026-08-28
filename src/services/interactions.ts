import { apiFetch } from '../lib/api'
import type {
  InteractionSubjectType,
  LogInteractionInput,
  SendEmailInput,
  SendEmailResult,
  TimelineResponse,
} from '../types/interaction.types'

const BASE = '/api/admin/interactions'

export function fetchTimeline(
  subjectType: InteractionSubjectType,
  subjectId: string,
  limit?: number,
): Promise<TimelineResponse> {
  const query = limit ? `?limit=${limit}` : ''
  return apiFetch(`${BASE}/${subjectType}/${subjectId}/timeline${query}`)
}

export function logInteraction(
  subjectType: InteractionSubjectType,
  subjectId: string,
  input: LogInteractionInput,
): Promise<{ interaction: { _id: string } }> {
  return apiFetch(`${BASE}/${subjectType}/${subjectId}`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateInteraction(id: string, input: { body?: string; pinned?: boolean }): Promise<unknown> {
  return apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteInteraction(id: string): Promise<unknown> {
  return apiFetch(`${BASE}/${id}`, { method: 'DELETE' })
}

export function sendInteractionEmail(
  subjectType: InteractionSubjectType,
  subjectId: string,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  return apiFetch(`${BASE}/${subjectType}/${subjectId}/email`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
