import type { Types } from 'mongoose'
import type { NotificationType } from '../types/enums.js'
import Notification from '../models/Notification.js'

interface CreateNotificationParams {
  recipient: Types.ObjectId | string
  type: NotificationType
  title: string
  message?: string
  link?: string
  metadata?: Record<string, unknown>
}

export async function createNotification({ recipient, type, title, message, link, metadata }: CreateNotificationParams) {
  if (!recipient) return null
  return Notification.create({
    recipient,
    type,
    title,
    message: message || '',
    link: link || '',
    metadata: metadata || {},
  })
}
