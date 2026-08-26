import { apiFetch } from '../lib/api'
import type {
  DeliveryOutcome,
  EndpointFormState,
  WebhookDelivery,
  WebhookEndpoint,
} from '../pages/admin/webhooks/types'

const BASE = '/api/admin/webhooks'

export function listWebhooks(): Promise<{ endpoints: WebhookEndpoint[]; eventTypes: string[] }> {
  return apiFetch(BASE)
}

export function createWebhook(input: EndpointFormState): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
  return apiFetch(BASE, { method: 'POST', body: JSON.stringify(input) })
}

export function updateWebhook(
  id: string,
  input: Partial<EndpointFormState> & { isActive?: boolean },
): Promise<{ endpoint: WebhookEndpoint }> {
  return apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function rotateWebhookSecret(id: string): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
  return apiFetch(`${BASE}/${id}/rotate-secret`, { method: 'POST' })
}

export function testWebhook(id: string): Promise<{ delivery: WebhookDelivery; outcome: DeliveryOutcome | null }> {
  return apiFetch(`${BASE}/${id}/test`, { method: 'POST' })
}

export function deleteWebhook(id: string): Promise<{ ok: true; deletedDeliveries: number }> {
  return apiFetch(`${BASE}/${id}`, { method: 'DELETE' })
}

export function listDeliveries(
  endpointId: string,
  params: { status?: string; eventType?: string; page?: number } = {},
): Promise<{ deliveries: WebhookDelivery[]; total: number; page: number; pages: number }> {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.eventType) query.set('eventType', params.eventType)
  query.set('page', String(params.page || 1))
  return apiFetch(`${BASE}/${endpointId}/deliveries?${query.toString()}`)
}

export function getDelivery(deliveryId: string): Promise<{ delivery: WebhookDelivery }> {
  return apiFetch(`${BASE}/deliveries/${deliveryId}`)
}

export function replayDelivery(
  deliveryId: string,
): Promise<{ delivery: WebhookDelivery; outcome: DeliveryOutcome | null }> {
  return apiFetch(`${BASE}/deliveries/${deliveryId}/replay`, { method: 'POST' })
}
