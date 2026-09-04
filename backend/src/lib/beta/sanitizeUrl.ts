/**
 * Nettoie l'URL qu'un client rapporte avec son verdict.
 *
 * Le danger vient du lien du testeur lui-même : il porte son secret dans le
 * chemin, et cette URL est recopiée dans la description de l'issue créée au
 * moment de la promotion — donc lisible par toute l'équipe, et exportable vers
 * un tracker externe. Un secret d'authentification n'a rien à y faire.
 *
 * On écarte donc toute URL pointant vers la surface de test, ainsi que les
 * jetons glissés en query ou en fragment.
 */
const BETA_LINK_PATH = /^\/beta\/[A-Za-z0-9_-]{20,}/

export function sanitizeReportedUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null

  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (BETA_LINK_PATH.test(parsed.pathname)) return null

  // Le fragment ne sert à rien au diagnostic et sert souvent de porte-jeton.
  parsed.hash = ''
  for (const key of [...parsed.searchParams.keys()]) {
    if (/token|secret|key|auth|session|password/i.test(key)) parsed.searchParams.delete(key)
  }

  return parsed.toString().replace(/\?$/, '').slice(0, 500)
}
