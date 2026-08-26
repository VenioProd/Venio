import { apiFetch } from '../lib/api'

export type NotificationChannel = 'inApp' | 'push' | 'email'

export interface ChannelPreferences {
  inApp: boolean
  push: boolean
  email: boolean
}

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_UPDATED'
  | 'PROJECT_UPDATE'
  | 'DOCUMENT_ADDED'
  | 'TICKET_CREATED'
  | 'TICKET_REPLY'
  | 'INTERNAL_MESSAGE'
  | 'WEBHOOK_ENDPOINT_DISABLED'
  | 'WEBHOOK_TEST'

export interface PreferencesResponse {
  preferences: Record<NotificationType, ChannelPreferences>
  types: NotificationType[]
}

export async function fetchNotificationPreferences(): Promise<PreferencesResponse> {
  return apiFetch<PreferencesResponse>('/api/notification-preferences')
}

export async function updateNotificationPreferences(
  preferences: Partial<Record<NotificationType, Partial<ChannelPreferences>>>,
): Promise<PreferencesResponse> {
  return apiFetch<PreferencesResponse>('/api/notification-preferences', {
    method: 'PATCH',
    body: JSON.stringify({ preferences }),
  })
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, { label: string; description: string }> = {
  TASK_ASSIGNED: {
    label: 'Tâche assignée',
    description: 'Une nouvelle tâche t’est confiée.',
  },
  TASK_UPDATED: {
    label: 'Mise à jour de tâche / projet',
    description: 'Mises à jour des tâches, messages clients sur un projet.',
  },
  PROJECT_UPDATE: {
    label: 'Annonce de projet',
    description: 'Nouvelle annonce ou avancée importante sur un projet.',
  },
  DOCUMENT_ADDED: {
    label: 'Document ajouté',
    description: 'Un livrable, devis ou facture a été ajouté.',
  },
  TICKET_CREATED: {
    label: 'Nouveau ticket',
    description: 'Un ticket de support a été ouvert.',
  },
  TICKET_REPLY: {
    label: 'Réponse à un ticket',
    description: 'Quelqu’un a répondu à un ticket auquel tu participes.',
  },
  INTERNAL_MESSAGE: {
    label: 'Messagerie interne',
    description: 'Messages dans la messagerie interne (channels et DM).',
  },
  WEBHOOK_ENDPOINT_DISABLED: {
    label: 'Webhook désactivé',
    description: 'Un endpoint de webhook a été désactivé après des échecs répétés.',
  },
  WEBHOOK_TEST: {
    label: 'Test de webhook',
    description: 'Événement réservé aux envois de test depuis la page Webhooks.',
  },
}
