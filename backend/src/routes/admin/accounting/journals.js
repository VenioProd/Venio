import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import Journal from '../../../models/Journal.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

router.get('/', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (_req, res, next) => {
  try {
    const journals = await Journal.find().sort({ code: 1 }).lean()
    res.json({ journals })
  } catch (err) {
    next(err)
  }
})

router.post('/', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const { code, label, type, counterAccount, description, isActive } = req.body || {}
    if (!code || !label || !type) {
      return res.status(400).json({ error: 'code, label, type requis' })
    }
    const journal = await Journal.create({
      code: String(code).toUpperCase(),
      label,
      type,
      counterAccount: counterAccount || '',
      description: description || '',
      isActive: isActive !== false,
    })
    res.status(201).json({ journal })
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Ce code de journal existe déjà' })
    }
    next(err)
  }
})

router.patch('/:id', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const journal = await Journal.findById(req.params.id)
    if (!journal) return res.status(404).json({ error: 'Journal introuvable' })
    const fields = ['label', 'type', 'counterAccount', 'description', 'isActive']
    for (const f of fields) {
      if (req.body[f] !== undefined) journal[f] = req.body[f]
    }
    await journal.save()
    res.json({ journal })
  } catch (err) {
    next(err)
  }
})

export default router
