import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import ChartOfAccount from '../../../models/ChartOfAccount.js'
import Journal from '../../../models/Journal.js'
import VatRate from '../../../models/VatRate.js'
import { seedAccountingDefaults } from '../../../lib/accounting/pcgSeed.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET / : liste filtrée des comptes
router.get(
  '/',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { search, accountClass, type, active } = req.query as Record<string, string | undefined>
      const filter: Record<string, unknown> = {}
      if (search) {
        filter.$or = [
          { code: { $regex: search, $options: 'i' } },
          { label: { $regex: search, $options: 'i' } },
        ]
      }
      if (accountClass) filter.accountClass = Number(accountClass)
      if (type) filter.type = type
      if (active !== undefined) filter.isActive = active === 'true'
      const accounts = await ChartOfAccount.find(filter).sort({ code: 1 }).lean()
      res.json({ accounts })
    } catch (err) {
      next(err)
    }
  }
)

// POST / : crée un nouveau compte
router.post(
  '/',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code, label, accountClass, type, isLettrable, isActive, description, parent } = req.body || {}
      if (!code || !label || !accountClass || !type) {
        res.status(400).json({ error: 'code, label, accountClass, type requis' })
        return
      }
      const account = await ChartOfAccount.create({
        code,
        label,
        accountClass: Number(accountClass),
        type,
        isLettrable: Boolean(isLettrable),
        isActive: isActive !== false,
        description: description || '',
        parent: parent || null,
      })
      res.status(201).json({ account })
    } catch (err) {
      // Code MongoDB duplicate
      if ((err as { code?: number }).code === 11000) {
        res.status(409).json({ error: 'Ce code de compte existe déjà' })
        return
      }
      next(err)
    }
  }
)

// PATCH /:id : met à jour un compte
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const account = await ChartOfAccount.findById(req.params.id)
      if (!account) {
        res.status(404).json({ error: 'Compte introuvable' })
        return
      }
      const fields = ['code', 'label', 'accountClass', 'type', 'isLettrable', 'isActive', 'description', 'parent'] as const
      const body = (req.body || {}) as Record<string, unknown>
      for (const f of fields) {
        if (body[f] !== undefined) {
          ;(account as unknown as Record<string, unknown>)[f] = body[f]
        }
      }
      await account.save()
      res.json({ account })
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        res.status(409).json({ error: 'Code en double' })
        return
      }
      next(err)
    }
  }
)

// DELETE /:id : soft delete (désactivation)
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const account = await ChartOfAccount.findById(req.params.id)
      if (!account) {
        res.status(404).json({ error: 'Compte introuvable' })
        return
      }
      // Soft delete : on désactive simplement
      account.isActive = false
      await account.save()
      res.json({ ok: true, account })
    } catch (err) {
      next(err)
    }
  }
)

// POST /seed : initialise le PCG (idempotent)
router.post(
  '/seed',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await seedAccountingDefaults({ ChartOfAccount, Journal, VatRate })
      res.json({ ok: true, created: result })
    } catch (err) {
      next(err)
    }
  }
)

export default router
