/**
 * Normalisation + validation des payloads entrants venant d'une source externe.
 *
 * Le format public est documenté dans la spec /api/external/:sourceSlug/entries.
 * Cette couche garantit que le reste du pipeline (classifier, createEntry)
 * reçoit un objet propre et complet.
 *
 * En cas d'erreur : on throw une Error dont :
 *   err.status = 422
 *   err.errors = [{ field: 'currency', message: '...' }, ...]
 */

const VALID_TYPES = new Set<string>([
  'SALE',
  'REFUND',
  'EXPENSE',
  'FEE',
  'PAYMENT',
  'TRANSFER',
  'ADJUSTMENT',
])

const AUX_KINDS = new Set<string>(['CLIENT', 'SUPPLIER', 'OTHER'])

export interface PayloadFieldError {
  field: string
  message: string
}

export type PayloadError = Error & { status?: number; errors?: PayloadFieldError[] }

export interface NormalizedAuxiliaryRef {
  kind: string
  externalId: string
}

export interface NormalizedLine {
  accountCode: string
  label: string
  debit: number
  credit: number
  vatRateValue: number | null
  lettrage: string
  auxiliaryRef?: NormalizedAuxiliaryRef
}

export interface NormalizedPayload {
  externalId: string
  type: string
  date: Date
  currency: string
  description: string
  category: string
  tags: string[]
  metadata: Record<string, unknown>
  journalCode?: string
  lines?: NormalizedLine[]
  amount?: number
  vatRate?: number
  customerExternalId?: string
}

function validationError(errors: PayloadFieldError[]): PayloadError {
  const err = new Error('Payload invalide') as PayloadError
  err.status = 422
  err.errors = errors
  return err
}

function round2(n: unknown): number {
  return Math.round(Number(n || 0) * 100) / 100
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function parseDate(value: unknown): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value as string | number)
  return Number.isNaN(d.getTime()) ? null : d
}

interface RawLine {
  accountCode?: unknown
  account?: unknown
  label?: unknown
  debit?: unknown
  credit?: unknown
  vatRateValue?: unknown
  lettrage?: unknown
  auxiliaryRef?: { kind?: unknown; externalId?: unknown } | unknown
}

function normalizeLine(
  line: unknown,
  index: number,
  errors: PayloadFieldError[]
): NormalizedLine | null {
  if (!line || typeof line !== 'object') {
    errors.push({ field: `lines[${index}]`, message: 'Ligne invalide' })
    return null
  }
  const l = line as RawLine
  const accountCode = String(l.accountCode || l.account || '').trim()
  if (!accountCode) {
    errors.push({ field: `lines[${index}].accountCode`, message: 'accountCode requis' })
  }
  const debit = round2(l.debit)
  const credit = round2(l.credit)
  if (!isFiniteNumber(debit) || !isFiniteNumber(credit) || debit < 0 || credit < 0) {
    errors.push({
      field: `lines[${index}]`,
      message: 'debit et credit doivent être des nombres >= 0',
    })
  }
  if (debit > 0 && credit > 0) {
    errors.push({
      field: `lines[${index}]`,
      message: 'Une ligne ne peut pas être à la fois débit et crédit',
    })
  }
  if (debit === 0 && credit === 0) {
    errors.push({
      field: `lines[${index}]`,
      message: 'Montant nul interdit',
    })
  }
  let auxiliaryRef: NormalizedAuxiliaryRef | undefined
  if (l.auxiliaryRef && typeof l.auxiliaryRef === 'object') {
    const auxRaw = l.auxiliaryRef as { kind?: unknown; externalId?: unknown }
    const kind = String(auxRaw.kind || '').toUpperCase()
    if (kind && !AUX_KINDS.has(kind)) {
      errors.push({
        field: `lines[${index}].auxiliaryRef.kind`,
        message: 'kind doit être CLIENT, SUPPLIER ou OTHER',
      })
    }
    auxiliaryRef = {
      kind: kind || '',
      externalId: auxRaw.externalId ? String(auxRaw.externalId) : '',
    }
  }
  return {
    accountCode,
    label: l.label ? String(l.label) : '',
    debit,
    credit,
    vatRateValue:
      l.vatRateValue != null && Number.isFinite(Number(l.vatRateValue))
        ? Number(l.vatRateValue)
        : null,
    lettrage: l.lettrage ? String(l.lettrage) : '',
    auxiliaryRef,
  }
}

