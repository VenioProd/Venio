import type { MessageKey } from '../../../i18n'
import { formatDate, formatDateTime } from '../../../i18n/format'
import type { ChangeRequestStatus } from '../../../types/changeRequest.types'

/** Libellés admin : ils décrivent l'action attendue côté Venio. */
export const ADMIN_STATUS_CONFIG: Record<ChangeRequestStatus, { labelKey: MessageKey; color: string }> = {
  SOUMISE: { labelKey: 'changeReq.status.submitted', color: '#f59e0b' },
  A_CHIFFRER: { labelKey: 'changeReq.status.quoteToSend', color: '#8b5cf6' },
  PLANIFIEE: { labelKey: 'changeReq.status.planned', color: '#0ea5e9' },
  EN_COURS: { labelKey: 'changeReq.status.inProgress', color: '#0ea5e9' },
  LIVREE: { labelKey: 'changeReq.status.delivered', color: '#f59e0b' },
  VALIDEE: { labelKey: 'changeReq.status.validated', color: '#22c55e' },
  REFUSEE: { labelKey: 'changeReq.status.refused', color: '#64748b' },
}

export const ADMIN_PRIORITY_CONFIG: Record<string, { labelKey: MessageKey; color: string }> = {
  BASSE: { labelKey: 'changeReq.priority.low', color: '#64748b' },
  NORMALE: { labelKey: 'changeReq.priority.normal', color: '#0ea5e9' },
  HAUTE: { labelKey: 'changeReq.priority.high', color: '#f59e0b' },
}

export const ADMIN_STATUS_ORDER: ChangeRequestStatus[] = [
  'SOUMISE',
  'A_CHIFFRER',
  'PLANIFIEE',
  'EN_COURS',
  'LIVREE',
  'VALIDEE',
  'REFUSEE',
]

export function formatAdminDate(iso: string): string {
  return formatDate(iso, { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatAdminDateTime(iso: string): string {
  return formatDateTime(iso, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
