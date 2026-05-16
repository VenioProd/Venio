import BillingDocument from '../../models/BillingDocument.js'
import ChartOfAccount from '../../models/ChartOfAccount.js'
import VatRate from '../../models/VatRate.js'
import AccountingEntry from '../../models/AccountingEntry.js'
import { createEntry } from './doubleEntry.js'

const DEFAULT_CUSTOMER_ACCOUNT = '411000'
const DEFAULT_REVENUE_ACCOUNT = '706000'
const DEFAULT_COLLECTED_VAT_ACCOUNT = '445710'

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

/**
 * Construit la clé d'idempotence pour une facture donnée.
 */
export function buildBillingIdempotencyKey(billingDocId, kind = 'sale') {
  return `billing:${kind}:${String(billingDocId)}`
}

/**
 * Agrège les lignes d'une facture par taux de TVA pour générer
 * les écritures multi-taux conformes.
 */
function aggregateLinesByVatRate(lines) {
  const byRate = new Map()
  for (const line of lines || []) {
    const rate = Number(line.taxRate || 0)
    const total = Number(line.total || 0)
    const taxAmount = total * (rate / 100)
    if (!byRate.has(rate)) {
      byRate.set(rate, { ht: 0, tax: 0 })
    }
    const acc = byRate.get(rate)
    acc.ht += total
    acc.tax += taxAmount
  }
  // Arrondir et formatter
  const result = []
  for (const [rate, { ht, tax }] of byRate.entries()) {
    result.push({
      rate,
      ht: round2(ht),
      tax: round2(tax),
      ttc: round2(ht + tax),
    })
  }
  // Trier par taux décroissant (norme française)
  result.sort((a, b) => b.rate - a.rate)
  return result
}

/**
 * Résout le compte 706 spécifique selon les serviceTypes du projet, ou fallback 706000.
 * Retourne le compte (ChartOfAccount doc) à créditer pour le HT.
 */
async function resolveRevenueAccount(project) {
  // Heuristique : si le projet a un serviceType, on peut mapper vers 706100/706200/706300
  // Sinon, 706000 par défaut.
  const types = project?.serviceTypes || []
  let code = DEFAULT_REVENUE_ACCOUNT
  if (types.includes('COMMUNICATION') || types.includes('MARKETING')) code = '706100'
  else if (types.includes('DEVELOPPEMENT') || types.includes('WEB')) code = '706200'
  else if (types.includes('CONSEIL') || types.includes('STRATEGIE')) code = '706300'

  const found = await ChartOfAccount.findOne({ code, isActive: true })
  if (found) return found
  // Fallback strict 706000
  return ChartOfAccount.findOne({ code: DEFAULT_REVENUE_ACCOUNT, isActive: true })
}

async function resolveCustomerAccount() {
  return ChartOfAccount.findOne({ code: DEFAULT_CUSTOMER_ACCOUNT, isActive: true })
}

async function resolveVatCollectedAccountFor(rate) {
  // Cherche d'abord dans VatRate, sinon fallback 445710
  const vatRate = await VatRate.findOne({ rate: Number(rate), isActive: true })
  const code = vatRate?.collectedAccount || DEFAULT_COLLECTED_VAT_ACCOUNT
  const account = await ChartOfAccount.findOne({ code, isActive: true })
  return { account, vatRate }
}

/**
 * Convertit une FACTURE (BillingDocument INVOICE) en écriture comptable de vente.
 * - Journal : VE
 * - 411 (client) débit TTC
 * - 706 (prestations) crédit HT — multi-lignes si taux TVA multiples
 * - 44571 (TVA collectée) crédit Taxe par taux
 *
 * Idempotent : si l'écriture existe déjà pour cette facture, la retourne telle quelle.
 *
 * @param {string|Object} billingDocOrId   Facture
 * @param {Object} options
 * @param {string} [options.userId]        Utilisateur déclencheur
 * @param {Date}   [options.date]          Date forcée (sinon issuedAt ou createdAt)
 * @param {string} [options.status]        VALIDATED par défaut
 */
