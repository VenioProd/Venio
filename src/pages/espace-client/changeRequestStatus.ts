import type { ChangeRequestStatus } from '../../types/changeRequest.types'

/**
 * Libellés côté client : ils décrivent ce que le client doit comprendre, pas
 * l'état interne. « A_CHIFFRER » se lit donc « Devis en préparation ».
 */
export const CLIENT_STATUS_CONFIG: Record<ChangeRequestStatus, { label: string; className: string }> = {
  SOUMISE: { label: 'Soumise', className: 'client-status-pending' },
  A_CHIFFRER: { label: 'Devis en préparation', className: 'client-status-pending' },
  PLANIFIEE: { label: 'Planifiée', className: 'client-status-active' },
  EN_COURS: { label: 'En cours', className: 'client-status-active' },
  LIVREE: { label: 'À confirmer', className: 'client-status-pending' },
  VALIDEE: { label: 'Validée', className: 'client-status-done' },
  REFUSEE: { label: 'Refusée', className: 'client-status-cancelled' },
}

export const PRIORITY_LABELS: Record<string, string> = {
  BASSE: 'Basse',
  NORMALE: 'Normale',
  HAUTE: 'Haute',
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
export const CLIENT_STATUS_GROUPS: { key: string; label: string; statuses: ChangeRequestStatus[] | null }[] = [
  { key: 'all', label: 'Toutes', statuses: null },
  { key: 'processing', label: 'En traitement', statuses: ['SOUMISE', 'A_CHIFFRER', 'PLANIFIEE', 'EN_COURS'] },
  { key: 'action', label: 'Votre action attendue', statuses: ['LIVREE'] },
  { key: 'done', label: 'Terminées', statuses: ['VALIDEE', 'REFUSEE'] },
]

export function formatChangeRequestDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function formatChangeRequestDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}
