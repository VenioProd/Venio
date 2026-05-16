import type { Types } from 'mongoose'
import BillingDocument from '../../models/BillingDocument.js'
import ChartOfAccount from '../../models/ChartOfAccount.js'
import AccountingEntry from '../../models/AccountingEntry.js'
import AccountingLine from '../../models/AccountingLine.js'
import CompanySettings from '../../models/CompanySettings.js'
import Journal from '../../models/Journal.js'
import { createEntry, type CreateEntryResult } from './doubleEntry.js'
import { buildBillingIdempotencyKey } from './billingToEntry.js'
import type { IBillingDocument, IChartOfAccount } from '../../types/models/index.js'

const DEFAULT_CUSTOMER_ACCOUNT = '411000'
const DEFAULT_BANK_ACCOUNT = '512000'

function round2(n: number | null | undefined): number {
  return Math.round(Number(n || 0) * 100) / 100
}

/**
 * Trouve le compte bancaire par défaut depuis CompanySettings,
 * ou le `counterAccount` du journal BQ, ou 512000 en fallback.
 */
async function resolveBankAccount({ accountCode }: { accountCode?: string } = {}): Promise<IChartOfAccount | null> {
  if (accountCode) {
    const a = await ChartOfAccount.findOne({ code: accountCode, isActive: true })
    if (a) return a
  }
  const bqJournal = await Journal.findOne({ code: 'BQ' })
  if (bqJournal?.counterAccount) {
    const a = await ChartOfAccount.findOne({ code: bqJournal.counterAccount, isActive: true })
    if (a) return a
  }
  return ChartOfAccount.findOne({ code: DEFAULT_BANK_ACCOUNT, isActive: true })
}

export interface CreatePaymentEntryOptions {
  userId?: string | Types.ObjectId | null
  date?: Date | string
  bankAccountCode?: string
}

/**
 * Convertit un paiement de facture (PATCH status=PAID) en écriture BQ :
 *   - 512 (banque) débit TTC
 *   - 411 (client) crédit TTC
 * Lettrage automatique commun avec l'écriture VE de la facture si elle existe.
 *
 * Idempotent.
 */
export async function createPaymentEntryFromBilling(
  billingDocOrId: IBillingDocument | string | Types.ObjectId,
  options: CreatePaymentEntryOptions = {}
): Promise<CreateEntryResult> {
  const doc: IBillingDocument | null =
    typeof billingDocOrId === 'object' && (billingDocOrId as IBillingDocument)._id
      ? (billingDocOrId as IBillingDocument)
      : ((await BillingDocument.findById(billingDocOrId as string).lean()) as unknown as IBillingDocument | null)

  if (!doc) {
    const err = new Error('Facture introuvable') as Error & { status?: number }
    err.status = 404
    throw err
  }
  if (doc.type !== 'INVOICE') {
    const err = new Error('Seules les factures peuvent générer une écriture de paiement') as Error & { status?: number }
    err.status = 400
    throw err
  }

  const idempotencyKey = buildBillingIdempotencyKey(doc._id as Types.ObjectId, 'payment')
  const existing = await AccountingEntry.findOne({ idempotencyKey })
  if (existing) {
    return { entry: existing, lines: [], alreadyExisted: true }
  }

  const bankAccount = await resolveBankAccount({ accountCode: options.bankAccountCode })
  const customerAccount = await ChartOfAccount.findOne({
    code: DEFAULT_CUSTOMER_ACCOUNT,
    isActive: true,
  })
  if (!bankAccount || !customerAccount) {
    const err = new Error('Comptes 512 ou 411 manquants — initialisez le plan comptable') as Error & { status?: number }
    err.status = 500
    throw err
  }

  const totalTtc = round2(doc.total)
  if (totalTtc <= 0) {
    const err = new Error('Montant de paiement nul') as Error & { status?: number }
    err.status = 400
    throw err
  }

  // Lettrage commun avec la vente si elle existe
  const saleIdempotencyKey = buildBillingIdempotencyKey(doc._id as Types.ObjectId, 'sale')
  const saleEntry = await AccountingEntry.findOne({ idempotencyKey: saleIdempotencyKey })
  let lettrageCode = ''
  if (saleEntry) {
    const customerLine = await AccountingLine.findOne({
      entry: saleEntry._id,
      accountCode: DEFAULT_CUSTOMER_ACCOUNT,
    })
    lettrageCode = customerLine?.lettrage || doc.number?.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase() || ''
    // Si la ligne 411 de la vente n'est pas encore lettrée, la lettrer maintenant
    if (customerLine && !customerLine.lettrage && lettrageCode) {
      customerLine.lettrage = lettrageCode
      customerLine.lettrageDate = new Date()
      await customerLine.save()
    }
  } else {
    lettrageCode = doc.number?.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase() || ''
  }

  const lines = [
    {
      account: bankAccount.code,
      label: `Encaissement facture ${doc.number}`,
      debit: totalTtc,
      credit: 0,
    },
    {
      account: customerAccount.code,
      label: `Règlement facture ${doc.number}`,
      debit: 0,
      credit: totalTtc,
      lettrage: lettrageCode || undefined,
    },
  ]

  const result = await createEntry({
    journal: 'BQ',
    date: options.date || doc.paidAt || new Date(),
    label: `Encaissement facture ${doc.number}`,
    pieceRef: doc.number,
    lines,
    source: 'PAYMENT',
    sourceRef: { kind: 'BILLING_INVOICE', id: doc._id as Types.ObjectId },
    idempotencyKey,
    status: 'VALIDATED',
    createdBy: options.userId || (doc.createdBy as Types.ObjectId | null),
    currency: doc.currency || 'EUR',
  })

  return result
}

/**
 * Délègue à CompanySettings pour récupérer la "default IBAN" si demandé plus tard.
 * Stub pour future Phase de banque multi-comptes.
 */
export async function getDefaultBankAccountCode(): Promise<string> {
  const settings = await CompanySettings.findOne({ singletonKey: 'MAIN' })
  if (settings?.ibanList?.length) {
    const def = settings.ibanList.find((i) => i.isDefault) || settings.ibanList[0]
    if (def?.bankAccount) return def.bankAccount
  }
  return DEFAULT_BANK_ACCOUNT
}
