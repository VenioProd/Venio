import { formatDateTime as formatDateTimeIntl } from '../../../i18n/format'
import { translate, type MessageKey } from '../../../i18n'

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
  return formatDateTimeIntl(iso) || '—'
}

const STATUS_LABEL_KEYS = {
  PENDING: 'adminTech.webhooks.status.pending',
  DELIVERED: 'adminTech.webhooks.status.delivered',
  FAILED: 'adminTech.webhooks.status.failed',
} as const satisfies Record<WebhookDeliveryStatus, MessageKey>

export function statusLabel(status: WebhookDeliveryStatus): string {
  const key = STATUS_LABEL_KEYS[status]
  return key ? translate(key) : status
}

/**
 * Clés des libellés lisibles des types d'événement. Le catalogue faisant foi
 * vient du serveur : tout type sans libellé s'affiche tel quel plutôt que
 * d'être masqué.
 */
export const EVENT_TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  TASK_ASSIGNED: 'adminTech.webhooks.event.taskAssigned',
  TASK_UPDATED: 'adminTech.webhooks.event.taskUpdated',
  PROJECT_UPDATE: 'adminTech.webhooks.event.projectUpdate',
  DOCUMENT_ADDED: 'adminTech.webhooks.event.documentAdded',
  TICKET_CREATED: 'adminTech.webhooks.event.ticketCreated',
  TICKET_REPLY: 'adminTech.webhooks.event.ticketReply',
  TICKET_STATUS_CHANGED: 'adminTech.webhooks.event.ticketStatusChanged',
  TICKET_ASSIGNED: 'adminTech.webhooks.event.ticketAssigned',
  INTERNAL_MESSAGE: 'adminTech.webhooks.event.internalMessage',
  DECISION_SUBMITTED: 'adminTech.webhooks.event.decisionSubmitted',
  DECISION_APPROVED: 'adminTech.webhooks.event.decisionApproved',
  DECISION_REJECTED: 'adminTech.webhooks.event.decisionRejected',
  DECISION_IMPROVEMENT: 'adminTech.webhooks.event.decisionImprovement',
  INTERN_CREATED: 'adminTech.webhooks.event.internCreated',
  INTERN_REPORT_SUBMITTED: 'adminTech.webhooks.event.internReportSubmitted',
  INTERN_REPORT_UPDATED: 'adminTech.webhooks.event.internReportUpdated',
  INTERN_CONVENTION_ADDED: 'adminTech.webhooks.event.internConventionAdded',
  INTERN_CREDENTIALS_SENT: 'adminTech.webhooks.event.internCredentialsSent',
  INTERNAL_PROJECT_CREATED: 'adminTech.webhooks.event.internalProjectCreated',
  INTERNAL_MISSION_ASSIGNED: 'adminTech.webhooks.event.internalMissionAssigned',
  INTERNAL_MISSION_REVIEW_REQUESTED: 'adminTech.webhooks.event.internalMissionReviewRequested',
  INTERNAL_MISSION_VALIDATED: 'adminTech.webhooks.event.internalMissionValidated',
  INTERNAL_MISSION_FILE_ADDED: 'adminTech.webhooks.event.internalMissionFileAdded',
  BILLING_QUOTE_CREATED: 'adminTech.webhooks.event.billingQuoteCreated',
  BILLING_INVOICE_CREATED: 'adminTech.webhooks.event.billingInvoiceCreated',
  BILLING_DOCUMENT_SENT: 'adminTech.webhooks.event.billingDocumentSent',
  BILLING_DOCUMENT_PAID: 'adminTech.webhooks.event.billingDocumentPaid',
  CRM_LEAD_CREATED: 'adminTech.webhooks.event.crmLeadCreated',
  CRM_LEAD_ASSIGNED: 'adminTech.webhooks.event.crmLeadAssigned',
  CRM_LEAD_READY_TO_CLOSE: 'adminTech.webhooks.event.crmLeadReadyToClose',
  CRM_LEAD_STATUS_CHANGED: 'adminTech.webhooks.event.crmLeadStatusChanged',
  CRM_LEAD_CONVERTED: 'adminTech.webhooks.event.crmLeadConverted',
  DEV_ISSUE_ASSIGNED: 'adminTech.webhooks.event.devIssueAssigned',
  DEV_ISSUE_STATUS_CHANGED: 'adminTech.webhooks.event.devIssueStatusChanged',
  QUALIOPI_INDICATOR_UPDATED: 'adminTech.webhooks.event.qualiopiIndicatorUpdated',
  QUALIOPI_QUESTIONNAIRE_RECEIVED: 'adminTech.webhooks.event.qualiopiQuestionnaireReceived',
  CLIENT_CREATED: 'adminTech.webhooks.event.clientCreated',
  CLIENT_NOTE_ADDED: 'adminTech.webhooks.event.clientNoteAdded',
  PROJECT_ITEM_CREATED: 'adminTech.webhooks.event.projectItemCreated',
  PROJECT_ITEM_VALIDATED: 'adminTech.webhooks.event.projectItemValidated',
  TOOL_ACCESS_GRANTED: 'adminTech.webhooks.event.toolAccessGranted',
  RESOURCE_REQUESTED: 'adminTech.webhooks.event.resourceRequested',
  ADMIN_CREATED: 'adminTech.webhooks.event.adminCreated',
  ADMIN_ROLE_CHANGED: 'adminTech.webhooks.event.adminRoleChanged',
  ADMIN_PERMISSIONS_CHANGED: 'adminTech.webhooks.event.adminPermissionsChanged',
  TWO_FACTOR_ENABLED: 'adminTech.webhooks.event.twoFactorEnabled',
  TWO_FACTOR_DISABLED: 'adminTech.webhooks.event.twoFactorDisabled',
  AGENT_TOKEN_CREATED: 'adminTech.webhooks.event.agentTokenCreated',
  AGENT_TOKEN_REVOKED: 'adminTech.webhooks.event.agentTokenRevoked',
  SENSITIVE_ACTION_EXECUTED: 'adminTech.webhooks.event.sensitiveActionExecuted',
  BRIEF_ASSIGNED: 'adminTech.webhooks.event.briefAssigned',
  BRIEF_STATUS_CHANGED: 'adminTech.webhooks.event.briefStatusChanged',
  WEBHOOK_TEST: 'adminTech.webhooks.event.webhookTest',
  WEBHOOK_ENDPOINT_DISABLED: 'adminTech.webhooks.event.webhookEndpointDisabled',
}

export function eventTypeLabel(type: string): string {
  const key = EVENT_TYPE_LABEL_KEYS[type]
  return key ? translate(key) : type
}
