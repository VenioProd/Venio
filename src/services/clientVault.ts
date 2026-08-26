import { apiFetch } from '../lib/api'
import type { ClientActionItem, ClientVaultDocument } from '../types/clientVault.types'

export function listClientDocuments(
  params: { type?: string; projectId?: string; q?: string } = {},
): Promise<{ documents: ClientVaultDocument[] }> {
  const query = new URLSearchParams()
  if (params.type) query.set('type', params.type)
  if (params.projectId) query.set('projectId', params.projectId)
  if (params.q) query.set('q', params.q)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/client/documents${suffix}`)
}

export function listClientActionItems(): Promise<{ items: ClientActionItem[] }> {
  return apiFetch('/api/client/action-items')
}
