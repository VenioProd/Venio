import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { getStripeClient, requireStripe } from '../../../lib/stripe/client.js'
import { linkError, paymentLinkUrl, renewPaymentLink, revokePaymentLink } from '../../../lib/stripe/paymentLinks.js'
import { processStripeEvent } from '../../../lib/stripe/events.js'
import BillingDocument from '../../../models/BillingDocument.js'
import StripeEvent from '../../../models/StripeEvent.js'
import projectFinanceErrors from './projectFinanceErrors.js'

const router = express.Router()
const manage = requirePermission(PERMISSIONS.MANAGE_ACCOUNTING)
router.use(['/stripe', '/invoices/:invoiceId/payment-link'], auth, requireAdmin, requireStripe)
router.use(['/stripe', '/invoices/:invoiceId/payment-link'], (_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})
router.post<{ invoiceId: string }>('/invoices/:invoiceId/payment-link', manage, async (req, res, next) => {
  try {
    res.status(201).json({ url: await renewPaymentLink(req.params.invoiceId, req.user!.id) })
  } catch (error) {
    next(error)
  }
})
router.delete<{ invoiceId: string }>('/invoices/:invoiceId/payment-link', manage, async (req, res, next) => {
  try {
    await revokePaymentLink(req.params.invoiceId)
    res.json({ revoked: true })
  } catch (error) {
    next(error)
  }
})
router.get<{ invoiceId: string }>('/invoices/:invoiceId/payment-link', manage, async (req, res, next) => {
  try {
    const invoice = await BillingDocument.findById(req.params.invoiceId)
    if (!invoice) throw linkError('Facture introuvable', 404)
    res.json({ url: (await paymentLinkUrl(invoice)) ?? null })
  } catch (error) {
    next(error)
  }
})
router.get('/stripe/events', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (req, res, next) => {
  try {
    const status = req.query.status
    if (status && !['PROCESSED', 'NEEDS_REVIEW', 'IGNORED'].includes(String(status)))
      throw linkError('Statut Stripe invalide', 400)
    res.json({
      events: await StripeEvent.find(status ? { status } : {})
        .sort({ createdAt: -1 })
        .limit(200)
        .populate('invoice', 'number')
        .lean(),
    })
  } catch (error) {
    next(error)
  }
})
router.post<{ id: string }>('/stripe/events/:id/retry', manage, async (req, res, next) => {
  try {
    const stored = await StripeEvent.findById(req.params.id)
    if (!stored) throw linkError('Événement Stripe introuvable', 404)
    const event = await getStripeClient().events.retrieve(stored.eventId)
    res.json({ event: await processStripeEvent(event) })
  } catch (error) {
    next(error)
  }
})
router.use(projectFinanceErrors)
router.use(
  (err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.status ?? 500).json({ error: err.status ? err.message : 'Stripe temporairement indisponible.' })
  },
)
export default router
