import crypto from 'crypto'

// A seven-day lifetime limits the impact of a forwarded or forgotten link
// while remaining practical for a client who must first sign in.
export const PROJECT_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

/** Generate a 256-bit URL-safe bearer secret. It is never persisted raw. */
export function createProjectInvitationToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/** SHA-256 is safe here because the input has 256 bits of CSPRNG entropy. */
export function hashProjectInvitationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function isValidProjectInvitationToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token)
}
