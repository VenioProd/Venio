import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { decryptSecret } from './secretBox.js'
import { generateTotpSecret, matchTotpStep } from './auth/totp.js'

export const PRIVILEGED_MFA_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const
const MFA_GRACE_PERIOD_DAYS = Math.max(1, Number(process.env.MFA_GRACE_PERIOD_DAYS || 7))

/**
 * Interrupteur de la MFA *obligatoire* des rôles privilégiés (enrôlement
 * imposé après la période de grâce, élévation pour les actions sensibles),
 * désactivé par défaut : la friction quotidienne l'emportait sur le gain de
 * sécurité pour une équipe de cette taille. Poser MFA_ENABLED=true la réarme.
 *
 * Depuis VENIO-117, la 2FA *volontaire* est disponible pour tous les comptes
 * quel que soit cet interrupteur : un compte qui l'a activée la voit toujours
 * demandée à la connexion.
 *
 * Lu à chaud plutôt que figé au chargement du module, pour que les tests et
 * un rechargement de configuration n'aient pas à réimporter le module.
 */
export function isMfaEnabled(): boolean {
  return String(process.env.MFA_ENABLED ?? 'false').toLowerCase() === 'true'
}

export function requiresMfa(role: string): boolean {
  if (!isMfaEnabled()) return false
  return (PRIVILEGED_MFA_ROLES as readonly string[]).includes(role)
}

export function graceEndsAt(): Date {
  return new Date(Date.now() + MFA_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
}

export function isMfaEnrollmentRoute(path: string): boolean {
  const pathname = path.split('?')[0]
  return [
    '/api/admin/2fa/setup',
    '/api/admin/2fa/verify',
    '/api/admin/2fa/status',
    '/api/auth/2fa/setup',
    '/api/auth/2fa/confirm',
    '/api/auth/2fa/status',
  ].includes(pathname)
}

/**
 * Vérifie un code TOTP sans anti-rejeu (RFC 6238, node:crypto). Le secret peut
 * être chiffré (secretBox) ou, pour les enrôlements antérieurs, en clair.
 * Les parcours de connexion et d'élévation passent par verifyTotpOnce
 * (lib/auth/twoFactor.ts), qui refuse en plus la réutilisation d'un code.
 */
export function verifyTotp(secret: string, _email: string, code: unknown): boolean {
  return matchTotpStep(decryptSecret(secret), code) !== null
}

/** Secret RFC 4648 base32 de 160 bits (32 caractères). */
export function createTotpSecret(): string {
  return generateTotpSecret()
}

// Displayed once. Persist only bcrypt hashes, so a database read cannot reuse them.
export async function createRecoveryCodes(count = 10): Promise<{ codes: string[]; hashes: string[] }> {
  const codes = Array.from({ length: count }, () =>
    crypto
      .randomBytes(5)
      .toString('hex')
      .toUpperCase()
      .match(/.{1,5}/g)!
      .join('-'),
  )
  return { codes, hashes: await Promise.all(codes.map((code) => bcrypt.hash(code, 12))) }
}

export async function consumeRecoveryCode(
  hashes: string[],
  code: unknown,
): Promise<{ valid: boolean; hashes: string[] }> {
  const normalized = String(code || '')
    .trim()
    .toUpperCase()
  if (!normalized) return { valid: false, hashes }
  for (let index = 0; index < hashes.length; index += 1) {
    if (await bcrypt.compare(normalized, hashes[index])) {
      return { valid: true, hashes: hashes.filter((_, current) => current !== index) }
    }
  }
  return { valid: false, hashes }
}
