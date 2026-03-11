export type NotificationType = 'TASK_ASSIGNED' | 'TASK_UPDATED' | 'PROJECT_UPDATE' | 'DOCUMENT_ADDED' | 'TICKET_CREATED' | 'TICKET_REPLY'

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
