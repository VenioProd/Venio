import { assertCents, moneyError } from '../projectFinance/money.js'
import { billingVatBreakdown } from '../projectFinance/vatBreakdown.js'
import { invoiceAmountsCents } from '../projectFinance/invoicing.js'
import type { ClientSession, Types } from 'mongoose'
import BillingDocument from '../../models/BillingDocument.js'
import ChartOfAccount from '../../models/ChartOfAccount.js'
import VatRate from '../../models/VatRate.js'
import AccountingEntry from '../../models/AccountingEntry.js'
import { createEntry, type CreateEntryResult, type CreateEntryLineInput } from './doubleEntry.js'
import type { IBillingDocument, IChartOfAccount, IVatRate } from '../../types/models/index.js'

const DEFAULT_CUSTOMER_ACCOUNT = '411000'
const DEFAULT_REVENUE_ACCOUNT = '706000'
const DEFAULT_COLLECTED_VAT_ACCOUNT = '445710'

/**
 * Construit la clé d'idempotence pour une facture donnée.
 */
export function buildBillingIdempotencyKey(
  billingDocId: Types.ObjectId | string,
  kind: 'sale' | 'payment' = 'sale',
): string {
  return `billing:${kind}:${String(billingDocId)}`
}

/**
 * Résout le compte 706 spécifique selon les serviceTypes du projet, ou fallback 706000.
 */
async function resolveRevenueAccount(
  project: { serviceTypes?: string[] } | null | undefined,
  session?: ClientSession,
): Promise<IChartOfAccount | null> {
  // Heuristique : si le projet a un serviceType, on peut mapper vers 706100/706200/706300
  // Sinon, 706000 par défaut.
  const types = project?.serviceTypes || []
  let code = DEFAULT_REVENUE_ACCOUNT
  if (types.includes('COMMUNICATION') || types.includes('MARKETING')) code = '706100'
  else if (types.includes('DEVELOPPEMENT') || types.includes('WEB')) code = '706200'
  else if (types.includes('CONSEIL') || types.includes('STRATEGIE')) code = '706300'

  const found = await ChartOfAccount.findOne({ code, isActive: true }).session(session ?? null)
  if (found) return found
  // Fallback strict 706000
  return ChartOfAccount.findOne({ code: DEFAULT_REVENUE_ACCOUNT, isActive: true }).session(session ?? null)
}

async function resolveCustomerAccount(session?: ClientSession): Promise<IChartOfAccount | null> {
  return ChartOfAccount.findOne({ code: DEFAULT_CUSTOMER_ACCOUNT, isActive: true }).session(session ?? null)
}

async function resolveVatCollectedAccountFor(
  rate: number,
  session?: ClientSession,
): Promise<{ account: IChartOfAccount | null; vatRate: IVatRate | null }> {
  // Cherche d'abord dans VatRate, sinon fallback 445710
  const vatRate = await VatRate.findOne({ rate: Number(rate), isActive: true }).session(session ?? null)
  const code = vatRate?.collectedAccount || DEFAULT_COLLECTED_VAT_ACCOUNT
  const account = await ChartOfAccount.findOne({ code, isActive: true }).session(session ?? null)
  return { account, vatRate }
}

export interface CreateSaleEntryOptions {
  userId?: string | Types.ObjectId | null
  date?: Date | string
  status?: 'DRAFT' | 'VALIDATED'
  session?: ClientSession
}

/**
 * Convertit une FACTURE (BillingDocument INVOICE) en écriture comptable de vente.
 * - Journal : VE
 * - 411 (client) débit TTC
 * - 706 (prestations) crédit HT — multi-lignes si taux TVA multiples
 * - 44571 (TVA collectée) crédit Taxe par taux
 *
 * Idempotent : si l'écriture existe déjà pour cette facture, la retourne telle quelle.
 */
