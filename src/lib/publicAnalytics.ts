export const PUBLIC_ANALYTICS_EVENTS = [
  'page_view',
  'cta_click',
  'contact_form_started',
  'contact_form_submitted',
  'contact_form_succeeded',
  'contact_form_failed',
] as const

export type PublicAnalyticsEvent = (typeof PUBLIC_ANALYTICS_EVENTS)[number]

const allowedEvents = new Set<string>(PUBLIC_ANALYTICS_EVENTS)

export function trackPublicEvent(event: PublicAnalyticsEvent, cta?: string): void {
  // The deterministic public recipe runs without an API server and should not
  // emit best-effort network noise while exercising the form's test transport.
  if (
    !allowedEvents.has(event) ||
    typeof window === 'undefined' ||
    (import.meta.env.MODE === 'test' && import.meta.env.VITE_CONTACT_FORM_MODE === 'test')
  )
    return

  const payload = JSON.stringify({ event, path: window.location.pathname, ...(cta ? { cta } : {}) })

  // keepalive lets the browser finish a short request during navigation while
  // credentials: omit ensures a signed-in session cookie is never attached.
  // This remains best-effort: analytics must not affect navigation or a form.
  void apiFetch('/api/public/analytics/event', {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    credentials: 'omit',
  }).catch(() => {})
}
import { apiFetch } from './api'
