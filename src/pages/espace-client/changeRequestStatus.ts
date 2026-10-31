import type { MessageKey } from '../../i18n'
import { formatDate, formatDateTime } from '../../i18n/format'
import type { ChangeRequestStatus } from '../../types/changeRequest.types'

/**
 * Libellés côté client : ils décrivent ce que le client doit comprendre, pas
 * l'état interne. « A_CHIFFRER » se lit donc « Devis en préparation ».
 */
export const CLIENT_STATUS_CONFIG: Record<ChangeRequestStatus, { labelKey: MessageKey; className: string }> = {
  SOUMISE: { labelKey: 'client.crStatus.submitted', className: 'client-status-pending' },
  A_CHIFFRER: { labelKey: 'client.crStatus.quotePending', className: 'client-status-pending' },
  PLANIFIEE: { labelKey: 'client.crStatus.planned', className: 'client-status-active' },
  EN_COURS: { labelKey: 'client.crStatus.inProgress', className: 'client-status-active' },
  LIVREE: { labelKey: 'client.crStatus.toConfirm', className: 'client-status-pending' },
  VALIDEE: { labelKey: 'client.crStatus.validated', className: 'client-status-done' },
  REFUSEE: { labelKey: 'client.crStatus.refused', className: 'client-status-cancelled' },
}

export const PRIORITY_LABELS: Record<string, MessageKey> = {
  BASSE: 'client.crPriority.low',
  NORMALE: 'client.crPriority.normal',
  HAUTE: 'client.crPriority.high',
}

/** Statuts non terminaux : ceux qui vivent encore. */
export const ACTIVE_CLIENT_STATUSES: ChangeRequestStatus[] = [
  'SOUMISE',
  'A_CHIFFRER',
  'PLANIFIEE',
  'EN_COURS',
  'LIVREE',
]

/** Regroupements de la planche « Demandes — liste client ». */
export const CLIENT_STATUS_GROUPS: { key: string; labelKey: MessageKey; statuses: ChangeRequestStatus[] | null }[] = [
  { key: 'all', labelKey: 'client.crGroup.all', statuses: null },
  {
    key: 'processing',
    labelKey: 'client.crGroup.processing',
    statuses: ['SOUMISE', 'A_CHIFFRER', 'PLANIFIEE', 'EN_COURS'],
  },
  { key: 'action', labelKey: 'client.crGroup.action', statuses: ['LIVREE'] },
  { key: 'done', labelKey: 'client.crGroup.done', statuses: ['VALIDEE', 'REFUSEE'] },
]

export function formatChangeRequestDate(iso: string): string {
  return formatDate(iso, { day: '2-digit', month: 'long', year: 'numeric' })
}

export function formatChangeRequestDateTime(iso: string): string {
  return formatDateTime(iso, {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}
