import * as Sentry from '@sentry/node'

/**
 * Initialise Sentry côté serveur. Skip si SENTRY_DSN n'est pas défini —
 * pas d'erreur fatale, juste un log info au boot.
 *
 * À appeler tout en haut du process (idéalement avant les autres imports
 * pour permettre le tracing automatique). Voir doc @sentry/node.
 *
 * Note : pas de dépendance au logger pino pour éviter les cycles d'init
 * (Sentry doit pouvoir tourner avant que le logger pino soit prêt).
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    // eslint-disable-next-line no-console
    console.info('[sentry] SENTRY_DSN non défini — Sentry désactivé')
    return
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Ne pas remonter les erreurs 4xx (client errors) en Sentry — on ne veut que les bugs serveur
    beforeSend(event) {
      const status = event.contexts?.response?.status_code
      if (typeof status === 'number' && status >= 400 && status < 500) return null
      return event
    },
  })

  // eslint-disable-next-line no-console
  console.info(`[sentry] initialized (env=${process.env.SENTRY_ENV || process.env.NODE_ENV || 'development'})`)
}

export { Sentry }
