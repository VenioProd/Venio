import * as Sentry from '@sentry/react'

/**
 * Initialise Sentry côté navigateur. Skip si VITE_SENTRY_DSN n'est pas défini
 * (dev local, tests, etc.) — pas d'erreur, juste un log.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info('[sentry] VITE_SENTRY_DSN non défini — Sentry désactivé')
    }
    return
  }

  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENV as string | undefined) || (import.meta.env.PROD ? 'production' : 'development'),
    release: (import.meta.env.VITE_APP_VERSION as string | undefined) || undefined,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    // Sample 10% des transactions en prod, 100% en dev (mais init skippée si pas de DSN dev de toute façon)
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Filtrage : on n'envoie pas les erreurs de réseau utilisateur (offline, etc.)
    ignoreErrors: ['NetworkError', 'Failed to fetch', 'Load failed'],
  })
}

export { Sentry }
