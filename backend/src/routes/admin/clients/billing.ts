import express, { Request, Response, NextFunction } from 'express'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import BillingDocument from '../../../models/BillingDocument.js'
import { ok, error, ensureClient } from './helpers.js'

const router = express.Router()

router.get('/:id/billing/summary', requirePermission(PERMISSIONS.VIEW_BILLING), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await ensureClient(req.params.id as string, req)
    if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

    const docs = await BillingDocument.find({ client: client._id }).select('type status total currency').lean()

    const summary = {
      totalQuotes: 0,
      totalInvoices: 0,
      amountQuoted: 0,
      amountInvoiced: 0,
      amountPaid: 0,
      amountUnpaid: 0,
      unpaidCount: 0,
      currency: (docs[0] as any)?.currency || 'EUR',
    }

    for (const doc of docs) {
      const total = Number((doc as any).total) || 0
      if ((doc as any).type === 'QUOTE') {
        summary.totalQuotes += 1
        summary.amountQuoted += total
      }
      if ((doc as any).type === 'INVOICE') {
        summary.totalInvoices += 1
        summary.amountInvoiced += total
        if ((doc as any).status === 'PAID') {
          summary.amountPaid += total
        } else {
          summary.amountUnpaid += total
          summary.unpaidCount += 1
        }
      }
    }

    return ok(res, { summary })
  } catch (err) {
    return next(err)
  }
})

router.get('/:id/billing/documents', requirePermission(PERMISSIONS.VIEW_BILLING), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await ensureClient(req.params.id as string, req)
    if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

    const documents = await BillingDocument.find({ client: client._id })
      .sort({ createdAt: -1 })
      .populate('project', 'name projectNumber')
      .lean()

    return ok(res, { documents })
  } catch (err) {
    return next(err)
  }
})

export default router
