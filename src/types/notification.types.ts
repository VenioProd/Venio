export type NotificationType =
  | 'CRM_LEAD_CREATED'
  | 'LEAD_ASSIGNED'
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
  | 'WEBHOOK_ENDPOINT_DISABLED'
  | 'WEBHOOK_TEST'

export interface AppNotification {
  _id: string
  recipient: string
  type: NotificationType
  title: string
  message: string
  link: string
  isRead: boolean
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
