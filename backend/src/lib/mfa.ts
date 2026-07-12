import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { TOTP } from 'otpauth'

export const PRIVILEGED_MFA_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const
const MFA_GRACE_PERIOD_DAYS = Math.max(1, Number(process.env.MFA_GRACE_PERIOD_DAYS || 7))
const TOTP_BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function requiresMfa(role: string): boolean {
  return (PRIVILEGED_MFA_ROLES as readonly string[]).includes(role)
}

export function graceEndsAt(): Date {
  return new Date(Date.now() + MFA_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
}

export function isMfaEnrollmentRoute(path: string): boolean {
  const pathname = path.split('?')[0]
  return ['/api/admin/2fa/setup', '/api/admin/2fa/verify', '/api/admin/2fa/status'].includes(pathname)
}

export function verifyTotp(secret: string, email: string, code: unknown): boolean {
  const totp = new TOTP({ issuer: 'Venio', label: email, algorithm: 'SHA1', digits: 6, period: 30, secret })
  return totp.validate({ token: String(code || ''), window: 1 }) !== null
}

/** Generate a fresh RFC 4648 base32 secret accepted by OTPAuth. */
export function createTotpSecret(length = 32): string {
  return Array.from(
    crypto.randomBytes(length),
    (byte) => TOTP_BASE32_ALPHABET[byte % TOTP_BASE32_ALPHABET.length],
  ).join('')
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
