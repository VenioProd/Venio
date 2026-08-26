export type WebhookDeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED'
export type WebhookDisabledReason = 'AUTO_FAILURES' | 'MANUAL' | null

export interface WebhookEndpoint {
  _id: string
  name: string
  url: string
  eventTypes: string[]
  isActive: boolean
  consecutiveFailures: number
  disabledAt: string | null
  disabledReason: WebhookDisabledReason
  lastSuccessAt: string | null
  lastFailureAt: string | null
  createdBy?: { _id: string; name?: string; email?: string } | null
  createdAt: string
  updatedAt: string
}

export interface WebhookDeliveryAttempt {
  at: string
  httpStatus: number | null
  error: string
  durationMs: number
}

export interface WebhookDelivery {
  _id: string
  endpoint: string | { _id: string; name: string; url: string; isActive: boolean }
  eventId: string
  eventType: string
  payload?: Record<string, unknown>
  status: WebhookDeliveryStatus
  attempts: WebhookDeliveryAttempt[]
  nextRetryAt: string | null
  createdAt: string
}

export interface DeliveryOutcome {
  ok: boolean
  httpStatus: number | null
  error: string
  durationMs: number
  status: WebhookDeliveryStatus
}

export interface EndpointFormState {
  name: string
  url: string
  eventTypes: string[]
}

export const emptyEndpointForm: EndpointFormState = { name: '', url: '', eventTypes: [] }

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const STATUS_LABELS: Record<WebhookDeliveryStatus, string> = {
  PENDING: 'En attente',
  DELIVERED: 'Livré',
  FAILED: 'Échoué',
}

export function statusLabel(status: WebhookDeliveryStatus): string {
  return STATUS_LABELS[status] || status
}

/**
 * Libellés lisibles des types d'événement. Le catalogue faisant foi vient du
 * serveur : tout type sans libellé s'affiche tel quel plutôt que d'être masqué.
 */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  TASK_ASSIGNED: 'Tâche assignée',
  TASK_UPDATED: 'Tâche mise à jour',
  PROJECT_UPDATE: 'Annonce de projet',
  DOCUMENT_ADDED: 'Document ajouté',
  TICKET_CREATED: 'Ticket créé',
  TICKET_REPLY: 'Réponse à un ticket',
  TICKET_STATUS_CHANGED: 'Statut de ticket modifié',
  TICKET_ASSIGNED: 'Ticket assigné',
  INTERNAL_MESSAGE: 'Message interne',
  DECISION_SUBMITTED: 'Décision soumise',
  DECISION_APPROVED: 'Décision approuvée',
  DECISION_REJECTED: 'Décision rejetée',
  DECISION_IMPROVEMENT: 'Décision à améliorer',
  INTERN_CREATED: 'Stagiaire créé',
  INTERN_REPORT_SUBMITTED: 'Rapport de stage soumis',
  INTERN_REPORT_UPDATED: 'Rapport de stage mis à jour',
  INTERN_CONVENTION_ADDED: 'Convention de stage ajoutée',
  INTERN_CREDENTIALS_SENT: 'Identifiants stagiaire envoyés',
  INTERNAL_PROJECT_CREATED: 'Projet interne créé',
  INTERNAL_MISSION_ASSIGNED: 'Mission interne assignée',
  INTERNAL_MISSION_REVIEW_REQUESTED: 'Revue de mission demandée',
  INTERNAL_MISSION_VALIDATED: 'Mission interne validée',
  INTERNAL_MISSION_FILE_ADDED: 'Fichier de mission ajouté',
  BILLING_QUOTE_CREATED: 'Devis créé',
  BILLING_INVOICE_CREATED: 'Facture créée',
  BILLING_DOCUMENT_SENT: 'Document de facturation envoyé',
  BILLING_DOCUMENT_PAID: 'Document de facturation payé',
  CRM_LEAD_CREATED: 'Lead créé',
  CRM_LEAD_ASSIGNED: 'Lead assigné',
  CRM_LEAD_STATUS_CHANGED: 'Statut de lead modifié',
  CRM_LEAD_CONVERTED: 'Lead converti',
  DEV_ISSUE_ASSIGNED: 'Issue dev assignée',
  DEV_ISSUE_STATUS_CHANGED: 'Statut d’issue dev modifié',
  QUALIOPI_INDICATOR_UPDATED: 'Indicateur Qualiopi mis à jour',
  QUALIOPI_QUESTIONNAIRE_RECEIVED: 'Questionnaire Qualiopi reçu',
  CLIENT_CREATED: 'Client créé',
  CLIENT_NOTE_ADDED: 'Note client ajoutée',
  PROJECT_ITEM_CREATED: 'Élément de projet créé',
  PROJECT_ITEM_VALIDATED: 'Élément de projet validé',
  TOOL_ACCESS_GRANTED: 'Accès outil accordé',
  RESOURCE_REQUESTED: 'Ressource demandée',
  ADMIN_CREATED: 'Administrateur créé',
  ADMIN_ROLE_CHANGED: 'Rôle administrateur modifié',
  ADMIN_PERMISSIONS_CHANGED: 'Permissions administrateur modifiées',
  TWO_FACTOR_ENABLED: 'Double authentification activée',
  TWO_FACTOR_DISABLED: 'Double authentification désactivée',
  AGENT_TOKEN_CREATED: 'Token agent créé',
  AGENT_TOKEN_REVOKED: 'Token agent révoqué',
  SENSITIVE_ACTION_EXECUTED: 'Action sensible exécutée',
  BRIEF_ASSIGNED: 'Brief assigné',
  BRIEF_STATUS_CHANGED: 'Statut de brief modifié',
  WEBHOOK_TEST: 'Test de webhook',
  WEBHOOK_ENDPOINT_DISABLED: 'Endpoint désactivé',
}

export function eventTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] || type
}
