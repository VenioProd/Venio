import express, { type NextFunction, type Request, type Response } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { ADMIN_ROLES, PERMISSIONS } from '../../lib/permissions.js'
import SalesTarget, { isSalesTargetAmount, SALES_MONTH_PATTERN } from '../../models/SalesTarget.js'
import User from '../../models/User.js'

const router = express.Router()
router.use(auth, requireAdmin, requirePermission(PERMISSIONS.MANAGE_ADMINS))

router.get(
  '/',
  query('month').isString().matches(SALES_MONTH_PATTERN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) {
        return res.status(400).json({ error: 'Mois invalide (AAAA-MM attendu)', code: 'INVALID_MONTH' })
      }
      const targets = await SalesTarget.find({ month: req.query.month }).sort({ user: 1 }).lean()
      return res.json({ targets })
    } catch (err) {
      return next(err)
    }
  },
)

router.use(
  '/:userId/:month',
  param('userId').isMongoId(),
  param('month').isString().matches(SALES_MONTH_PATTERN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) {
        return res.status(400).json({ error: 'Utilisateur ou mois invalide', code: 'INVALID_SALES_TARGET' })
      }
      const user = await User.exists({
        _id: req.params.userId,
        role: { $in: ADMIN_ROLES },
        isActive: true,
        status: { $ne: 'ARCHIVE' },
        archivedAt: null,
      })
      if (!user) return res.status(404).json({ error: 'Utilisateur interne actif introuvable', code: 'USER_NOT_FOUND' })
      return next()
    } catch (err) {
      return next(err)
    }
  },
)

router.put(
  '/:userId/:month',
  body('amount').custom(isSalesTargetAmount),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) {
        return res
          .status(400)
          .json({ error: 'Montant positif ou nul avec deux décimales maximum requis', code: 'INVALID_AMOUNT' })
      }
      const target = await SalesTarget.findOneAndUpdate(
        { user: req.params.userId, month: req.params.month },
        { $set: { amount: req.body.amount, updatedBy: req.user!.id } },
        { upsert: true, new: true, runValidators: true },
      )
      return res.json({ target })
    } catch (err) {
      return next(err)
    }
  },
)

router.delete('/:userId/:month', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await SalesTarget.deleteOne({ user: req.params.userId, month: req.params.month })
    return res.status(204).end()
  } catch (err) {
    return next(err)
  }
})
export default router
