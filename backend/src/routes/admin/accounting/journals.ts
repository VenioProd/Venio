import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import Journal from '../../../models/Journal.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET / : liste les journaux comptables
router.get(
  '/',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const journals = await Journal.find().sort({ code: 1 }).lean()
      res.json({ journals })
    } catch (err) {
      next(err)
    }
  }
)

// POST / : crée un journal
router.post(
  '/',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code, label, type, counterAccount, description, isActive } = req.body || {}
      if (!code || !label || !type) {
        res.status(400).json({ error: 'code, label, type requis' })
        return
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
      if ((err as { code?: number }).code === 11000) {
        res.status(409).json({ error: 'Ce code de journal existe déjà' })
        return
      }
      next(err)
    }
  }
)

// PATCH /:id : met à jour un journal (le code est immuable côté ce port)
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const journal = await Journal.findById(req.params.id)
      if (!journal) {
        res.status(404).json({ error: 'Journal introuvable' })
        return
      }
      const fields = ['label', 'type', 'counterAccount', 'description', 'isActive'] as const
      const body = (req.body || {}) as Record<string, unknown>
      for (const f of fields) {
        if (body[f] !== undefined) {
          ;(journal as unknown as Record<string, unknown>)[f] = body[f]
        }
      }
      await journal.save()
      res.json({ journal })
    } catch (err) {
      next(err)
    }
  }
)

export default router
