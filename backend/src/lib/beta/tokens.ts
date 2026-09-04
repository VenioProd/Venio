import crypto from 'crypto'

/**
 * Secret porté par le lien nominatif d'un testeur beta. Il circule dans l'URL,
 * donc il n'a pas la durée de vie d'un mot de passe : la campagne le périme et
 * l'admin peut le révoquer. Même patron que `lib/projectInvitations.ts`.
 */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

/** Génère un secret bearer url-safe de 256 bits. Jamais persisté en clair. */
export function createBetaTesterToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/** SHA-256 suffit : l'entrée porte déjà 256 bits d'entropie CSPRNG. */
export function hashBetaTesterToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function isValidBetaTesterToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token)
}
