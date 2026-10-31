import type { DevCiStatus, DevIssuePriority } from '../../../services/dev'
import { translate, type MessageKey } from '../../../i18n'
import { formatDate } from '../../../i18n/format'
import { localizedLabels } from '../../../lib/localizedLabels'

export const PRIORITY_ICON: Record<DevIssuePriority, string> = {
  URGENT: '!!',
  HIGH: '⏶',
  MEDIUM: '=',
  LOW: '⏷',
  NO_PRIORITY: '·',
}

export const CI_STATUS_LABEL_KEYS = {
  PENDING: 'devA.ci.pending',
  RUNNING: 'devA.ci.running',
  SUCCESS: 'devA.ci.success',
  FAILURE: 'devA.ci.failure',
  UNKNOWN: 'devA.ci.unknown',
} as const satisfies Record<DevCiStatus, MessageKey>

export const CI_STATUS_LABEL: Record<DevCiStatus, string> = localizedLabels(CI_STATUS_LABEL_KEYS)

export function formatRelative(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const now = Date.now()
  const diff = now - d.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return translate('devA.time.justNow')
  if (diff < hour) return translate('devA.time.minutesAgo', { n: Math.floor(diff / minute) })
  if (diff < day) return translate('devA.time.hoursAgo', { n: Math.floor(diff / hour) })
  if (diff < 7 * day) return translate('devA.time.daysAgo', { n: Math.floor(diff / day) })
  return formatDate(d, { day: '2-digit', month: 'short' })
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
