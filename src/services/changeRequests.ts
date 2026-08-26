import { apiFetch, apiUpload } from '../lib/api'
import type {
  AdminChangeRequest,
  ChangeRequestStats,
  ClientChangeRequest,
  NewChangeRequestInput,
} from '../types/changeRequest.types'

const CLIENT_BASE = '/api/client/change-requests'
const ADMIN_BASE = '/api/admin/change-requests'

// ─── Espace client ──────────────────────────────────────────────────────────

export function listChangeRequests(status?: string): Promise<{ changeRequests: ClientChangeRequest[] }> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return apiFetch(`${CLIENT_BASE}${query}`)
}

export function getChangeRequest(id: string): Promise<{ changeRequest: ClientChangeRequest }> {
  return apiFetch(`${CLIENT_BASE}/${id}`)
}

export function createChangeRequest(input: NewChangeRequestInput): Promise<{ changeRequest: ClientChangeRequest }> {
  const formData = new FormData()
  formData.append('title', input.title)
  formData.append('description', input.description)
  if (input.pageUrl) formData.append('pageUrl', input.pageUrl)
  if (input.projectId) formData.append('projectId', input.projectId)
  if (input.priority) formData.append('priority', input.priority)
  ;(input.files ?? []).forEach((file) => formData.append('files', file))
  return apiUpload(CLIENT_BASE, formData)
}

export function replyToChangeRequest(
  id: string,
  message: string,
  files: File[] = [],
): Promise<{ changeRequest: ClientChangeRequest }> {
  const formData = new FormData()
  formData.append('message', message)
  files.forEach((file) => formData.append('files', file))
  return apiUpload(`${CLIENT_BASE}/${id}/reply`, formData)
}

export function validateChangeRequest(id: string): Promise<{ changeRequest: ClientChangeRequest }> {
  return apiFetch(`${CLIENT_BASE}/${id}/validate`, { method: 'POST' })
}

export function requestChangeRequestCorrection(
  id: string,
  comment: string,
): Promise<{ changeRequest: ClientChangeRequest }> {
  return apiFetch(`${CLIENT_BASE}/${id}/request-correction`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  })
}

export function clientFileUrl(filename: string): string {
  return `${CLIENT_BASE}/files/${encodeURIComponent(filename)}`
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export function listAdminChangeRequests(filters: {
  status?: string
  client?: string
  project?: string
}): Promise<{ changeRequests: AdminChangeRequest[] }> {
  const params = new URLSearchParams()
  if (filters.status && filters.status !== 'all') params.set('status', filters.status)
  if (filters.client && filters.client !== 'all') params.set('client', filters.client)
  if (filters.project && filters.project !== 'all') params.set('project', filters.project)
  const query = params.toString()
  return apiFetch(`${ADMIN_BASE}${query ? `?${query}` : ''}`)
}

export function getAdminChangeRequestStats(): Promise<ChangeRequestStats> {
  return apiFetch(`${ADMIN_BASE}/stats`)
}

export function getAdminChangeRequest(id: string): Promise<{ changeRequest: AdminChangeRequest }> {
  return apiFetch(`${ADMIN_BASE}/${id}`)
}

export function replyAsAdmin(
  id: string,
  message: string,
  files: File[] = [],
): Promise<{ changeRequest: AdminChangeRequest }> {
  const formData = new FormData()
  formData.append('message', message)
  files.forEach((file) => formData.append('files', file))
  return apiUpload(`${ADMIN_BASE}/${id}/reply`, formData)
}

export function qualifyInclude(id: string): Promise<{ changeRequest: AdminChangeRequest }> {
  return apiFetch(`${ADMIN_BASE}/${id}/qualify-include`, { method: 'POST' })
}

export function qualifyQuote(
  id: string,
  payload: { projectId?: string; expiresAt?: string },
): Promise<{ changeRequest: AdminChangeRequest; proposal: { _id: string; status: string } }> {
  return apiFetch(`${ADMIN_BASE}/${id}/qualify-quote`, { method: 'POST', body: JSON.stringify(payload) })
}

export function refuseChangeRequest(id: string, reason: string): Promise<{ changeRequest: AdminChangeRequest }> {
  return apiFetch(`${ADMIN_BASE}/${id}/refuse`, { method: 'POST', body: JSON.stringify({ reason }) })
}

export function startChangeRequest(id: string): Promise<{ changeRequest: AdminChangeRequest }> {
  return apiFetch(`${ADMIN_BASE}/${id}/start`, { method: 'POST' })
}

export function deliverChangeRequest(id: string): Promise<{ changeRequest: AdminChangeRequest }> {
  return apiFetch(`${ADMIN_BASE}/${id}/deliver`, { method: 'POST' })
}

export function adminFileUrl(filename: string): string {
  return `${ADMIN_BASE}/files/${encodeURIComponent(filename)}`
}

/** Route de devis existante, réutilisée depuis le détail d'une demande. */
export function sendLinkedProposal(proposalId: string): Promise<{ proposal: { status: string } }> {
  return apiFetch(`/api/admin/quote-proposals/${proposalId}/send`, { method: 'POST' })
}
