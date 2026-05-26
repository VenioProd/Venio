// ─────────────────────────────────────────────────────────────
// AES-256-GCM encryption for sensitive data (ToolAccess, etc.)
// ─────────────────────────────────────────────────────────────
//
// TODO(key-rotation) : actuellement une seule clé ENCRYPTION_KEY est utilisée
// pour chiffrer ET déchiffrer. Pour permettre la rotation sans tout
// re-chiffrer immédiatement, on prévoit la stratégie suivante :
//
//   1. Format de cipher prefixé par un keyId court (ex. "v1:" puis IV + tag
//      + ciphertext). `decrypt()` lit le prefix, sélectionne la bonne clé
//      dans un keyring (ex. `ENCRYPTION_KEY_V1`, `ENCRYPTION_KEY_V2`).
//   2. `encrypt()` utilise toujours la clé "active" (`ENCRYPTION_KEY_ACTIVE`
//      ou un alias). Les anciens ciphertexts restent lisibles tant que leur
//      clé est encore présente dans le keyring.
//   3. Migration progressive : un job de fond rechiffre les valeurs lues à
//      la volée vers la clé active, puis on supprime l'ancienne clé.
//
// Cette refacto n'est pas faite ici (impact transverse), seulement documentée.

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * Get the encryption key from environment.
 * Must be a 64-char hex string (32 bytes).
 * Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex) {
    throw new Error('ENCRYPTION_KEY environment variable is required for encryption')
  }
  if (hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Check if encryption is configured.
 */
export function isEncryptionConfigured(): boolean {
  const hex = process.env.ENCRYPTION_KEY
  return !!hex && hex.length === 64
}

/**
 * Encrypt a plaintext string.
 * Returns: base64 string of IV + AuthTag + Ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  // Pack: IV (16) + AuthTag (16) + Ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted])
  return packed.toString('base64')
}

/**
 * Decrypt a previously encrypted string.
 */
export function decrypt(encryptedBase64: string): string {
  const key = getKey()
  const packed = Buffer.from(encryptedBase64, 'base64')

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid encrypted data: too short')
  }

  const iv = packed.subarray(0, IV_LENGTH)
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

/**
 * Check if a string looks like it's already encrypted (base64 with minimum length).
 * Used during migration to avoid double-encryption.
 */
export function looksEncrypted(value: string): boolean {
  if (!value || value.length < 44) return false // min base64 for IV+tag+1byte
  try {
    const buf = Buffer.from(value, 'base64')
    return buf.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1
  } catch {
    return false
  }
}
