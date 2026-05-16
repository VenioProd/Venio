import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import VatRate from '../../../models/VatRate.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

router.get('/', requirePermission(PERMISSIONS.VIEW_VAT), async (_req, res, next) => {
  try {
    const rates = await VatRate.find().sort({ rate: -1 }).lean()
    res.json({ vatRates: rates })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', requirePermission(PERMISSIONS.MANAGE_VAT), async (req, res, next) => {
  try {
    const rate = await VatRate.findById(req.params.id)
    if (!rate) return res.status(404).json({ error: 'Taux TVA introuvable' })
    const fields = ['label', 'rate', 'collectedAccount', 'deductibleAccount', 'declarationLine', 'isActive', 'legend']
    for (const f of fields) {
      if (req.body[f] !== undefined) rate[f] = req.body[f]
    }
    await rate.save()
    res.json({ vatRate: rate })
  } catch (err) {
    next(err)
  }
})

export default router
