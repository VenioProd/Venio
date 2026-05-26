import type { DevCiStatus, DevIssuePriority } from '../../../services/dev'

export const PRIORITY_ICON: Record<DevIssuePriority, string> = {
  URGENT: '!!',
  HIGH: '⏶',
  MEDIUM: '=',
  LOW: '⏷',
  NO_PRIORITY: '·',
}

export const CI_STATUS_LABEL: Record<DevCiStatus, string> = {
  PENDING: 'En attente',
  RUNNING: 'En cours',
  SUCCESS: 'Succès',
  FAILURE: 'Échec',
  UNKNOWN: 'Inconnu',
}

export function formatRelative(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const now = Date.now()
  const diff = now - d.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return "à l'instant"
  if (diff < hour) return `il y a ${Math.floor(diff / minute)} min`
  if (diff < day) return `il y a ${Math.floor(diff / hour)} h`
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

export function userInitial(u: { name?: string; email?: string } | null | undefined): string {
  if (!u) return '?'
  const name = u.name || u.email || ''
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

export type DeepLinkParams = { issueId?: string; projectId?: string } & Record<string, string | undefined>

export function ciStatusTone(status: DevCiStatus | null | undefined): 'ok' | 'warn' | 'fail' | 'neutral' {
  if (status === 'SUCCESS') return 'ok'
  if (status === 'PENDING' || status === 'RUNNING') return 'warn'
  if (status === 'FAILURE') return 'fail'
  return 'neutral'
}
