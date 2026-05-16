import crypto from 'crypto'
import bcrypt from 'bcryptjs'

/**
 * Helpers de gestion des clés API et secrets webhook pour les sources externes.
 *
 * Format des clés générées :
 *   vno_live_<32 chars hex>
 *
 * Côté Venio, on ne stocke JAMAIS la clé en clair : seulement le hash bcrypt
 * (apiKeyHash) et les 8 premiers caractères de la clé brute (apiKeyPrefix)
 * pour permettre un affichage de type "vno_live_a1b2c3d4..." dans l'admin.
 */

const PREFIX = 'vno_live_'
const RANDOM_BYTES = 16 // 16 bytes = 32 chars hex
const BCRYPT_ROUNDS = 10

/**
 * Génère une nouvelle clé API.
 * @returns {Promise<{ plain: string, hash: string, prefix: string }>}
 *   - plain  : la clé en clair (à remettre à l'utilisateur une seule fois)
 *   - hash   : le hash bcrypt à stocker en base
 *   - prefix : les 8 premiers caractères de la clé (pour affichage)
 */
export async function generateApiKey() {
  const random = crypto.randomBytes(RANDOM_BYTES).toString('hex')
  const plain = `${PREFIX}${random}`
  const hash = await bcrypt.hash(plain, BCRYPT_ROUNDS)
  const prefix = plain.slice(0, PREFIX.length + 8)
  return { plain, hash, prefix }
}

/**
 * Vérifie qu'une clé en clair correspond au hash bcrypt stocké.
 * Retourne true / false. Ne throw jamais.
 *
 * @param {string} plain  Clé reçue dans le header X-Api-Key
 * @param {string} hash   Hash bcrypt persisté (ExternalSource.apiKeyHash)
 */
export async function verifyApiKey(plain, hash) {
  if (!plain || typeof plain !== 'string') return false
  if (!hash || typeof hash !== 'string') return false
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}

/**
 * Génère un secret de webhook (utilisé pour calculer le HMAC côté client et
 * vérifier la signature côté Venio).
 *
 * 32 bytes random hex = 64 caractères.
 */
export function generateWebhookSecret() {
  return crypto.randomBytes(32).toString('hex')
}