export async function createSaleEntryFromBilling(billingDocOrId, options = {}) {
  const doc = typeof billingDocOrId === 'object' && billingDocOrId._id
    ? billingDocOrId
    : await BillingDocument.findById(billingDocOrId).lean()

  if (!doc) {
    const err = new Error('Facture introuvable')
    err.status = 404
    throw err
  }
  if (doc.type !== 'INVOICE') {
    const err = new Error('Seules les factures (INVOICE) peuvent générer une écriture de vente')
    err.status = 400
    throw err
  }

  // Idempotency
  const idempotencyKey = buildBillingIdempotencyKey(doc._id, 'sale')
  const existing = await AccountingEntry.findOne({ idempotencyKey })
  if (existing) {
    return { entry: existing, alreadyExisted: true }
  }

  const Project = (await import('../../models/Project.js')).default
  const project = doc.project ? await Project.findById(doc.project).lean() : null

  // Résolution des comptes
  const customerAccount = await resolveCustomerAccount()
  const revenueAccount = await resolveRevenueAccount(project)
  if (!customerAccount || !revenueAccount) {
    const err = new Error('Comptes 411 ou 706 manquants — initialisez le plan comptable')
    err.status = 500
    throw err
  }

  // Agrégation par taux de TVA
  const grouped = aggregateLinesByVatRate(doc.lines)
  const totalHt = round2(grouped.reduce((s, g) => s + g.ht, 0))
  const totalTax = round2(grouped.reduce((s, g) => s + g.tax, 0))
  const totalTtc = round2(totalHt + totalTax)

  if (totalTtc <= 0) {
    const err = new Error('Facture sans montant — pas d\'écriture générée')
    err.status = 400
    throw err
  }

  // Construction des lignes d'écriture
  const lines = []

  // 1) Client débit TTC (lettrage auto à partir du numéro facture)
  const lettrageCode = doc.number ? doc.number.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase() : ''
  lines.push({
    account: customerAccount.code,
    label: `Facture ${doc.number}${project?.name ? ' — ' + project.name : ''}`,
    debit: totalTtc,
    credit: 0,
    lettrage: lettrageCode || undefined,
  })

  // 2) Prestations crédit HT (une ligne par taux si multi-TVA pour pouvoir afficher la base)
  for (const grp of grouped) {
    if (grp.ht <= 0) continue
    lines.push({
      account: revenueAccount.code,
      label: `Prestations — base HT ${grp.rate}%`,
      debit: 0,
      credit: grp.ht,
      vatRateValue: grp.rate,
    })
  }

  // 3) TVA collectée crédit par taux (uniquement si taux > 0)
  for (const grp of grouped) {
    if (grp.tax <= 0) continue
    const { account: vatAccount, vatRate } = await resolveVatCollectedAccountFor(grp.rate)
    if (!vatAccount) continue
    lines.push({
      account: vatAccount.code,
      label: `TVA collectée ${grp.rate}%`,
      debit: 0,
      credit: grp.tax,
      vatRate: vatRate?._id,
      vatRateValue: grp.rate,
    })
  }

  // Création de l'écriture
  const result = await createEntry({
    journal: 'VE',
    date: options.date || doc.issuedAt || doc.createdAt || new Date(),
    label: `Facture ${doc.number}${project?.name ? ' — ' + project.name : ''}`,
    pieceRef: doc.number,
    lines,
    source: 'BILLING',
    sourceRef: { kind: 'BILLING_INVOICE', id: doc._id },
    idempotencyKey,
    status: options.status || 'VALIDATED',
    createdBy: options.userId || doc.createdBy,
    currency: doc.currency || 'EUR',
  })

  return result
}

export { aggregateLinesByVatRate }
