/* eslint-env serviceworker */
/* global self, caches, clients, fetch */

const CACHE_NAME = 'venio-v3'
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
]

// ─────────────────────────────────────────────
// Install / Activate / Cache (inchangé)
// ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || new Response('Offline', { status: 503 })))
  )
})

// ─────────────────────────────────────────────
// Push notifications
// ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Venio', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Venio'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon-192x192.png',
    badge: payload.badge || '/favicon-192x192.png',
    tag: payload.tag || undefined,
    renotify: !!payload.tag,
    data: {
      link: payload.link || '/',
      ...(payload.data || {}),
    },
    vibrate: [80, 40, 80],
  }

  // Badging API : alimente le badge numérique sur l'icône de l'app installée.
  // Le backend joint `unreadCount` au payload push. Disponible sur Chrome/Edge
  // (desktop + Android) et iOS 16.4+ pour les PWA ajoutées à l'écran d'accueil.
  const tasks = [self.registration.showNotification(title, options)]
  if (typeof payload.unreadCount === 'number' && 'setAppBadge' in self.navigator) {
    tasks.push(
      payload.unreadCount > 0
        ? self.navigator.setAppBadge(payload.unreadCount).catch(() => {})
        : self.navigator.clearAppBadge().catch(() => {})
    )
  }

  event.waitUntil(Promise.all(tasks))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.link) || '/'

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })

      // Cherche un onglet Venio déjà ouvert sur la cible exacte
      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url)
          if (clientUrl.origin === self.location.origin && (clientUrl.pathname + clientUrl.search) === targetUrl) {
            return client.focus()
          }
        } catch { /* noop */ }
      }

      // Sinon focus le premier client Venio et navigue
      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url)
          if (clientUrl.origin === self.location.origin) {
            await client.focus()
            if ('navigate' in client) {
              return client.navigate(targetUrl)
            }
            return
          }
        } catch { /* noop */ }
      }

      // Sinon ouvre un nouvel onglet
      return clients.openWindow(targetUrl)
    })()
  )
})

// Quand un user désactive les notifs côté navigateur, le SW peut recevoir un
// pushsubscriptionchange. On le notifie au frontend qui re-subscribera.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of allClients) {
        client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGE' })
      }
    })()
  )
})
