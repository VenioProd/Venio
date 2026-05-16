import mongoose from 'mongoose'
import AccountingLine from '../../models/AccountingLine.js'
import AccountingEntry from '../../models/AccountingEntry.js'
import ChartOfAccount from '../../models/ChartOfAccount.js'

// Helpers de lettrage : génération de codes A, B, ..., Z, AA, AB, ..., AZ, ...,
// lettrage d'un groupe de lignes, et déletrage d'un code complet.
//
// Toutes les vérifications respectent la règle : on ne lettre QUE des lignes
// dont l'écriture parente est VALIDATED ou LOCKED (jamais DRAFT).

const VALID_STATUSES = ['VALIDATED', 'LOCKED']
const EPSILON = 0.01

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

/**
 * Convertit une string alphabétique (base 26) en entier 1-based.
 * 'A' -> 1, 'Z' -> 26, 'AA' -> 27, 'AZ' -> 52, 'BA' -> 53, ...
 */
function alphaToInt(s) {
  if (!s) return 0
  let n = 0
  for (const ch of s.toUpperCase()) {
    const code = ch.charCodeAt(0) - 64 // A=1
    if (code < 1 || code > 26) return 0
    n = n * 26 + code
  }
  return n
}

/**
 * Convertit un entier 1-based en string alphabétique (base 26).
 * 1 -> 'A', 26 -> 'Z', 27 -> 'AA', 52 -> 'AZ', 53 -> 'BA', ...
 */
function intToAlpha(n) {
  let value = Number(n)
  if (!value || value < 1) return 'A'
  let out = ''
  while (value > 0) {
    const r = (value - 1) % 26
    out = String.fromCharCode(65 + r) + out
    value = Math.floor((value - 1) / 26)
  }
  return out
}

/**
 * Génère le prochain code de lettrage disponible pour un compte.
 *
 * @param {string} accountCode
 * @returns {Promise<string>}
 */
export async function getNextLettrageCode(accountCode) {
  if (!accountCode) {
    const err = new Error('accountCode requis')
    err.status = 400
    throw err
  }
  // On regarde tous les codes existants pour ce compte et on prend le max.
  const existing = await AccountingLine.distinct('lettrage', {
    accountCode: String(accountCode),
    lettrage: { $ne: '' },
  })
  let maxInt = 0
  for (const code of existing) {
    if (!code || code === 'AN') continue // AN est réservé pour le report à nouveau
    const cleaned = String(code).trim().toUpperCase()
    if (!/^[A-Z]+$/.test(cleaned)) continue
    const n = alphaToInt(cleaned)
    if (n > maxInt) maxInt = n
  }
  return intToAlpha(maxInt + 1)
}

/**
 * Lettre un ensemble de lignes ensemble.
 *
 * @param {Object} params
 * @param {string[]} params.lineIds
 * @param {string} [params.code]      Code optionnel, sinon auto-généré
 * @param {boolean} [params.override] Permet de relettrer des lignes déjà lettrées
 * @returns {Promise<{
 *   code, accountCode, lineCount, totalDebit, totalCredit, balanced, partial
 * }>}
 */
export async function letterLines({ lineIds, code, override = false } = {}) {
  if (!Array.isArray(lineIds) || lineIds.length < 2) {
    const err = new Error('Au moins 2 lignes sont requises pour un lettrage')
    err.status = 400
    throw err
  }

  // Validation des IDs
  for (const id of lineIds) {
    if (!mongoose.isValidObjectId(id)) {
      const err = new Error(`lineId invalide : ${id}`)
      err.status = 400
      throw err
    }
  }

  const lines = await AccountingLine.find({ _id: { $in: lineIds } })
  if (lines.length !== lineIds.length) {
    const err = new Error('Certaines lignes sont introuvables')
    err.status = 404
    throw err
  }

  // Toutes les lignes doivent être sur le même compte.
  const accountCodes = new Set(lines.map((l) => l.accountCode))
  if (accountCodes.size > 1) {
    const err = new Error('Les lignes ne sont pas toutes sur le même compte')
    err.status = 400
    throw err
  }
  const accountCode = lines[0].accountCode

  // Le compte doit être lettrable.
  const account = await ChartOfAccount.findOne({ code: accountCode })
  if (!account) {
    const err = new Error(`Compte ${accountCode} introuvable au plan comptable`)
    err.status = 400
    throw err
  }
  if (!account.isLettrable) {
    const err = new Error(`Compte ${accountCode} non lettrable`)
    err.status = 400
    throw err
  }

  // Les écritures parentes doivent être VALIDATED ou LOCKED (pas DRAFT).
  const entryIds = Array.from(new Set(lines.map((l) => String(l.entry))))
  const entries = await AccountingEntry.find({ _id: { $in: entryIds } })
  for (const entry of entries) {
    if (!VALID_STATUSES.includes(entry.status)) {
      const err = new Error(`Écriture ${entry.entryNumber} en statut ${entry.status} : impossible à lettrer`)
      err.status = 400
      throw err
    }
  }

  // Vérification override : aucune ligne déjà lettrée sauf override.
  if (!override) {
    const alreadyLettered = lines.filter((l) => l.lettrage && l.lettrage.length > 0)
    if (alreadyLettered.length > 0) {
      const codes = Array.from(new Set(alreadyLettered.map((l) => l.lettrage))).join(', ')
      const err = new Error(`Lignes déjà lettrées (${codes}) — utiliser override=true pour forcer`)
      err.status = 400
      throw err
    }
  }

  // Code à utiliser
  let finalCode = code ? String(code).trim().toUpperCase() : null
  if (finalCode && !/^[A-Z]+$/.test(finalCode)) {
    const err = new Error('Le code de lettrage doit être alphabétique (A-Z)')
    err.status = 400
    throw err
  }
  if (!finalCode) {
    finalCode = await getNextLettrageCode(accountCode)
  }

  // Calcul équilibre
  const totalDebit = round2(lines.reduce((s, l) => s + (l.debit || 0), 0))
  const totalCredit = round2(lines.reduce((s, l) => s + (l.credit || 0), 0))
  const balanced = Math.abs(totalDebit - totalCredit) <= EPSILON
  const partial = !balanced

  // Mise à jour des lignes
  const now = new Date()
  await AccountingLine.updateMany(
    { _id: { $in: lineIds } },
    { $set: { lettrage: finalCode, lettrageDate: now } }
  )

  return {
    code: finalCode,
    accountCode,
    lineCount: lines.length,
    totalDebit,
    totalCredit,
    balanced,
    partial,
  }
}

/**
 * Supprime un code de lettrage sur toutes les lignes d'un compte.
 *
 * @param {string} accountCode
 * @param {string} code
 * @returns {Promise<{ unlinked: number }>}
 */
export async function unletterCode(accountCode, code) {
  if (!accountCode) {
    const err = new Error('accountCode requis')
    err.status = 400
    throw err
  }
  if (!code) {
    const err = new Error('code requis')
    err.status = 400
    throw err
  }
  const result = await AccountingLine.updateMany(
    { accountCode: String(accountCode), lettrage: String(code).toUpperCase() },
    { $set: { lettrage: '', lettrageDate: null } }
  )
  return { unlinked: result.modifiedCount || 0 }
}
