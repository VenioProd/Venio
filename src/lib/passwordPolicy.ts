/**
 * Miroir côté navigateur de la politique de mot de passe du serveur
 * (backend/src/lib/auth/passwordPolicy.ts, VENIO-117). Le serveur reste seul
 * juge : ce module sert à guider la saisie (jauge, message immédiat).
 */

export const MIN_PASSWORD_LENGTH = 12
export const MAX_PASSWORD_LENGTH = 128

export type PasswordIssue = 'tooShort' | 'tooLong' | 'tooCommon' | 'containsIdentity'

const COMMON_PASSWORDS = new Set([
  '123456789012',
  '1234567890123',
  '123456789123',
  '111111111111',
  '000000000000',
  'qwertyuiop12',
  'azertyuiop12',
  '1q2w3e4r5t6y',
  'a1b2c3d4e5f6',
  'iloveyou1234',
  'motdepasse123',
  'password1234',
  'password123!',
  'passwordpassword',
  'changeme1234',
])

const COMMON_ROOTS = new Set([
  'password',
  'passwort',
  'passw',
  'motdepasse',
  'mdp',
  'azerty',
  'azertyuiop',
  'qwerty',
  'qwertyuiop',
  'qwertz',
  'admin',
  'administrator',
  'administrateur',
  'root',
  'user',
  'login',
  'welcome',
  'bienvenue',
  'bonjour',
  'salut',
  'soleil',
  'loulou',
  'doudou',
  'chouchou',
  'iloveyou',
  'jetaime',
  'letmein',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'master',
  'secret',
  'changeme',
  'test',
  'demo',
  'venio',
  'abc',
  'abcdef',
  'abcdefgh',
  'abcdefghijkl',
])

const SEQUENCES = [
  'abcdefghijklmnopqrstuvwxyz',
  '01234567890123456789',
  'azertyuiopqsdfghjklmwxcvbn',
  'qwertyuiopasdfghjklzxcvbnm',
]

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function isTrivial(lower: string): boolean {
  if (new Set(lower).size <= 3) return true
  return SEQUENCES.some((sequence) => {
    const reversed = [...sequence].reverse().join('')
    return sequence.includes(lower) || reversed.includes(lower)
  })
}

function identityFragments(identity: { email?: string | null; name?: string | null }): string[] {
  const fragments = new Set<string>()
  const local = normalize(String(identity.email ?? '').trim()).split('@')[0] ?? ''
  if (local.length >= 3) fragments.add(local)
  for (const part of local.split(/[^a-z0-9]+/)) if (part.length >= 4) fragments.add(part)
  const name = normalize(String(identity.name ?? '').trim())
  for (const part of name.split(/[^a-z0-9]+/)) if (part.length >= 4) fragments.add(part)
  const compactName = name.replace(/[^a-z0-9]/g, '')
  if (compactName.length >= 4) fragments.add(compactName)
  return [...fragments]
}

/** Premier manquement à la politique, ou null si le mot de passe est conforme. */
export function passwordIssue(
  password: string,
  identity: { email?: string | null; name?: string | null } = {},
): PasswordIssue | null {
  const length = [...password].length
  if (length < MIN_PASSWORD_LENGTH) return 'tooShort'
  if (length > MAX_PASSWORD_LENGTH) return 'tooLong'
  const lower = normalize(password)
  const letters = lower.replace(/[^a-z]/g, '')
  const runs = lower.split(/[^a-z]+/).filter(Boolean)
  if (
    COMMON_PASSWORDS.has(lower) ||
    COMMON_ROOTS.has(letters) ||
    (runs.length > 0 && runs.every((run) => COMMON_ROOTS.has(run))) ||
    isTrivial(lower)
  ) {
    return 'tooCommon'
  }
  const compact = lower.replace(/[^a-z0-9]/g, '')
  if (identityFragments(identity).some((fragment) => lower.includes(fragment) || compact.includes(fragment))) {
    return 'containsIdentity'
  }
  return null
}

/**
 * Score de 0 à 4 pour la jauge : 0 tant que la politique n'est pas
 * respectée, puis selon la longueur et la variété des caractères.
 */
export function passwordStrength(
  password: string,
  identity: { email?: string | null; name?: string | null } = {},
): 0 | 1 | 2 | 3 | 4 {
  if (!password || passwordIssue(password, identity)) return 0
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length
  const length = [...password].length
  let score = 1
  if (length >= 14 || classes >= 3) score += 1
  if (length >= 16 && classes >= 2) score += 1
  if (length >= 20 || (length >= 14 && classes === 4)) score += 1
  return Math.min(score, 4) as 1 | 2 | 3 | 4
}
