import crypto from 'crypto'

/**
 * Chiffrement symétrique des secrets (identifiants des filiales).
 * AES-256-GCM. La clé est dérivée d'une variable d'environnement
 * (CREDENTIALS_KEY de préférence, sinon JWT_SECRET), via SHA-256.
 *
 * Format stocké : base64( iv(12) | tag(16) | ciphertext ), préfixé "v1:".
 */

const PREFIX = 'v1:'

function getKey(): Buffer {
  const material = process.env.CREDENTIALS_KEY || process.env.JWT_SECRET || 'venio-dev-fallback-key'
  return crypto.createHash('sha256').update(material).digest() // 32 octets
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ''
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptSecret(stored: string): string {
  if (!stored) return ''
  if (!stored.startsWith(PREFIX)) return stored // compat : valeur non chiffrée
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64')
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const data = raw.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}