/**
 * Valide et normalise un payload entrant.
 *
 * MVP : refuse explicitement currency !== 'EUR' avec 422.
 *
 * @param rawEntry  Objet JSON tel que reçu après JSON.parse du raw body
 */
export function normalizePayload(rawEntry: unknown): NormalizedPayload {
  const errors: PayloadFieldError[] = []
  if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
    throw validationError([{ field: '_root', message: 'Payload doit être un objet JSON' }])
  }

  const raw = rawEntry as Record<string, unknown>

  const externalId = String(raw.externalId || '').trim()
  if (!externalId) {
    errors.push({ field: 'externalId', message: 'externalId requis' })
  }

  const type = String(raw.type || '').toUpperCase().trim()
  if (!type) {
    errors.push({ field: 'type', message: 'type requis' })
  } else if (!VALID_TYPES.has(type)) {
    errors.push({
      field: 'type',
      message: `type invalide (attendu : ${Array.from(VALID_TYPES).join(', ')})`,
    })
  }

  const date = parseDate(raw.date)
  if (!date) {
    errors.push({ field: 'date', message: 'date requise (ISO 8601)' })
  }

  const currency = String(raw.currency || 'EUR').toUpperCase().trim()
  if (currency !== 'EUR') {
    // MVP : multi-devises non supporté. Voir issue #80 pour stocker
    // originalAmount/originalCurrency et convertir via un taux du jour ou explicite.
    errors.push({
      field: 'currency',
      message: 'Multi-devises non supporté pour le MVP — utilisez EUR',
    })
  }

  const description = raw.description ? String(raw.description) : ''
  const category = raw.category ? String(raw.category) : ''
  const tags = Array.isArray(raw.tags)
    ? (raw.tags as unknown[]).map((t) => String(t)).filter(Boolean)
    : []
  const metadata =
    raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : {}

  // Mode 1 : structuré (lines fournies)
  let lines: NormalizedLine[] | undefined
  let journalCode: string | undefined
  if (Array.isArray(raw.lines) && (raw.lines as unknown[]).length > 0) {
    journalCode = String(raw.journalCode || '').toUpperCase().trim()
    if (!journalCode) {
      errors.push({
        field: 'journalCode',
        message: 'journalCode requis quand lines est fourni (mode structuré)',
      })
    }
    if ((raw.lines as unknown[]).length < 2) {
      errors.push({
        field: 'lines',
        message: 'Au moins 2 lignes sont requises (double partie)',
      })
    }
    const normalizedLines = (raw.lines as unknown[]).map((l, i) => normalizeLine(l, i, errors))
    // Équilibre débit / crédit (tolérance 0.01)
    if (normalizedLines.every(Boolean)) {
      const safeLines = normalizedLines as NormalizedLine[]
      const totalDebit = round2(safeLines.reduce((s, l) => s + (l?.debit || 0), 0))
      const totalCredit = round2(safeLines.reduce((s, l) => s + (l?.credit || 0), 0))
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        errors.push({
          field: 'lines',
          message: `Écriture déséquilibrée : total débit ${totalDebit} ≠ total crédit ${totalCredit}`,
        })
      }
      lines = safeLines
    } else {
      lines = normalizedLines.filter(Boolean) as NormalizedLine[]
    }
  }

  // Mode 2 : simplifié (amount + vatRate)
  let amount: number | undefined
  let vatRate: number | undefined
  let customerExternalId: string | undefined
  if (!lines) {
    if (raw.amount == null || !Number.isFinite(Number(raw.amount))) {
      errors.push({
        field: 'amount',
        message: 'amount requis (mode simplifié, sans lines)',
      })
    } else {
      amount = round2(raw.amount)
      if (amount <= 0) {
        errors.push({ field: 'amount', message: 'amount doit être > 0' })
      }
    }
    if (raw.vatRate != null) {
      const vr = Number(raw.vatRate)
      if (!Number.isFinite(vr) || vr < 0 || vr > 100) {
        errors.push({ field: 'vatRate', message: 'vatRate doit être entre 0 et 100' })
      } else {
        vatRate = vr
      }
    } else {
      vatRate = 0
    }
    customerExternalId = raw.customerExternalId ? String(raw.customerExternalId) : ''
  }

  if (errors.length > 0) {
    throw validationError(errors)
  }

  return {
    externalId,
    type,
    // date est non-null ici (sinon on aurait throw)
    date: date as Date,
    currency,
    description,
    category,
    tags,
    metadata,
    journalCode,
    lines,
    amount,
    vatRate,
    customerExternalId,
  }
}
