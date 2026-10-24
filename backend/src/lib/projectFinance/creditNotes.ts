import BillingDocument from '../../models/BillingDocument.js'
import InvoicePaymentLink from '../../models/InvoicePaymentLink.js'
import { expireInvoiceCheckout } from '../stripe/checkoutSession.js'
import { getNextSequence } from '../../models/Sequence.js'
import { runInTransaction } from '../transaction.js'
import { invoiceAmountsCents } from './invoicing.js'
import { assertCents, divHalfUp, moneyError } from './money.js'
import { assertInvoiceHasNoReceipts } from './payments.js'

export async function createCreditNote({
  invoiceId,
  amountHtCents,
  reason,
  userId,
}: {
  invoiceId: string
  amountHtCents?: number
  reason: string
  userId: string
}) {
  if (typeof reason !== 'string' || !reason.trim()) throw moneyError('Le motif de l’avoir est requis')
  // Une session Checkout ouverte resterait payable à l'ancien montant malgré l'avoir.
  const expiredCheckoutSessionId = await expireInvoiceCheckout(invoiceId)
  return runInTransaction(async (session) => {
    if (expiredCheckoutSessionId !== undefined) {
      const link = await InvoicePaymentLink.findOneAndUpdate(
        { invoice: invoiceId },
        { $currentDate: { updatedAt: true } },
        { session, new: true },
      )
      if ((link?.currentCheckoutSessionId ?? null) !== expiredCheckoutSessionId) {
        const err = moneyError('Une session de paiement vient d’être ouverte : actualisez avant de créer l’avoir')
        err.status = 409
        throw err
      }
    }
    const invoice = await BillingDocument.findById(invoiceId).session(session)
    if (!invoice) {
      const err = moneyError('Facture introuvable')
      err.status = 404
      throw err
    }
    if (
      invoice.type !== 'INVOICE' ||
      invoice.total <= 0 ||
      invoice.creditedInvoice ||
      !['ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID'].includes(invoice.status)
    ) {
      const err = moneyError('Un avoir exige une facture positive émise')
      err.status = 409
      throw err
    }
    const amounts = invoiceAmountsCents(invoice)
    if (amounts.htCents <= 0) throw moneyError('La facture doit porter un HT positif')
    let htCents = amounts.htCents
    if (amountHtCents !== undefined) {
      assertCents(amountHtCents, 'HT de l’avoir')
      if (amountHtCents <= 0) throw moneyError('Le HT de l’avoir doit être strictement positif')
      if (new Set(invoice.lines.map((line) => line.taxRate)).size !== 1) {
        throw moneyError('Un avoir partiel exige une facture à un seul taux de TVA')
      }
      htCents = amountHtCents
    }
    // Deux avoirs concurrents doivent relire le cumul après le premier commit.
    await BillingDocument.updateOne({ _id: invoice._id }, { $currentDate: { updatedAt: true } }, { session })
    await assertInvoiceHasNoReceipts(invoice, session)
    const previous = await BillingDocument.find({ creditedInvoice: invoice._id, status: { $ne: 'CANCELLED' } }).session(
      session,
    )
    const beforeHt = previous.reduce((sum, doc) => sum - invoiceAmountsCents(doc).htCents, 0)
    const afterHt = beforeHt + htCents
    assertCents(afterHt, 'HT cumulé crédité')
    if (afterHt > amounts.htCents) {
      const err = moneyError('Le cumul des avoirs dépasse le HT de la facture')
      err.status = 409
      throw err
    }
    const cumulativeVat = (ht: number) => {
      if (ht === amounts.htCents) return amounts.vatCents
      return divHalfUp(BigInt(ht) * BigInt(amounts.vatCents), amounts.htCents)
    }
    // Une annulation peut laisser un centime de TVA dans les avoirs restants.
    const beforeVat = previous.reduce((sum, doc) => sum - invoiceAmountsCents(doc).vatCents, 0)
    const taxCents = cumulativeVat(afterHt) - beforeVat
    const { formatted: number } = await getNextSequence('invoiceNumber', { prefix: 'FAC-', padding: 4, session })
    let lines = invoice.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: -line.unitPrice,
      taxRate: line.taxRate,
      total: -line.total,
    }))
    if (amountHtCents !== undefined) {
      lines = [
        {
          description: `Avoir sur facture ${invoice.number} — ${reason.trim()}`,
          quantity: 1,
          unitPrice: -htCents / 100,
          taxRate: invoice.lines[0]!.taxRate,
          total: -htCents / 100,
        },
      ]
    }
    const doc = new BillingDocument({
      type: 'INVOICE',
      number,
      status: 'DRAFT',
      project: invoice.project,
      client: invoice.client,
      payer: invoice.payer,
      creditedInvoice: invoice._id,
      currency: invoice.currency,
      lines,
      subtotal: -htCents / 100,
      taxTotal: -taxCents / 100,
      total: -(htCents + taxCents) / 100,
      note: reason.trim(),
      createdBy: userId,
    })
    invoiceAmountsCents(doc)
    await doc.save({ session })
    return doc
  })
}
