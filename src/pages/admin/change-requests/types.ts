import type { ChangeRequestStatus } from '../../../types/changeRequest.types'

/** Libellés admin : ils décrivent l'action attendue côté Venio. */
export const ADMIN_STATUS_CONFIG: Record<ChangeRequestStatus, { label: string; color: string }> = {
  SOUMISE: { label: 'À qualifier', color: '#f59e0b' },
  A_CHIFFRER: { label: 'Devis à envoyer', color: '#8b5cf6' },
  PLANIFIEE: { label: 'Planifiée', color: '#0ea5e9' },
  EN_COURS: { label: 'En cours', color: '#0ea5e9' },
  LIVREE: { label: 'Livrée · à confirmer', color: '#f59e0b' },
  VALIDEE: { label: 'Validée', color: '#22c55e' },
  REFUSEE: { label: 'Refusée', color: '#64748b' },
}

export const ADMIN_PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  BASSE: { label: 'Basse', color: '#64748b' },
  NORMALE: { label: 'Normale', color: '#0ea5e9' },
  HAUTE: { label: 'Haute', color: '#f59e0b' },
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
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatAdminDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
