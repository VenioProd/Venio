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

const VALID_TYPES = new Set([
  'SALE',
  'REFUND',
  'EXPENSE',
  'FEE',
  'PAYMENT',
  'TRANSFER',
  'ADJUSTMENT',
])

const AUX_KINDS = new Set(['CLIENT', 'SUPPLIER', 'OTHER'])

function validationError(errors) {
  const err = new Error('Payload invalide')
  err.status = 422
  err.errors = errors
  return err
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n)
}

function parseDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function normalizeLine(line, index, errors) {
  if (!line || typeof line !== 'object') {
    errors.push({ field: `lines[${index}]`, message: 'Ligne invalide' })
    return null
  }
  const accountCode = String(line.accountCode || line.account || '').trim()
  if (!accountCode) {
    errors.push({ field: `lines[${index}].accountCode`, message: 'accountCode requis' })
  }
  const debit = round2(line.debit)
  const credit = round2(line.credit)
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
  let auxiliaryRef
  if (line.auxiliaryRef && typeof line.auxiliaryRef === 'object') {
    const kind = String(line.auxiliaryRef.kind || '').toUpperCase()
    if (kind && !AUX_KINDS.has(kind)) {
      errors.push({
        field: `lines[${index}].auxiliaryRef.kind`,
        message: 'kind doit être CLIENT, SUPPLIER ou OTHER',
      })
    }
    auxiliaryRef = {
      kind: kind || '',
      externalId: line.auxiliaryRef.externalId ? String(line.auxiliaryRef.externalId) : '',
    }
  }
  return {
    accountCode,
    label: line.label ? String(line.label) : '',
    debit,
    credit,
    vatRateValue:
      line.vatRateValue != null && Number.isFinite(Number(line.vatRateValue))
        ? Number(line.vatRateValue)
        : null,
    lettrage: line.lettrage ? String(line.lettrage) : '',
    auxiliaryRef,
  }
}

/**
 * Valide et normalise un payload entrant.
 *
 * MVP : refuse explicitement currency !== 'EUR' avec 422.
 *
 * @param {object} rawEntry  Objet JSON tel que reçu après JSON.parse du raw body
 * @returns {object} normalized payload
 *   {
 *     externalId, type, date (Date), currency, description, category, tags[],
 *     metadata, journalCode?, lines?[],
 *     amount?, vatRate?, customerExternalId?
 *   }
 */
export function normalizePayload(rawEntry) {
  const errors = []
  if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
    throw validationError([{ field: '_root', message: 'Payload doit être un objet JSON' }])
  }

  const externalId = String(rawEntry.externalId || '').trim()
  if (!externalId) {
    errors.push({ field: 'externalId', message: 'externalId requis' })
  }

  const type = String(rawEntry.type || '').toUpperCase().trim()
  if (!type) {
    errors.push({ field: 'type', message: 'type requis' })
  } else if (!VALID_TYPES.has(type)) {
    errors.push({
      field: 'type',
      message: `type invalide (attendu : ${Array.from(VALID_TYPES).join(', ')})`,
    })
  }

  const date = parseDate(rawEntry.date)
  if (!date) {
    errors.push({ field: 'date', message: 'date requise (ISO 8601)' })
  }

  const currency = String(rawEntry.currency || 'EUR').toUpperCase().trim()
  if (currency !== 'EUR') {
    // MVP : multi-devises non supporté.
    // TODO(v2) : accepter d'autres devises et stocker originalAmount/originalCurrency
    // sur les lignes (conversion via taux du jour ou taux explicite côté payload).
    errors.push({
      field: 'currency',
      message: 'Multi-devises non supporté pour le MVP — utilisez EUR',
    })
  }

  const description = rawEntry.description ? String(rawEntry.description) : ''
  const category = rawEntry.category ? String(rawEntry.category) : ''
  const tags = Array.isArray(rawEntry.tags)
    ? rawEntry.tags.map((t) => String(t)).filter(Boolean)
    : []
  const metadata =
    rawEntry.metadata && typeof rawEntry.metadata === 'object' && !Array.isArray(rawEntry.metadata)
      ? rawEntry.metadata
      : {}

  // Mode 1 : structuré (lines fournies)
  let lines
  let journalCode
  if (Array.isArray(rawEntry.lines) && rawEntry.lines.length > 0) {
    journalCode = String(rawEntry.journalCode || '').toUpperCase().trim()
    if (!journalCode) {
      errors.push({
        field: 'journalCode',
        message: 'journalCode requis quand lines est fourni (mode structuré)',
      })
    }
    if (rawEntry.lines.length < 2) {
      errors.push({
        field: 'lines',
        message: 'Au moins 2 lignes sont requises (double partie)',
      })
    }
    lines = rawEntry.lines.map((l, i) => normalizeLine(l, i, errors))
    // Équilibre débit / crédit (tolérance 0.01)
    if (lines.every(Boolean)) {
      const totalDebit = round2(lines.reduce((s, l) => s + (l?.debit || 0), 0))
      const totalCredit = round2(lines.reduce((s, l) => s + (l?.credit || 0), 0))
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        errors.push({
          field: 'lines',
          message: `Écriture déséquilibrée : total débit ${totalDebit} ≠ total crédit ${totalCredit}`,
        })
      }
    }
  }

  // Mode 2 : simplifié (amount + vatRate)
  let amount
  let vatRate
  let customerExternalId
  if (!lines) {
    if (rawEntry.amount == null || !Number.isFinite(Number(rawEntry.amount))) {
      errors.push({
        field: 'amount',
        message: 'amount requis (mode simplifié, sans lines)',
      })
    } else {
      amount = round2(rawEntry.amount)
      if (amount <= 0) {
        errors.push({ field: 'amount', message: 'amount doit être > 0' })
      }
    }
    if (rawEntry.vatRate != null) {
      const vr = Number(rawEntry.vatRate)
      if (!Number.isFinite(vr) || vr < 0 || vr > 100) {
        errors.push({ field: 'vatRate', message: 'vatRate doit être entre 0 et 100' })
      } else {
        vatRate = vr
      }
    } else {
      vatRate = 0
    }
    customerExternalId = rawEntry.customerExternalId
      ? String(rawEntry.customerExternalId)
      : ''
  }

  if (errors.length > 0) {
    throw validationError(errors)
  }

  return {
    externalId,
    type,
    date,
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
