import mongoose from 'mongoose'
import FiscalYear from '../../../models/FiscalYear.js'
import { computeAccountBalances, round2 } from './balanceCompute.js'

function toObjectId(value) {
  if (!value) return null
  if (value instanceof mongoose.Types.ObjectId) return value
  if (typeof value === 'string' && mongoose.isValidObjectId(value)) {
    return new mongoose.Types.ObjectId(value)
  }
  if (value._id) return toObjectId(value._id)
  return null
}

/**
 * Bilan = état des soldes à une date donnée.
 *  - Actif  : comptes type ACTIF (classes 2/3/4 partie actif/5 partie actif)  → solde débiteur
 *  - Passif : comptes type PASSIF + CAPITAUX (classes 1/4 partie passif)       → solde créditeur
 *  - Le résultat de l'exercice (Σ produits 7 - Σ charges 6) est intégré au passif
 *    via le compte 120 (bénéfice) ou 129 (perte).
 *
 * @param {Object} params
 * @param {ObjectId|string} [params.fiscalYear]  Si non fourni, on prend l'exercice contenant `asOf`.
 * @param {Date|string} [params.asOf]            Date d'arrêt (default = endDate de l'exercice).
 */
export async function getBalanceSheet({ fiscalYear, asOf } = {}) {
  // Résolution de l'exercice.
  let fyDoc = null
  const fyId = toObjectId(fiscalYear)
  if (fyId) {
    fyDoc = await FiscalYear.findById(fyId).lean()
  }
  const asOfDate = asOf
    ? (asOf instanceof Date ? asOf : new Date(asOf))
    : null

  if (!fyDoc) {
    fyDoc = await FiscalYear.findContaining(asOfDate || new Date())
    if (fyDoc && typeof fyDoc.toObject === 'function') fyDoc = fyDoc.toObject()
  }

  if (!fyDoc) {
    const err = new Error('Aucun exercice trouvé pour la date demandée')
    err.status = 400
    throw err
  }

  // Date de référence pour le bilan : asOf, ou la fin de l'exercice.
  const reportDate = asOfDate || fyDoc.endDate

  // Soldes des comptes de bilan (classes 1 à 5).
  const balanceAccounts = await computeAccountBalances({
    fiscalYear: fyDoc._id,
    to: reportDate,
    accountCodePrefixes: ['1', '2', '3', '4', '5'],
  })

  // Soldes de gestion (classes 6 et 7) pour calculer le résultat de l'exercice.
  const pnlAccounts = await computeAccountBalances({
    fiscalYear: fyDoc._id,
    to: reportDate,
    accountCodePrefixes: ['6', '7'],
  })

  // Résultat = produits (crédit-débit) - charges (débit-crédit)
  let totalCharges = 0
  let totalProduits = 0
  for (const a of pnlAccounts) {
    if (a.accountClass === 6) {
      totalCharges = round2(totalCharges + a.balance) // débiteur
    } else if (a.accountClass === 7) {
      totalProduits = round2(totalProduits + (-a.balance)) // créditeur → positif
    }
  }
  const resultExercise = round2(totalProduits - totalCharges)

  // Construction des listes actif/passif.
  const actif = []
  const passif = []
  const notes = []

  for (const a of balanceAccounts) {
    if (a.debit === 0 && a.credit === 0) continue
    const code = a.accountCode
    const label = a.accountLabel
    const accountClass = a.accountClass
    const type = a.type
    const balance = a.balance // débit - crédit

    if (type === 'ACTIF') {
      // Actif : on affiche le solde brut (débit - crédit).
      actif.push({ code, label, accountClass, amount: balance })
      if (balance < 0 && code.startsWith('411')) {
        notes.push(
          `Compte client ${code} avec solde créditeur (${balance.toFixed(2)} €) — devrait être reclassé en 419 (acompte client).`
        )
      }
    } else if (type === 'PASSIF' || type === 'CAPITAUX') {
      // Passif : on affiche -balance pour que les soldes créditeurs deviennent positifs.
      passif.push({ code, label, accountClass, amount: round2(-balance) })
    } else if (type === 'SPECIAL') {
      // Comptes spéciaux : on ne sait pas trancher → on note et on ignore du bilan.
      notes.push(`Compte ${code} (${label}) de type SPECIAL — non inclus dans le bilan.`)
    } else {
      // Pour les comptes mal typés mais en classe 1..5, on dispatch par classe.
      if ([2, 3, 5].includes(accountClass)) {
        actif.push({ code, label, accountClass, amount: balance })
      } else if ([1].includes(accountClass)) {
        passif.push({ code, label, accountClass, amount: round2(-balance) })
      } else if (accountClass === 4) {
        // Classe 4 : on dispatch suivant le signe.
        if (balance >= 0) actif.push({ code, label, accountClass, amount: balance })
        else passif.push({ code, label, accountClass, amount: round2(-balance) })
      } else {
        notes.push(`Compte ${code} (${label}) ignoré : classe ${accountClass}, type ${type}.`)
      }
    }
  }

  // Intégration du résultat de l'exercice au passif via 120 (bénéfice) ou 129 (perte).
  if (resultExercise !== 0) {
    if (resultExercise >= 0) {
      passif.push({
        code: '120',
        label: 'Résultat de l’exercice (bénéfice)',
        accountClass: 1,
        amount: resultExercise,
      })
    } else {
      passif.push({
        code: '129',
        label: 'Résultat de l’exercice (perte)',
        accountClass: 1,
        amount: round2(-resultExercise),
      })
    }
  }

  // Tris stables par code croissant.
  actif.sort((a, b) => a.code.localeCompare(b.code))
  passif.sort((a, b) => a.code.localeCompare(b.code))

  const totalActif = round2(actif.reduce((s, r) => s + r.amount, 0))
  const totalPassif = round2(passif.reduce((s, r) => s + r.amount, 0))
  const imbalance = round2(totalActif - totalPassif)

  if (Math.abs(imbalance) > 0.01) {
    notes.push(
      `Bilan déséquilibré : actif ${totalActif.toFixed(2)} ≠ passif ${totalPassif.toFixed(2)} (écart ${imbalance.toFixed(2)}).`
    )
  }

  return {
    asOf: reportDate,
    fiscalYear: {
      _id: fyDoc._id,
      code: fyDoc.code,
      label: fyDoc.label || '',
    },
    actif,
    passif,
    totalActif,
    totalPassif,
    imbalance,
    resultExercise,
    notes,
  }
}
