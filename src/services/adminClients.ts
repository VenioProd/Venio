import { apiFetch } from '../lib/api'
import type { PaginationMeta } from '../types/api.types'

function extractData<T = unknown>(response: unknown): T {
  if (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    (response as Record<string, unknown>).data !== undefined
  ) {
    return (response as Record<string, unknown>).data as T
  }
  return response as T
}

function extractMeta(response: unknown): PaginationMeta | null {
  if (
    response &&
    typeof response === 'object' &&
    'meta' in response &&
    (response as Record<string, unknown>).meta !== undefined
  ) {
    return (response as Record<string, unknown>).meta as PaginationMeta
  }
  return null
}

export async function listAdminClients(params: Record<string, unknown> = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query.set(key, String(value))
  }
  const suffix = query.toString() ? `?${query.toString()}` : ''
  const response = await apiFetch(`/api/admin/clients${suffix}`)
  return {
    ...(extractData(response) || {}),
    meta: extractMeta(response),
  }
}

export async function createAdminClient(payload: Record<string, unknown>) {
  const response = await apiFetch('/api/admin/clients', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return extractData(response)
}

export async function getAdminClient(clientId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}`)
  return extractData(response)
}

export async function getAdminClientCloud(clientId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/cloud`)
  return extractData(response)
}

export async function updateAdminClient(clientId: string, payload: Record<string, unknown>) {
  const response = await apiFetch(`/api/admin/clients/${clientId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return extractData(response)
}

export async function archiveAdminClient(clientId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/archive`, {
    method: 'POST',
  })
  return extractData(response)
}

export async function reactivateAdminClient(clientId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/reactivate`, {
    method: 'POST',
  })
  return extractData(response)
}

export async function listAdminClientProjects(clientId: string, params: Record<string, unknown> = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query.set(key, String(value))
  }
  const suffix = query.toString() ? `?${query.toString()}` : ''
  const response = await apiFetch(`/api/admin/clients/${clientId}/projects${suffix}`)
  return extractData(response)
}

export async function getAdminClientProgress(clientId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/progress`)
  return extractData(response)
}

export async function listAdminClientDeliverables(clientId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/deliverables`)
  return extractData(response)
}

export async function listAdminClientContacts(clientId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/contacts`)
  return extractData(response)
}

export async function createAdminClientContact(clientId: string, payload: Record<string, unknown>) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/contacts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return extractData(response)
}

export async function updateAdminClientContact(clientId: string, contactId: string, payload: Record<string, unknown>) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/contacts/${contactId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return extractData(response)
}

export async function deleteAdminClientContact(clientId: string, contactId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/contacts/${contactId}`, {
    method: 'DELETE',
  })
  return extractData(response)
}

export async function listAdminClientNotes(clientId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/notes`)
  return extractData(response)
}

export async function createAdminClientNote(clientId: string, payload: Record<string, unknown>) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/notes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return extractData(response)
}

export async function updateAdminClientNote(clientId: string, noteId: string, payload: Record<string, unknown>) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/notes/${noteId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return extractData(response)
}

export async function deleteAdminClientNote(clientId: string, noteId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/notes/${noteId}`, {
    method: 'DELETE',
  })
  return extractData(response)
}

export async function listAdminClientActivities(clientId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/activities`)
  return extractData(response)
}

export async function getAdminClientBillingSummary(clientId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/billing/summary`)
  return extractData(response)
}

export async function listAdminClientBillingDocuments(clientId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/billing/documents`)
  return extractData(response)
}

export async function listAdminClientFiles(clientId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/files`)
  return extractData(response)
}

export function adminClientFileDownloadUrl(clientId: string, fileId: string): string {
  return `/api/admin/clients/${clientId}/files/${fileId}/download`
}
