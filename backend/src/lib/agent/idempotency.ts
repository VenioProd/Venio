import crypto from 'crypto'

/**
 * Helpers pour l'idempotency des mutations API agent.
 *
 * Hash du body : on normalise le body (tri stable des clés) puis sha256.
 * Utilisé pour détecter les retry avec body modifié → 409 IDEMPOTENCY_CONFLICT.
 */

/**
 * Sérialise un objet de façon stable (clés triées récursivement).
 * Sortie déterministe pour des objets équivalents.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
  return `{${entries.join(',')}}`
}

/**
 * Calcule un hash sha256 stable d'un body de requête.
 * `null`, `undefined`, `''` et `{}` sont considérés équivalents (body vide) et
 * partagent tous le hash du string vide.
 */
export function computeRequestHash(body: unknown): string {
  const isEmpty =
    body == null ||
    body === '' ||
    (typeof body === 'object' && !Array.isArray(body) && Object.keys(body as object).length === 0)
  const normalized = isEmpty ? '' : stableStringify(body)
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex')
}

/**
 * Valide un Idempotency-Key reçu en header. Accepté :
 *   - Longueur 8..255
 *   - Caractères : lettres, chiffres, tirets, underscores (couvre UUID et nano-id)
 */
const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_-]{8,255}$/

export function isValidIdempotencyKey(key: unknown): key is string {
  return typeof key === 'string' && IDEMPOTENCY_KEY_REGEX.test(key)
}
