import mongoose from 'mongoose'
import AccountingEntry from '../../models/AccountingEntry.js'
import AccountingLine from '../../models/AccountingLine.js'
import Journal from '../../models/Journal.js'
import ChartOfAccount from '../../models/ChartOfAccount.js'
import FiscalYear from '../../models/FiscalYear.js'
import { getNextSequence } from '../../models/Sequence.js'

const EPSILON = 0.005

function roundCents(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

/**
 * Récupère ou crée l'exercice qui contient une date donnée.
 * Si aucun exercice ouvert ne couvre la date, en crée un par année calendaire.
 */
export async function ensureFiscalYearFor(date) {
  const target = date instanceof Date ? date : new Date(date)
  const existing = await FiscalYear.findContaining(target)
  if (existing) return existing
  const year = target.getUTCFullYear()
  const start = new Date(Date.UTC(year, 0, 1))
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59))
  const code = `FY-${year}`
  const fiscal = await FiscalYear.findOneAndUpdate(
    { code },
    { code, label: `Exercice ${year}`, startDate: start, endDate: end, status: 'OUVERT' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  return fiscal
}

async function getJournalByCodeOrId(journalRef) {
  if (!journalRef) throw new Error('Journal requis')
  if (typeof journalRef === 'string' && mongoose.isValidObjectId(journalRef)) {
    return Journal.findById(journalRef)
  }
  if (typeof journalRef === 'string') {
    return Journal.findByCode(journalRef)
  }
  if (journalRef._id) return journalRef
  return null
}

async function resolveAccount(accountRef) {
  if (!accountRef) throw new Error('Compte requis sur une ligne')
  if (typeof accountRef === 'string' && mongoose.isValidObjectId(accountRef)) {
    return ChartOfAccount.findById(accountRef)
  }
  if (typeof accountRef === 'string') {
    return ChartOfAccount.findOne({ code: accountRef })
  }
  if (accountRef._id) return accountRef
  return null
}

/**
 * Crée une écriture en double partie atomiquement.
 *
 * @param {Object} input
 * @param {string|Object} input.journal      Journal code (ex: 'VE') ou id ou doc
 * @param {Date|string}   input.date         Date de l'écriture
 * @param {string}        input.label        Libellé général
 * @param {string}        [input.pieceRef]   Référence pièce (n° facture/relevé)
 * @param {Array<Object>} input.lines        Au moins 2 lignes équilibrées
 *   Chaque ligne : { account: codeOuId, label, debit, credit, vatRate?, lettrage? }
 * @param {string}        [input.source]     MANUAL/BILLING/PAYMENT/EXTERNAL/AN/SYSTEM
 * @param {Object}        [input.sourceRef]  { kind, id }
 * @param {string|null}   [input.idempotencyKey]
 * @param {string}        [input.status]     DRAFT (default) ou VALIDATED
 * @param {string}        [input.createdBy]  user id
 * @param {string}        [input.notes]
 * @param {string}        [input.currency]   default EUR
 * @returns {Promise<{ entry, lines }>}
 */
export async function createEntry(input) {
  const {
    journal: journalRef,
    date,
    label = '',
    pieceRef = '',
    lines,
    source = 'MANUAL',
    sourceRef = null,
    idempotencyKey = null,
    status = 'DRAFT',
    createdBy = null,
    notes = '',
    currency = 'EUR',
    externalSource = null,
  } = input || {}

  if (!Array.isArray(lines) || lines.length < 2) {
    const err = new Error('Au moins 2 lignes sont requises (double partie)')
    err.status = 400
    throw err
  }

  const journal = await getJournalByCodeOrId(journalRef)
  if (!journal) {
    const err = new Error('Journal introuvable')
    err.status = 400
    throw err
  }

  const entryDate = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(entryDate.getTime())) {
    const err = new Error('Date d’écriture invalide')
    err.status = 400
    throw err
  }

  const fiscalYear = await ensureFiscalYearFor(entryDate)
  if (fiscalYear.status === 'CLOTURE') {
    const err = new Error('L’exercice contenant cette date est clôturé')
    err.status = 423
    throw err
  }

  // Idempotency : si une écriture existe déjà avec cette clé, la retourner
  if (idempotencyKey) {
    const existing = await AccountingEntry.findOne({ idempotencyKey })
    if (existing) {
      const existingLines = await AccountingLine.find({ entry: existing._id }).sort({ sortIndex: 1 })
      return { entry: existing, lines: existingLines, alreadyExisted: true }
    }
  }

  // Résolution des comptes + validation
  const resolvedLines = []
  let totalDebit = 0
  let totalCredit = 0
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]
    const account = await resolveAccount(raw.account)
    if (!account) {
      const err = new Error(`Ligne ${i + 1} : compte introuvable (${raw.account})`)
      err.status = 400
      throw err
    }
    const debit = roundCents(raw.debit)
    const credit = roundCents(raw.credit)
    if (debit < 0 || credit < 0) {
      const err = new Error(`Ligne ${i + 1} : débit/crédit doivent être ≥ 0`)
      err.status = 400
      throw err
    }
    if (debit > 0 && credit > 0) {
      const err = new Error(`Ligne ${i + 1} : une ligne ne peut pas être à la fois débit ET crédit`)
      err.status = 400
      throw err
    }
    if (debit === 0 && credit === 0) {
      const err = new Error(`Ligne ${i + 1} : montant nul interdit`)
      err.status = 400
      throw err
    }
    totalDebit = roundCents(totalDebit + debit)
    totalCredit = roundCents(totalCredit + credit)
    resolvedLines.push({
      raw,
      account,
      debit,
      credit,
    })
  }

  if (Math.abs(totalDebit - totalCredit) > EPSILON) {
    const err = new Error(
      `Écriture déséquilibrée : total débit ${totalDebit} ≠ total crédit ${totalCredit}`
    )
    err.status = 400
    throw err
  }

  // Numérotation séquentielle par journal+année
  const yearForNumbering = entryDate.getUTCFullYear()
  const seqName = `accounting:${journal.code}:${yearForNumbering}`
  const { value } = await getNextSequence(seqName, { padding: 0 })
  const entryNumber = `${journal.code}-${yearForNumbering}-${String(value).padStart(5, '0')}`

  // Persistance : on tente une transaction si replica set, sinon best effort
  // avec cleanup manuel en cas d'échec sur l'insertion des lignes.
  let entry = null
  try {
    const entryDoc = await AccountingEntry.create({
      journal: journal._id,
      journalCode: journal.code,
      fiscalYear: fiscalYear._id,
      entryNumber,
      date: entryDate,
      label,
      pieceRef,
      status,
      source,
      sourceRef: sourceRef || undefined,
      externalSource: externalSource || undefined,
      idempotencyKey: idempotencyKey || undefined,
      totalDebit,
      totalCredit,
      currency,
      createdBy: createdBy || undefined,
      validatedBy: status === 'VALIDATED' ? createdBy || undefined : undefined,
      validatedAt: status === 'VALIDATED' ? new Date() : undefined,
      notes,
    })
    entry = entryDoc

    const lineDocs = []
    for (let i = 0; i < resolvedLines.length; i += 1) {
      const { raw, account, debit, credit } = resolvedLines[i]
      lineDocs.push({
        entry: entry._id,
        journalCode: journal.code,
        fiscalYear: fiscalYear._id,
        date: entryDate,
        account: account._id,
        accountCode: account.code,
        accountLabel: account.label,
        label: raw.label || label,
        debit,
        credit,
        vatRate: raw.vatRate || undefined,
        vatRateValue: raw.vatRateValue != null ? Number(raw.vatRateValue) : undefined,
        currency,
        lettrage: raw.lettrage || '',
        lettrageDate: raw.lettrage ? new Date() : null,
        auxiliaryRef: raw.auxiliaryRef || undefined,
        sortIndex: i,
      })
    }

    const insertedLines = await AccountingLine.insertMany(lineDocs)

    return { entry, lines: insertedLines }
  } catch (err) {
    // Cleanup best-effort : si on a créé l'entry mais raté les lines, on supprime l'entry
    if (entry?._id) {
      try {
        await AccountingLine.deleteMany({ entry: entry._id })
        await AccountingEntry.deleteOne({ _id: entry._id })
      } catch {
        /* noop */
      }
    }
    throw err
  }
}

