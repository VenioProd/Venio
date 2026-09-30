import { qualificationHeadline, validateQualification, type ContactQualification } from './contactQualification.js'

export interface ContactSubmission {
  firstName: string
  lastName: string
  email: string
  /** Optionnel : vide quand le formulaire ne demande pas de numéro. */
  phone: string
  company: string
  subject: string
  message: string
  /** Relevé du formulaire en cinq étapes ; absent pour l'ancien payload. */
  qualification?: ContactQualification
}

export type ContactValidationResult =
  { ok: true; submission: ContactSubmission } | { ok: false; reason: 'invalid' | 'too_fast' | 'honeypot' }

const MAX_LENGTHS = {
  firstName: 80,
  lastName: 80,
  email: 254,
  phone: 40,
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
  // Le téléphone n'est jamais requis : seule sa longueur est bornée, comme les
  // autres champs facultatifs. Une valeur trop longue reste un refus explicite.
  const phone = normalizeSingleLine(raw.phone ?? '', MAX_LENGTHS.phone)
  const company = normalizeSingleLine(raw.company ?? '', MAX_LENGTHS.company)
  let subject = normalizeSingleLine(raw.subject ?? '', MAX_LENGTHS.subject)
  let message = normalizeMessage(raw.message ?? '')

  // Le relevé est optionnel (rétrocompatibilité), mais s'il est fourni il doit
  // être entièrement conforme : aucune clé ni valeur hors liste blanche.
  let qualification: ContactQualification | undefined
  if (raw.qualification !== undefined && raw.qualification !== null) {
    const parsed = validateQualification(raw.qualification)
    if (!parsed.ok) return { ok: false, reason: 'invalid' }
    qualification = parsed.qualification
  }

  // Sans relevé, le message reste obligatoire ; avec un relevé, il devient un
  // complément facultatif.
  if (message === '' && !qualification) message = null

  if (qualification && subject === '') {
    subject = `Qualification : ${qualificationHeadline(qualification)}`.slice(0, MAX_LENGTHS.subject)
  }

  if (
    !firstName ||
    lastName === null ||
    (!lastName && !qualification) ||
    !email ||
    !isEmail(email) ||
    phone === null ||
    company === null ||
    subject === null ||
    message === null
  ) {
    return { ok: false, reason: 'invalid' }
  }

  return {
    ok: true,
    submission: {
      firstName,
      lastName,
      email,
      phone,
      company,
      subject,
      message,
      ...(qualification ? { qualification } : {}),
    },
  }
}
