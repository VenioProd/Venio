/**
 * Validation des URL de destination d'un webhook sortant.
 *
 * Règle : https obligatoire. Seule exception, réservée au développement et
 * aux tests : http vers la machine locale (localhost / 127.0.0.1 / [::1]).
 */

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase())
}

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Retourne l'URL normalisée (trim) ou throw une Error au message destiné à
 * l'admin (renvoyé tel quel en 400 par les routes).
 */
export function assertValidWebhookUrl(url: unknown): string {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('URL requise')
  }
  const trimmed = url.trim()

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('URL invalide')
  }

  if (parsed.protocol === 'https:') return trimmed

  if (parsed.protocol === 'http:' && isLocalHostname(parsed.hostname) && !isProductionEnv()) {
    return trimmed
  }

  throw new Error('URL invalide : https requis (http toléré uniquement en local hors production)')
}