export async function createSaleEntryFromBilling(
  billingDocOrId: IBillingDocument | string | Types.ObjectId,
  options: CreateSaleEntryOptions = {},
): Promise<CreateEntryResult> {
  const { session } = options
  const doc: IBillingDocument | null =
    typeof billingDocOrId === 'object' && (billingDocOrId as IBillingDocument)._id
      ? (billingDocOrId as IBillingDocument)
      : ((await BillingDocument.findById(billingDocOrId as string)
          .session(session ?? null)
          .lean()) as unknown as IBillingDocument | null)

  if (!doc) {
    const err = new Error('Facture introuvable') as Error & { status?: number }
    err.status = 404
    throw err
  }
  if (doc.type !== 'INVOICE') {
    const err = new Error('Seules les factures (INVOICE) peuvent générer une écriture de vente') as Error & {
      status?: number
    }
    err.status = 400
    throw err
  }

  // Idempotency
  const idempotencyKey = buildBillingIdempotencyKey(doc._id as Types.ObjectId, 'sale')
  const existing = await AccountingEntry.findOne({ idempotencyKey }).session(session ?? null)
  if (existing) {
    return { entry: existing, lines: [], alreadyExisted: true }
  }

  // Import dynamique du modèle Project (pour éviter une dépendance circulaire au démarrage)
  const Project = (await import('../../models/Project.js')).default
  const project = doc.project
    ? ((await Project.findById(doc.project)
        .session(session ?? null)
        .lean()) as { name?: string; serviceTypes?: string[] } | null)
    : null

  // Résolution des comptes
  const customerAccount = await resolveCustomerAccount(session)
  const revenueAccount = await resolveRevenueAccount(project, session)
  if (!customerAccount || !revenueAccount) {
    const err = new Error('Comptes 411 ou 706 manquants — initialisez le plan comptable') as Error & { status?: number }
    err.status = 500
    throw err
  }

  // Agrégation par taux de TVA
  const grouped = billingVatBreakdown(doc)
  const totalHtCents = grouped.reduce((sum, group) => sum + group.htCents, 0)
  const totalTaxCents = grouped.reduce((sum, group) => sum + group.taxCents, 0)
  const totalTtcCents = totalHtCents + totalTaxCents
  assertCents(totalTtcCents, 'TTC de l’écriture')
  if (totalTtcCents !== invoiceAmountsCents(doc).ttcCents) {
    throw moneyError('Le TTC de l’écriture ne correspond pas à la facture du projet')
  }
  const totalTtc = totalTtcCents / 100

  if (totalTtc === 0) {
    const err = new Error("Facture sans montant — pas d'écriture générée") as Error & { status?: number }
    err.status = 400
    throw err
  }

  // Construction des lignes d'écriture
  const lines: CreateEntryLineInput[] = []

  // 1) Client débit TTC (lettrage auto à partir du numéro facture)
  let auxiliaryRef: CreateEntryLineInput['auxiliaryRef']
  if (doc.payer?.kind === 'CLIENT') auxiliaryRef = { kind: 'CLIENT', id: doc.payer.user }
  else if (doc.payer) auxiliaryRef = { kind: 'OTHER', id: doc.payer.subsidiary }
  const original = doc.creditedInvoice
    ? await BillingDocument.findById(doc.creditedInvoice).session(session ?? null)
    : null
  if (doc.creditedInvoice && !original) throw moneyError('Facture d’origine introuvable')
  const lettrageNumber = original?.number ?? doc.number
  const lettrageCode = lettrageNumber
    ? lettrageNumber
        .replace(/[^A-Z0-9]/gi, '')
        .slice(-8)
        .toUpperCase()
    : ''
  lines.push({
    account: customerAccount.code,
    label: `Facture ${doc.number}${project?.name ? ' — ' + project.name : ''}`,
    auxiliaryRef,
    debit: Math.max(totalTtc, 0),
    credit: Math.max(-totalTtc, 0),
    lettrage: lettrageCode || undefined,
  })

  // 2) Prestations crédit HT (une ligne par taux si multi-TVA pour pouvoir afficher la base)
  for (const grp of grouped) {
    if (grp.htCents === 0) continue
    lines.push({
      account: revenueAccount.code,
      label: `Prestations — base HT ${grp.rate}%`,
      debit: Math.max(-grp.htCents, 0) / 100,
      credit: Math.max(grp.htCents, 0) / 100,
      vatRateValue: grp.rate,
    })
  }

  // 3) TVA collectée crédit par taux (uniquement si taux > 0)
  for (const grp of grouped) {
    if (grp.taxCents === 0) continue
    const { account: vatAccount, vatRate } = await resolveVatCollectedAccountFor(grp.rate, session)
    if (!vatAccount) continue
    lines.push({
      account: vatAccount.code,
      label: `TVA collectée ${grp.rate}%`,
      debit: Math.max(-grp.taxCents, 0) / 100,
      credit: Math.max(grp.taxCents, 0) / 100,
      vatRate: vatRate?._id as Types.ObjectId | undefined,
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
    sourceRef: { kind: 'BILLING_INVOICE', id: doc._id as Types.ObjectId },
    idempotencyKey,
    status: options.status || 'VALIDATED',
    createdBy: options.userId || (doc.createdBy as Types.ObjectId | null),
    currency: doc.currency || 'EUR',
    session,
  })

  return result
}
