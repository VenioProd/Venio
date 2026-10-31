import { apiFetch } from '../lib/api'
import type { MessageKey } from '../i18n'

export type NotificationChannel = 'inApp' | 'push' | 'email'

export interface ChannelPreferences {
  inApp: boolean
  push: boolean
  email: boolean
}

export type NotificationType =
  | 'CRM_LEAD_CREATED'
  | 'CRM_LEAD_ASSIGNED'
  | 'CRM_LEAD_READY_TO_CLOSE'
  | 'LEAD_FOLLOW_UP_DUE'
  | 'QUOTE_PROPOSAL_VIEWED'
  | 'QUOTE_PROPOSAL_SIGNED'
  | 'TASK_ASSIGNED'
  | 'TASK_UPDATED'
  | 'PROJECT_UPDATE'
  | 'DOCUMENT_ADDED'
  | 'TICKET_CREATED'
  | 'TICKET_REPLY'
  | 'INTERNAL_MESSAGE'
  | 'PHASE_VALIDATION_REQUESTED'
  | 'PHASE_VALIDATED'
  | 'PHASE_REVISION_REQUESTED'
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

export const NOTIFICATION_TYPE_LABEL_KEYS = {
  CRM_LEAD_CREATED: {
    label: 'shared.notifTypes.crmLeadCreatedLabel',
    description: 'shared.notifTypes.crmLeadCreatedDescription',
  },
  CRM_LEAD_ASSIGNED: {
    label: 'shared.notifTypes.crmLeadAssignedLabel',
    description: 'shared.notifTypes.crmLeadAssignedDescription',
  },
  CRM_LEAD_READY_TO_CLOSE: {
    label: 'shared.notifTypes.crmLeadReadyToCloseLabel',
    description: 'shared.notifTypes.crmLeadReadyToCloseDescription',
  },
  LEAD_FOLLOW_UP_DUE: {
    label: 'shared.notifTypes.leadFollowUpDueLabel',
    description: 'shared.notifTypes.leadFollowUpDueDescription',
  },
  QUOTE_PROPOSAL_VIEWED: {
    label: 'shared.notifTypes.quoteViewedLabel',
    description: 'shared.notifTypes.quoteViewedDescription',
  },
  QUOTE_PROPOSAL_SIGNED: {
    label: 'shared.notifTypes.quoteSignedLabel',
    description: 'shared.notifTypes.quoteSignedDescription',
  },
  TASK_ASSIGNED: {
    label: 'shared.notifTypes.taskAssignedLabel',
    description: 'shared.notifTypes.taskAssignedDescription',
  },
  TASK_UPDATED: {
    label: 'shared.notifTypes.taskUpdatedLabel',
    description: 'shared.notifTypes.taskUpdatedDescription',
  },
  PROJECT_UPDATE: {
    label: 'shared.notifTypes.projectUpdateLabel',
    description: 'shared.notifTypes.projectUpdateDescription',
  },
  DOCUMENT_ADDED: {
    label: 'shared.notifTypes.documentAddedLabel',
    description: 'shared.notifTypes.documentAddedDescription',
  },
  TICKET_CREATED: {
    label: 'shared.notifTypes.ticketCreatedLabel',
    description: 'shared.notifTypes.ticketCreatedDescription',
  },
  TICKET_REPLY: {
    label: 'shared.notifTypes.ticketReplyLabel',
    description: 'shared.notifTypes.ticketReplyDescription',
  },
  INTERNAL_MESSAGE: {
    label: 'shared.notifTypes.internalMessageLabel',
    description: 'shared.notifTypes.internalMessageDescription',
  },
  PHASE_VALIDATION_REQUESTED: {
    label: 'shared.notifTypes.phaseValidationRequestedLabel',
    description: 'shared.notifTypes.phaseValidationRequestedDescription',
  },
  PHASE_VALIDATED: {
    label: 'shared.notifTypes.phaseValidatedLabel',
    description: 'shared.notifTypes.phaseValidatedDescription',
  },
  PHASE_REVISION_REQUESTED: {
    label: 'shared.notifTypes.phaseRevisionRequestedLabel',
    description: 'shared.notifTypes.phaseRevisionRequestedDescription',
  },
  WEBHOOK_ENDPOINT_DISABLED: {
    label: 'shared.notifTypes.webhookDisabledLabel',
    description: 'shared.notifTypes.webhookDisabledDescription',
  },
  WEBHOOK_TEST: {
    label: 'shared.notifTypes.webhookTestLabel',
    description: 'shared.notifTypes.webhookTestDescription',
  },
} as const satisfies Record<NotificationType, { label: MessageKey; description: MessageKey }>
