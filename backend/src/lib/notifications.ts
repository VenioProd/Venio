import type { Types } from 'mongoose'
import type { NotificationType } from '../types/enums.js'
import Notification from '../models/Notification.js'
import { sendPushToUser } from './webPush.js'
import { shouldNotify } from './notificationPreferences.js'
import { getIo } from '../realtime/ioSingleton.js'

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

  const recipientId = String(recipient)

  // Préférences in-app : si désactivé, on ne crée pas de notification du tout
  const inAppAllowed = await shouldNotify(recipientId, type, 'inApp')
  let notification = null
  if (inAppAllowed) {
    notification = await Notification.create({
      recipient,
      type,
      title,
      message: message || '',
      link: link || '',
      metadata: metadata || {},
    })
  }

  // Socket temps réel : émet notification:new à l'utilisateur connecté pour
  // déclencher un refresh immédiat de la cloche sans attendre le polling.
  if (notification) {
    try {
      getIo()?.to(`user:${recipientId}`).emit('notification:new', {
        _id: String(notification._id),
        type,
        title,
        message: message || '',
        link: link || '',
        isRead: false,
        createdAt: notification.createdAt,
      })
    } catch {
      // Non bloquant
    }
  }

  // Push : envoyé indépendamment de la notif in-app (l'utilisateur peut vouloir
  // l'un sans l'autre). En arrière-plan, n'échoue jamais l'appelant.
  shouldNotify(recipientId, type, 'push').then((allowed) => {
    if (!allowed) return
    return sendPushToUser(recipientId, {
      title,
      body: message || '',
      link: link || '/',
      tag: type,
      data: { notificationId: notification ? String(notification._id) : null, type, ...(metadata || {}) },
    })
  }).catch((err) => {
    console.warn('[notifications] push fail', { recipientId, err: err?.message })
  })

  return notification
}
