/**
 * Politique de mot de passe (VENIO-117), appliquée à toute création ou
 * modification : réinitialisation, changement, création ou modification d'un
 * compte par un administrateur ou par l'API agent.
 *
 * Elle n'est jamais appliquée à la connexion : un mot de passe existant reste
 * valide ; la connexion signale seulement qu'il est à renforcer.
 */

export const MIN_PASSWORD_LENGTH = 12
/** bcrypt ignore au-delà de 72 octets ; la borne évite surtout un hachage abusif. */
export const MAX_PASSWORD_LENGTH = 128

export type PasswordPolicyCode =
  | 'PASSWORD_REQUIRED'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_TOO_COMMON'
  | 'PASSWORD_CONTAINS_IDENTITY'

export type PasswordPolicyResult = { ok: true } | { ok: false; code: PasswordPolicyCode; message: string }

/**
 * Liste courte des mots de passe et racines les plus répandus (classements
 * publics des fuites, adaptés au français). Comparée au mot de passe entier et
 * à sa partie alphabétique : « Password2026!! » se ramène à « password ».
 */
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

/** Suite de touches ou de caractères (« abcdefghijkl », « 987654321098 ») ou répétition (« aaaaaaaaaaaa »). */
function isSequentialOrRepetitive(lower: string): boolean {
  if (new Set(lower).size <= 3) return true
  return SEQUENCES.some((sequence) => {
    const reversed = [...sequence].reverse().join('')
    return sequence.includes(lower) || reversed.includes(lower)
  })
}

/** Fragments d'identité à ne pas retrouver dans le mot de passe. */
function identityFragments(identity: { email?: string | null; name?: string | null }): string[] {
  const fragments = new Set<string>()
  const email = normalize(String(identity.email ?? '').trim())
  const local = email.split('@')[0] ?? ''
  if (local.length >= 3) fragments.add(local)
  for (const part of local.split(/[^a-z0-9]+/)) if (part.length >= 4) fragments.add(part)
  const name = normalize(String(identity.name ?? '').trim())
  for (const part of name.split(/[^a-z0-9]+/)) if (part.length >= 4) fragments.add(part)
  const compactName = name.replace(/[^a-z0-9]/g, '')
  if (compactName.length >= 4) fragments.add(compactName)
  return [...fragments]
}

export function checkPasswordPolicy(
  password: unknown,
  identity: { email?: string | null; name?: string | null } = {},
): PasswordPolicyResult {
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, code: 'PASSWORD_REQUIRED', message: 'Le mot de passe est requis.' }
  }
  if ([...password].length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      code: 'PASSWORD_TOO_SHORT',
      message: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`,
    }
  }
  if ([...password].length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      code: 'PASSWORD_TOO_LONG',
      message: `Le mot de passe ne doit pas dépasser ${MAX_PASSWORD_LENGTH} caractères.`,
    }
  }
  const lower = normalize(password)
  const letters = lower.replace(/[^a-z]/g, '')
  const letterRuns = lower.split(/[^a-z]+/).filter(Boolean)
  if (
    COMMON_PASSWORDS.has(lower) ||
    COMMON_ROOTS.has(letters) ||
    (letterRuns.length > 0 && letterRuns.every((run) => COMMON_ROOTS.has(run))) ||
    isSequentialOrRepetitive(lower)
  ) {
    return {
      ok: false,
      code: 'PASSWORD_TOO_COMMON',
      message: 'Ce mot de passe est trop courant ou trop prévisible. Choisissez-en un autre.',
    }
  }
  const compact = lower.replace(/[^a-z0-9]/g, '')
  if (identityFragments(identity).some((fragment) => lower.includes(fragment) || compact.includes(fragment))) {
    return {
      ok: false,
      code: 'PASSWORD_CONTAINS_IDENTITY',
      message: 'Le mot de passe ne doit contenir ni votre e-mail ni votre nom.',
    }
  }
  return { ok: true }
}

/** Mot de passe accepté à la connexion mais ne respectant plus la politique : à renforcer. */
export function passwordNeedsUpgrade(password: unknown, identity: { email?: string | null; name?: string | null }) {
  return !checkPasswordPolicy(password, identity).ok
}

/** Corps d'erreur HTTP 400 prêt à renvoyer, ou null si le mot de passe est conforme. */
export function passwordPolicyError(
  password: unknown,
  identity: { email?: string | null; name?: string | null } = {},
): { error: string; code: PasswordPolicyCode } | null {
  const verdict = checkPasswordPolicy(password, identity)
  return verdict.ok ? null : { error: verdict.message, code: verdict.code }
}
