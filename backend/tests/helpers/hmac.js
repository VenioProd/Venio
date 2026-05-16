import crypto from 'node:crypto'

/**
 * Signe un payload selon le schéma Stripe-like attendu par /api/external :
 *   sig = "sha256=" + HEX(HMAC_SHA256(<timestamp>.<rawBody>, secret))
 *
 * @param {string|number} timestamp Unix timestamp en secondes
 * @param {string} rawBody         Corps brut tel qu'il sera envoyé (string exacte)
 * @param {string} secret          webhookSecret de la source externe
 * @returns {string}               "sha256=<hex>"
 */
export function sign(timestamp, rawBody, secret) {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(`${timestamp}.${rawBody}`)
  return `sha256=${hmac.digest('hex')}`
}

/**
 * Renvoie le timestamp courant en secondes (entier).
 */
export function nowSec() {
  return Math.floor(Date.now() / 1000)
}

export default { sign, nowSec }
