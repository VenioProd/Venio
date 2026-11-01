import type { MessageKey } from '../../../i18n'
import { formatDate, formatDateTime } from '../../../i18n/format'
import type { ChangeRequestStatus } from '../../../types/changeRequest.types'

/** Libellés admin : ils décrivent l'action attendue côté Venio. */
export const ADMIN_STATUS_CONFIG: Record<ChangeRequestStatus, { labelKey: MessageKey; color: string }> = {
  SOUMISE: { labelKey: 'changeReq.status.submitted', color: 'var(--warning)' },
  A_CHIFFRER: { labelKey: 'changeReq.status.quoteToSend', color: 'var(--cat-2)' },
  PLANIFIEE: { labelKey: 'changeReq.status.planned', color: 'var(--primary)' },
  EN_COURS: { labelKey: 'changeReq.status.inProgress', color: 'var(--primary)' },
  LIVREE: { labelKey: 'changeReq.status.delivered', color: 'var(--warning)' },
  VALIDEE: { labelKey: 'changeReq.status.validated', color: 'var(--good)' },
  REFUSEE: { labelKey: 'changeReq.status.refused', color: 'var(--text-secondary)' },
}

export const ADMIN_PRIORITY_CONFIG: Record<string, { labelKey: MessageKey; color: string }> = {
  BASSE: { labelKey: 'changeReq.priority.low', color: 'var(--text-secondary)' },
  NORMALE: { labelKey: 'changeReq.priority.normal', color: 'var(--primary)' },
  HAUTE: { labelKey: 'changeReq.priority.high', color: 'var(--warning)' },
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
