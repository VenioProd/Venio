import webpush from 'web-push'
import PushSubscription from '../models/PushSubscription.js'
import logger from './logger.js'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contact@venio.paris'

let configured = false

function ensureConfigured(): boolean {
  if (configured) return true
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return false
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  configured = true
  return true
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY
}

export interface PushPayload {
  title: string
  body?: string
  link?: string
  tag?: string
  icon?: string
  badge?: string
  data?: Record<string, unknown>
  /**
   * Compteur de notifications non lues — utilisé par le service worker pour
   * alimenter la Badging API (badge numérique sur l'icône de l'app installée).
   */
  unreadCount?: number
}

/**
 * Envoie un push web à tous les devices abonnés d'un utilisateur.
 * Supprime automatiquement les subscriptions invalides (410 Gone, 404 Not Found).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return

  const subscriptions = await PushSubscription.find({ user: userId }).lean()
  if (subscriptions.length === 0) return

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body || '',
    link: payload.link || '/',
    tag: payload.tag,
    icon: payload.icon || '/favicon-192x192.png',
    badge: payload.badge || '/favicon-192x192.png',
    data: payload.data || {},
    unreadCount: typeof payload.unreadCount === 'number' ? payload.unreadCount : undefined,
  })

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          },
          body,
          { TTL: 60 * 60 * 24 }
        )
        // Tag dernière utilisation
        PushSubscription.updateOne({ _id: sub._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {})
      } catch (err: any) {
        const status = err?.statusCode
        // 404 / 410 : abonnement invalide → on supprime
        if (status === 404 || status === 410) {
          PushSubscription.deleteOne({ _id: sub._id }).catch(() => {})
        } else {
          logger.warn({ data: { endpoint: sub.endpoint.slice(0, 60), status, message: err?.message } }, '[webPush] échec envoi')
        }
      }
    })
  )
}