/**
 * Valide une écriture DRAFT → VALIDATED.
 * Re-vérifie l'équilibre.
 */
export async function validateEntry(entryId, { userId } = {}) {
  const entry = await AccountingEntry.findById(entryId)
  if (!entry) {
    const err = new Error('Écriture introuvable')
    err.status = 404
    throw err
  }
  if (entry.status === 'LOCKED') {
    const err = new Error('Écriture verrouillée')
    err.status = 423
    throw err
  }
  if (entry.status === 'VALIDATED') {
    return entry
  }
  const lines = await AccountingLine.find({ entry: entry._id })
  const totDebit = lines.reduce((s, l) => s + l.debit, 0)
  const totCredit = lines.reduce((s, l) => s + l.credit, 0)
  if (Math.abs(totDebit - totCredit) > EPSILON) {
    const err = new Error(`Écriture déséquilibrée : ${totDebit} ≠ ${totCredit}`)
    err.status = 400
    throw err
  }
  entry.status = 'VALIDATED'
  entry.validatedAt = new Date()
  entry.validatedBy = userId || entry.validatedBy
  entry.totalDebit = roundCents(totDebit)
  entry.totalCredit = roundCents(totCredit)
  await entry.save()
  return entry
}

export async function deleteDraftEntry(entryId) {
  const entry = await AccountingEntry.findById(entryId)
  if (!entry) {
    const err = new Error('Écriture introuvable')
    err.status = 404
    throw err
  }
  if (entry.status !== 'DRAFT') {
    const err = new Error('Seules les écritures DRAFT peuvent être supprimées')
    err.status = 400
    throw err
  }
  await AccountingLine.deleteMany({ entry: entry._id })
  await entry.deleteOne()
  return true
}
