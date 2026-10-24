import BillingDocument from '../../models/BillingDocument.js'
import type { IBillingDocument } from '../../types/models/index.js'
import { createSaleEntryFromBilling } from '../accounting/billingToEntry.js'
import { runInTransaction } from '../transaction.js'
import { invoiceAmountsCents } from './invoicing.js'
import { moneyError } from './money.js'
import { assertInvoiceHasNoReceipts } from './payments.js'

export function issueProjectInvoice(doc: IBillingDocument, storagePath: string, userId: string) {
  return runInTransaction(async (session) => {
    let original = null
    if (doc.creditedInvoice) {
      await BillingDocument.updateOne({ _id: doc.creditedInvoice }, { $currentDate: { updatedAt: true } }, { session })
      original = await BillingDocument.findById(doc.creditedInvoice).session(session)
      if (!original) throw moneyError('Facture d’origine introuvable')
      await assertInvoiceHasNoReceipts(original, session)
    }
    const current = await BillingDocument.findById(doc._id).session(session)
    if (!current || current.status !== doc.$locals.loadedStatus) {
      const err = moneyError('Le statut du document a changé ; rechargez-le')
      err.status = 409
      throw err
    }
    current.pdfStoragePath = storagePath
    current.issuedAt = doc.issuedAt
    current.dueAt = doc.dueAt
    const sale = await createSaleEntryFromBilling(current, { userId, session })
    if (current.status === 'DRAFT') current.status = 'ISSUED'
    await current.save({ session })
    if (original?.financeLink?.kind === 'INSTALLMENT') {
      const credits = await BillingDocument.find({
        creditedInvoice: original._id,
        status: { $in: ['ISSUED', 'SENT', 'PAID'] },
      }).session(session)
      const creditedHt = credits.reduce((sum, credit) => sum - invoiceAmountsCents(credit).htCents, 0)
      if (creditedHt === invoiceAmountsCents(original).htCents) {
        await BillingDocument.updateOne({ _id: original._id }, { $set: { financeKey: null } }, { session })
      }
    }
    return sale.entry
  })
}
