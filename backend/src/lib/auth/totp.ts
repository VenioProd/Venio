import crypto from 'node:crypto'

/**
 * TOTP (RFC 6238) et HOTP (RFC 4226) sur node:crypto, sans dépendance.
 * Paramètres compatibles avec toutes les applications d'authentification
 * courantes : SHA-1, 6 chiffres, pas de 30 secondes.
 */

export const TOTP_PERIOD_SECONDS = 30
export const TOTP_DIGITS = 6
/** Tolérance d'horloge : un pas avant et un pas après le pas courant. */
export const TOTP_WINDOW = 1

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Encodage base32 RFC 4648, sans remplissage (format attendu par les URI otpauth). */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

/**
 * Décodage base32 tolérant : casse, espaces, tirets et remplissage « = » sont
 * ignorés. Lève une erreur sur tout autre caractère.
 */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const output: number[] = []
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) throw new Error('Secret base32 invalide')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(output)
}

/** Secret aléatoire de 160 bits (taille recommandée par la RFC 4226), encodé en base32 (32 caractères). */
export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(crypto.randomBytes(byteLength))
}

/** HOTP : code à 6 chiffres pour un compteur donné. */
export function hotp(secret: string, counter: number, digits = TOTP_DIGITS): string {
  const key = base32Decode(secret)
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = crypto.createHmac('sha1', key).update(message).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff)
  return String(binary % 10 ** digits).padStart(digits, '0')
}

/** Numéro du pas de temps TOTP (compteur) pour un instant donné. */
export function totpStep(atMs = Date.now()): number {
  return Math.floor(atMs / 1000 / TOTP_PERIOD_SECONDS)
}

export function generateTotp(secret: string, atMs = Date.now()): string {
  return hotp(secret, totpStep(atMs))
}

/** Normalise une saisie utilisateur (« 123 456 » → « 123456 »). */
export function normalizeTotpCode(code: unknown): string {
  return String(code ?? '').replace(/\s+/g, '')
}

/**
 * Vérifie un code dans la fenêtre de tolérance et renvoie le pas de temps qui
 * correspond, ou null. Le pas sert à refuser le rejeu : l'appelant enregistre
 * le dernier pas accepté et refuse tout pas inférieur ou égal.
 * Comparaison en temps constant ; toutes les positions de la fenêtre sont testées.
 */
export function matchTotpStep(
  secret: string,
  code: unknown,
  options: { atMs?: number; window?: number } = {},
): number | null {
  const normalized = normalizeTotpCode(code)
  if (!/^\d{6}$/.test(normalized) || !secret) return null
  let key: Buffer
  try {
    key = base32Decode(secret)
  } catch {
    return null
  }
  if (key.length === 0) return null
  const current = totpStep(options.atMs ?? Date.now())
  const window = options.window ?? TOTP_WINDOW
  let matched: number | null = null
  for (let delta = -window; delta <= window; delta += 1) {
    const candidate = hotp(secret, current + delta)
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(normalized)) && matched === null) {
      matched = current + delta
    }
  }
  return matched
}

/** URI otpauth:// (format Key Uri de Google Authenticator) à afficher ou à encoder en QR. */
export function buildOtpauthUri(secret: string, accountLabel: string, issuer = 'Venio'): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}
