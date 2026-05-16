import crypto from 'crypto'
import bcrypt from 'bcryptjs'

/**
 * Helpers de génération / vérification des Personal Access Tokens (PAT)
 * pour l'API agent.
 *
 * Format public : `vno_pat_<32 chars base62>`
 *
 * Stockage en base :
 *   - prefix    : 12 premiers caractères ("vno_pat_" + 4 chars), en clair,
 *                 utilisé pour le lookup rapide à la requête.
 *   - tokenHash : bcrypt(secret entier).
 *
 * Le secret entier n'est JAMAIS stocké et n'est JAMAIS récupérable une
 * fois affiché à la création.
 */

export const TOKEN_PREFIX = 'vno_pat_'
export const TOKEN_SECRET_LENGTH = 32
export const TOKEN_PREFIX_DISPLAY_CHARS = TOKEN_PREFIX.length + 4 // 12 chars

const BCRYPT_ROUNDS = 10
const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/**
 * Format public d'un token agent.
 * @example "vno_pat_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6"
 */
const TOKEN_REGEX = new RegExp(`^${TOKEN_PREFIX}[A-Za-z0-9]{${TOKEN_SECRET_LENGTH}}$`)

export interface GeneratedAgentToken {
  /** Secret complet à remettre une seule fois à l'utilisateur. */
  plain: string
  /** Hash bcrypt à persister dans AgentToken.tokenHash. */
  hash: string
  /** "vno_pat_" + 4 chars discriminants (12 chars) pour lookup et affichage. */
  prefix: string
}

/**
 * Génère un secret base62 de la longueur attendue.
 * Crypto.randomBytes + mapping sur l'alphabet — biais négligeable car
 * 62 = 0b111110 et le pool 256 est divisible quasi-uniformément.
 */
function randomBase62(length: number): string {
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += BASE62[bytes[i]! % BASE62.length]
  }
  return out
}

/**
 * Crée un nouveau token. À appeler depuis le handler admin de création.
 * @returns { plain, hash, prefix } — `plain` à transmettre une fois, `hash`
 *          et `prefix` à persister.
 */
export async function generateAgentToken(): Promise<GeneratedAgentToken> {
  const secret = randomBase62(TOKEN_SECRET_LENGTH)
  const plain = `${TOKEN_PREFIX}${secret}`
  const hash = await bcrypt.hash(plain, BCRYPT_ROUNDS)
  const prefix = plain.slice(0, TOKEN_PREFIX_DISPLAY_CHARS)
  return { plain, hash, prefix }
}

/**
 * Valide le format d'un token sans accès DB. Ne dit rien sur son authenticité.
 */
export function isValidTokenFormat(plain: unknown): plain is string {
  return typeof plain === 'string' && TOKEN_REGEX.test(plain)
}

/**
 * Extrait le prefix lookup (12 premiers chars) d'un token plain.
 * @throws si le format est invalide.
 */
export function extractPrefix(plain: string): string {
  if (!isValidTokenFormat(plain)) {
    throw new Error('Format de token invalide')
  }
  return plain.slice(0, TOKEN_PREFIX_DISPLAY_CHARS)
}

/**
 * Vérifie qu'un token en clair correspond à un hash bcrypt. Ne throw jamais.
 */
export async function verifyAgentToken(plain: unknown, hash: unknown): Promise<boolean> {
  if (!isValidTokenFormat(plain)) return false
  if (typeof hash !== 'string' || hash.length === 0) return false
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}
