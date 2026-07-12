export const ADMIN_ANALYTICS_EVENTS = [
  'admin_cockpit_viewed',
  'admin_navigation_selected',
  'admin_palette_opened',
  'admin_palette_selected',
] as const

export type AdminAnalyticsEvent = (typeof ADMIN_ANALYTICS_EVENTS)[number]

const allowedEvents = new Set<string>(ADMIN_ANALYTICS_EVENTS)

/**
 * Aggregate-only product measurement for the admin workspace. The payload
 * deliberately excludes account, role, session, search text and query data.
 */
export function trackAdminEvent(event: AdminAnalyticsEvent, action: string): void {
  if (!allowedEvents.has(event) || typeof window === 'undefined' || import.meta.env.MODE === 'test') return
  const actionId = action.replace(/-/g, '_')
  if (!/^[a-z0-9_]{1,80}$/.test(actionId)) return

  void fetch('/api/public/analytics/event', {
    method: 'POST',
    body: JSON.stringify({ event, path: window.location.pathname, cta: actionId }),
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    // Aggregate analytics never needs an authenticated cookie.
    credentials: 'omit',
  }).catch(() => {})
}
