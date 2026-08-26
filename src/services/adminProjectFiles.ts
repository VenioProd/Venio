import { apiFetch } from '../lib/api'

export interface AdminProjectClientFile {
  id: string
  client: { id: string; name: string; companyName: string } | null
  category: 'LOGO' | 'TEXTE' | 'PHOTO' | 'BRIEF' | 'AUTRE'
  note: string
  originalName: string
  mimeType: string
  size: number
  createdAt: string
}

export function listProjectClientFiles(projectId: string): Promise<{ files: AdminProjectClientFile[] }> {
  return apiFetch(`/api/admin/projects/${projectId}/client-files`)
}

export function projectClientFileDownloadUrl(projectId: string, fileId: string): string {
  return `/api/admin/projects/${projectId}/client-files/${fileId}/download`
}
