/**
 * Catalogue exhaustif des scopes V1 pour l'API agent.
 *
 * Pattern : `read:<module>` (lecture) / `write:<module>` (mutations) + scopes
 * sensibles dédiés (manage:backup, manage:2fa, trigger:automations).
 *
 * Le super-scope `admin:*` octroie tout — à n'attribuer qu'à des tokens
 * master (toi-même, Kuro prod).
 *
 * Conventions :
 *   - `write:X` n'implique PAS `read:X`. Si tu veux lire + écrire, mets
 *     les deux dans le tableau scopes du token.
 *   - Les scopes inconnus sont rejetés à la création du token.
 */

export const ADMIN_WILDCARD_SCOPE = 'admin:*'

export const AGENT_SCOPES = [
  // Core métier
  'read:crm', 'write:crm',
  'read:projects', 'write:projects',
  'read:billing', 'write:billing',
  'read:documents', 'write:documents',

  // Comptabilité : lecture seule en V1
  'read:accounting',

  // Collaboration
  'read:tasks', 'write:tasks',
  'read:tickets', 'write:tickets',
  'read:messages', 'write:messages',
  'read:notifications', 'write:notifications',
  'read:calendar', 'write:calendar',

  // Formation
  'read:qualiopi', 'write:qualiopi',
  'read:interns', 'write:interns',

  // Ressources / configuration entreprise
  'read:toolaccess', 'write:toolaccess',
  'read:resources', 'write:resources',
  'read:gestion', 'write:gestion',
  'read:arrow', 'write:arrow',

  // Reporting / observabilité (lecture seule par nature)
  'read:analytics',
  'read:audit',

  // Automation engine V2
  'read:automations', 'write:automations', 'trigger:automations',

  // Sensibles
  'read:backup', 'manage:backup',
  'read:2fa', 'manage:2fa',

  // Users (admin)
  'read:users', 'write:users',

  // Super-scope
  ADMIN_WILDCARD_SCOPE,
] as const

export type AgentScope = (typeof AGENT_SCOPES)[number]

const SCOPE_SET = new Set<string>(AGENT_SCOPES)

/**
 * Valide une liste de scopes. Retourne la liste des scopes inconnus
 * (vide si tout va bien).
 */
export function findUnknownScopes(scopes: readonly unknown[]): string[] {
  const out: string[] = []
  for (const s of scopes) {
    if (typeof s !== 'string' || !SCOPE_SET.has(s)) {
      out.push(typeof s === 'string' ? s : String(s))
    }
  }
  return out
}

/**
 * Vérifie qu'un token possède TOUS les scopes requis.
 *
 * Sémantique :
 *   - admin:* octroie tout
 *   - sinon il faut que chaque scope requis soit dans granted
 *
 * @returns true si autorisé, false sinon.
 */
export function hasAllScopes(granted: readonly string[], required: readonly string[]): boolean {
  if (required.length === 0) return true
  if (granted.includes(ADMIN_WILDCARD_SCOPE)) return true
  const grantedSet = new Set(granted)
  for (const r of required) {
    if (!grantedSet.has(r)) return false
  }
  return true
}

/**
 * Liste les scopes manquants pour la réponse 403 INSUFFICIENT_SCOPE.
 */
export function missingScopes(granted: readonly string[], required: readonly string[]): string[] {
  if (granted.includes(ADMIN_WILDCARD_SCOPE)) return []
  const grantedSet = new Set(granted)
  return required.filter((r) => !grantedSet.has(r))
}
