import type { Types } from 'mongoose'
import type { NotificationType } from '../types/enums.js'
import Notification from '../models/Notification.js'
import { sendPushToUser } from './webPush.js'
import { shouldNotify } from './notificationPreferences.js'
import { getIo } from '../realtime/ioSingleton.js'
import logger from './logger.js'
import { emitWebhookEventInBackground } from './webhookEvents.js'

interface CreateNotificationParams {
  recipient: Types.ObjectId | string
  type: NotificationType
  title: string
  message?: string
  link?: string
  metadata?: Record<string, unknown>
  /**
   * Identifie une alerte récurrente. Tant qu'une notification portant cette
   * clé reste non lue, les exécutions suivantes mettent son contenu à jour au
   * lieu de créer une nouvelle ligne et un nouveau push.
   */
  dedupeKey?: string
  /**
   * Réservé aux broadcasts de notifyHelpers : ils émettent l'événement
   * sortant UNE fois pour tout le fan-out, donc chaque createNotification
   * interne doit rester muet côté webhooks.
   */
  skipWebhook?: boolean
}

export async function createNotification({
  recipient,
  type,
  title,
  message,
  link,
  metadata,
  dedupeKey,
  skipWebhook,
}: CreateNotificationParams) {
  if (!recipient) return null

  const recipientId = String(recipient)
  const normalizedDedupeKey = dedupeKey?.trim() || undefined
  const notificationMetadata = {
    ...(metadata || {}),
    ...(normalizedDedupeKey ? { dedupeKey: normalizedDedupeKey } : {}),
  }

  // Préférences in-app : si désactivé, on ne crée pas de notification du tout
  const inAppAllowed = await shouldNotify(recipientId, type, 'inApp')
  let notification = null
  let created = false
  if (inAppAllowed) {
    if (normalizedDedupeKey) {
      notification = await Notification.findOneAndUpdate(
        {
          recipient,
          isRead: false,
          'metadata.dedupeKey': normalizedDedupeKey,
        },
        {
          $set: {
            type,
            title,
            message: message || '',
            link: link || '',
            metadata: notificationMetadata,
          },
        },
        { new: true },
      )
    }

    if (!notification) {
      try {
        notification = await Notification.create({
          recipient,
          type,
          title,
          message: message || '',
          link: link || '',
          metadata: notificationMetadata,
        })
        created = true
      } catch (err: unknown) {
        // Deux workers peuvent évaluer la même alerte simultanément. L'index
        // unique partiel tranche la course ; on récupère alors la ligne créée
        // par l'autre worker au lieu d'émettre un doublon.
        const isDuplicateKey =
          typeof err === 'object' && err !== null && 'code' in err && (err as { code?: number }).code === 11000
        if (normalizedDedupeKey && isDuplicateKey) {
          notification = await Notification.findOne({
            recipient,
            isRead: false,
            'metadata.dedupeKey': normalizedDedupeKey,
          })
        } else {
          throw err
        }
      }
    }
  }

  // Socket temps réel : émet notification:new à l'utilisateur connecté pour
  // déclencher un refresh immédiat de la cloche sans attendre le polling.
  if (notification && created) {
    try {
      getIo()
        ?.to(`user:${recipientId}`)
        .emit('notification:new', {
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
  // unreadCount est joint au payload pour alimenter la Badging API côté SW.
  // Une alerte récurrente déjà non lue ne doit pas renvoyer le même push.
  if (!normalizedDedupeKey || created || !inAppAllowed) {
    shouldNotify(recipientId, type, 'push')
      .then(async (allowed) => {
        if (!allowed) return
        const unreadCount = await Notification.countDocuments({ recipient, isRead: false }).catch(() => undefined)
        return sendPushToUser(recipientId, {
          title,
          body: message || '',
          link: link || '/',
          tag: type,
          data: { notificationId: notification ? String(notification._id) : null, type, ...(metadata || {}) },
          unreadCount: typeof unreadCount === 'number' ? unreadCount : undefined,
        })
      })
      .catch((err) => {
        logger.warn({ data: { recipientId, err: err?.message } }, '[notifications] push fail')
      })
  }

  // Pipeline sortant. Règle 1 : les broadcasts ont déjà émis pour tout le
  // fan-out. Règle 4 : une alerte à dedupeKey ne réémet que si une ligne a
  // été créée. Règle 3 : sans dedupeKey, on émet même si la préférence
  // in-app a empêché la création — le filtre du pipeline, c'est eventTypes.
  if (!skipWebhook && (!normalizedDedupeKey || created)) {
    emitWebhookEventInBackground({ type, title, message, link, metadata })
  }

  return notification
}
