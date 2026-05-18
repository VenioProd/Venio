import type { Types } from 'mongoose'
import type { NotificationType } from '../types/enums.js'
import Notification from '../models/Notification.js'
import { sendPushToUser } from './webPush.js'

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
  const notification = await Notification.create({
    recipient,
    type,
    title,
    message: message || '',
    link: link || '',
    metadata: metadata || {},
  })

  // Envoi du push web en arrière-plan (n'attend pas, n'échoue jamais l'appelant)
  const recipientId = String(recipient)
  sendPushToUser(recipientId, {
    title,
    body: message || '',
    link: link || '/',
    tag: type,
    data: { notificationId: String(notification._id), type, ...(metadata || {}) },
  }).catch((err) => {
    console.warn('[notifications] push fail', { recipientId, err: err?.message })
  })

  return notification
}
