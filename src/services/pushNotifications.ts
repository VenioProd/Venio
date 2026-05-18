import { apiFetch } from '../lib/api'

/**
 * Convertit la clé VAPID base64url en Uint8Array (format attendu par PushManager).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function getCurrentPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null
  try {
    const registration = await navigator.serviceWorker.ready
    return registration
  } catch {
    return null
  }
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const registration = await getRegistration()
  if (!registration) return null
  return registration.pushManager.getSubscription()
}

async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await apiFetch<{ publicKey: string }>('/api/push/vapid-public-key')
    return res.publicKey || null
  } catch {
    return null
  }
}

/**
 * Demande la permission et abonne le device au push.
 * Retourne { ok, reason } pour permettre une UX adaptée.
 */
export async function subscribePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'Push non supporté par ce navigateur' }
  }

  if (Notification.permission === 'denied') {
    return { ok: false, reason: 'Permission refusée par l’utilisateur' }
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()

  if (permission !== 'granted') {
    return { ok: false, reason: 'Permission non accordée' }
  }

  const registration = await getRegistration()
  if (!registration) {
    return { ok: false, reason: 'Service worker indisponible' }
  }

  const publicKey = await fetchVapidPublicKey()
  if (!publicKey) {
    return { ok: false, reason: 'Push non configuré côté serveur' }
  }

  // Si déjà subscribed, on renvoie le succès directement
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    const applicationServerKey = urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    })
  }

  const json = subscription.toJSON() as { endpoint: string; keys?: { p256dh: string; auth: string } }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: 'Subscription malformée' }
  }

  await apiFetch('/api/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: navigator.userAgent,
    }),
  })

  return { ok: true }
}

export async function unsubscribePush(): Promise<void> {
  const subscription = await getExistingSubscription()
  if (!subscription) return

  const endpoint = subscription.endpoint
  try {
    await subscription.unsubscribe()
  } catch {
    /* noop */
  }
  await apiFetch('/api/push/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  }).catch(() => {})
}

export interface PushStatus {
  supported: boolean
  permission: NotificationPermission | 'unsupported'
  subscribed: boolean
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false }
  }
  const subscription = await getExistingSubscription()
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: !!subscription,
  }
}
