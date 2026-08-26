import { apiFetch, apiUpload } from '../lib/api'
import type { ClientUploadFile } from '../types/clientVault.types'

export function listClientFiles(
  params: { projectId?: string; q?: string } = {},
): Promise<{ files: ClientUploadFile[] }> {
  const query = new URLSearchParams()
  if (params.projectId) query.set('projectId', params.projectId)
  if (params.q) query.set('q', params.q)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/client/files${suffix}`)
}

export function uploadClientFiles(formData: FormData): Promise<{ files: ClientUploadFile[] }> {
  return apiUpload('/api/client/files', formData)
}

export function deleteClientFile(fileId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/client/files/${fileId}`, { method: 'DELETE' })
}

export function clientFileDownloadUrl(fileId: string): string {
  return `/api/client/files/${fileId}/download`
}
