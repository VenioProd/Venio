export interface ContactSubmission {
  firstName: string
  lastName: string
  email: string
  company: string
  subject: string
  message: string
}

export type ContactValidationResult =
  | { ok: true; submission: ContactSubmission }
  | { ok: false; reason: 'invalid' | 'too_fast' | 'honeypot' }

const MAX_LENGTHS = {
  firstName: 80,
  lastName: 80,
  email: 254,
  company: 160,
  subject: 100,
  message: 4000,
} as const

function normalizeSingleLine(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').replace(/\s+/g, ' ').trim()
  return normalized.length <= maxLength ? normalized : null
}

function normalizeMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').replace(/\r\n?/g, '\n').trim()
  return normalized.length <= MAX_LENGTHS.message ? normalized : null
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function validateContactSubmission(body: unknown, now = Date.now()): ContactValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'invalid' }

  const raw = body as Record<string, unknown>
  if (typeof raw.website === 'string' && raw.website.trim() !== '') return { ok: false, reason: 'honeypot' }
  if (raw.consent !== true) return { ok: false, reason: 'invalid' }

  const startedAt = typeof raw.startedAt === 'number' ? raw.startedAt : NaN
  if (!Number.isFinite(startedAt) || startedAt > now || now - startedAt < 1500) {
    return { ok: false, reason: 'too_fast' }
  }

  const firstName = normalizeSingleLine(raw.firstName, MAX_LENGTHS.firstName)
  const lastName = normalizeSingleLine(raw.lastName, MAX_LENGTHS.lastName)
  const email = normalizeSingleLine(raw.email, MAX_LENGTHS.email)?.toLowerCase() ?? null
  const company = normalizeSingleLine(raw.company ?? '', MAX_LENGTHS.company)
  const subject = normalizeSingleLine(raw.subject, MAX_LENGTHS.subject)
  const message = normalizeMessage(raw.message)

  if (!firstName || !lastName || !email || !isEmail(email) || company === null || !subject || !message) {
    return { ok: false, reason: 'invalid' }
  }

  return {
    ok: true,
    submission: { firstName, lastName, email, company, subject, message },
  }
}
