import express from 'express'
import rateLimit from 'express-rate-limit'
import { requireStripe } from '../../lib/stripe/client.js'
import { createCheckout, publicInvoice } from '../../lib/stripe/paymentLinks.js'

const router = express.Router()
router.use(requireStripe, rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }))
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  res.set('Referrer-Policy', 'no-referrer')
  next()
})
router.get<{ token: string }>('/:token', async (req, res, next) => {
  try {
    res.json(await publicInvoice(req.params.token))
  } catch (error) {
    next(error)
  }
})
router.post<{ token: string }>('/:token/checkout', async (req, res, next) => {
  try {
    res.json({ url: await createCheckout(req.params.token) })
  } catch (error) {
    next(error)
  }
})
router.use(
  (err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res
      .status(err.status ?? 500)
      .json({ error: err.status ? err.message : 'Paiement indisponible, veuillez réessayer.' })
  },
)
export default router
