import crypto from 'crypto'

/**
 * Signature HMAC type Stripe.
 *
 * Le client calcule :
 *   payload    = `${timestamp}.${rawBody}`
 *   signature  = `sha256=` + HEX(HMAC_SHA256(payload, webhookSecret))
 *
 * Et envoie :
 *   X-Venio-Timestamp : <unix_seconds>
 *   X-Venio-Signature : sha256=<hex>
 *
 * Côté Venio on recalcule la signature à partir du raw body (bytes) reçu et
 * on compare en timing-safe à celle annoncée par le client.
 */

const SIG_PREFIX = 'sha256='

export type RawBodyLike = string | Buffer | null | undefined

/**
 * Convertit le rawBody (string ou Buffer) en Buffer.
 */
function toBuffer(rawBody: RawBodyLike): Buffer {
  if (Buffer.isBuffer(rawBody)) return rawBody
  if (typeof rawBody === 'string') return Buffer.from(rawBody, 'utf8')
  if (rawBody == null) return Buffer.alloc(0)
  return Buffer.from(String(rawBody), 'utf8')
}

/**
 * Calcule la signature attendue selon l'algorithme Stripe-like.
 *
 * @param timestamp  Unix timestamp en secondes
 * @param rawBody    Corps de la requête EXACT (bytes)
 * @param secret     webhookSecret de la source
 * @returns          "sha256=<hex>"
 */
export function computeSignature(
  timestamp: string | number,
  rawBody: RawBodyLike,
  secret: string
): string {
  if (!secret || typeof secret !== 'string') {
    throw new Error('Secret HMAC manquant')
  }
  const payload = Buffer.concat([
    Buffer.from(String(timestamp), 'utf8'),
    Buffer.from('.', 'utf8'),
    toBuffer(rawBody),
  ])
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return `${SIG_PREFIX}${digest}`
}

/**
 * Vérifie une signature reçue en timing-safe.
 * Retourne true si elle matche, false sinon. Ne throw pas.
 *
 * @param timestamp           valeur du header X-Venio-Timestamp
 * @param rawBody             corps brut tel que reçu (bytes)
 * @param secret              webhookSecret de la source
 * @param providedSignature   valeur du header X-Venio-Signature
 */
export function verifySignature(
  timestamp: string | number,
  rawBody: RawBodyLike,
  secret: string,
  providedSignature: unknown
): boolean {
  if (!providedSignature || typeof providedSignature !== 'string') return false
  if (!secret || typeof secret !== 'string') return false
  let expected: string
  try {
    expected = computeSignature(timestamp, rawBody, secret)
  } catch {
    return false
  }
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(providedSignature, 'utf8')
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
