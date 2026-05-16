import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import VatRate from '../../../models/VatRate.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET / : liste les taux de TVA (par taux décroissant)
router.get(
  '/',
  requirePermission(PERMISSIONS.VIEW_VAT),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rates = await VatRate.find().sort({ rate: -1 }).lean()
      res.json({ vatRates: rates })
    } catch (err) {
      next(err)
    }
  }
)

// PATCH /:id : met à jour un taux (label/rate/comptes liés/legend)
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_VAT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rate = await VatRate.findById(req.params.id)
      if (!rate) {
        res.status(404).json({ error: 'Taux TVA introuvable' })
        return
      }
      const fields = ['label', 'rate', 'collectedAccount', 'deductibleAccount', 'declarationLine', 'isActive', 'legend'] as const
      const body = (req.body || {}) as Record<string, unknown>
      for (const f of fields) {
        if (body[f] !== undefined) {
          ;(rate as unknown as Record<string, unknown>)[f] = body[f]
        }
      }
      await rate.save()
      res.json({ vatRate: rate })
    } catch (err) {
      next(err)
    }
  }
)

export default router
