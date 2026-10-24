import express, { type NextFunction, type Request, type Response } from 'express'
import { query, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import SalesTarget, { SALES_MONTH_PATTERN } from '../../models/SalesTarget.js'

const router = express.Router()
router.use(auth)

router.get(
  '/',
  query('from').optional().isString().matches(SALES_MONTH_PATTERN),
  query('to').optional().isString().matches(SALES_MONTH_PATTERN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) {
        return res.status(400).json({ error: 'Mois invalide (AAAA-MM attendu)', code: 'INVALID_MONTH' })
      }
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Paris',
          year: 'numeric',
          month: '2-digit',
        })
          .formatToParts(new Date())
          .map(({ type, value }) => [type, value]),
      )
      const from = (req.query.from ?? `${parts.year}-${parts.month}`) as string
      const to = (req.query.to ?? from) as string
      const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5))
      const span = monthIndex(to) - monthIndex(from)
      if (span < 0 || span >= 24) {
        return res.status(400).json({ error: 'La plage doit couvrir de 1 à 24 mois', code: 'INVALID_RANGE' })
      }
      const targets = await SalesTarget.find({ user: req.user!.id, month: { $gte: from, $lte: to } })
        .select('month amount -_id')
        .sort({ month: 1 })
        .lean()
      return res.json({ targets })
    } catch (err) {
      return next(err)
    }
  },
)
export default router
