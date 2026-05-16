import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import ChartOfAccount from '../../../models/ChartOfAccount.js'
import Journal from '../../../models/Journal.js'
import VatRate from '../../../models/VatRate.js'
import AuditLog from '../../../models/AuditLog.js'
import { seedAccountingDefaults } from '../../../lib/accounting/pcgSeed.js'
import { buildActorFromReq } from '../../../lib/audit/auditMiddleware.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

router.get('/', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (req, res, next) => {
  try {
    const { search, accountClass, type, active } = req.query
    const filter = {}
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
})

router.post('/', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const { code, label, accountClass, type, isLettrable, isActive, description, parent } = req.body || {}
    if (!code || !label || !accountClass || !type) {
      return res.status(400).json({ error: 'code, label, accountClass, type requis' })
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
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Ce code de compte existe déjà' })
    }
    next(err)
  }
})

router.patch('/:id', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const account = await ChartOfAccount.findById(req.params.id)
    if (!account) return res.status(404).json({ error: 'Compte introuvable' })
    const fields = ['code', 'label', 'accountClass', 'type', 'isLettrable', 'isActive', 'description', 'parent']
    for (const f of fields) {
      if (req.body[f] !== undefined) account[f] = req.body[f]
    }
    await account.save()
    res.json({ account })
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Code en double' })
    }
    next(err)
  }
})

router.delete('/:id', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const account = await ChartOfAccount.findById(req.params.id)
    if (!account) return res.status(404).json({ error: 'Compte introuvable' })
    const wasActive = account.isActive
    // Soft delete : on désactive
    account.isActive = false
    await account.save()
    if (wasActive) {
      AuditLog.record({
        action: 'CHART_OF_ACCOUNTS_DEACTIVATE',
        entityType: 'ChartOfAccount',
        entityId: account._id,
        entityRef: account.code,
        actor: buildActorFromReq(req),
        summary: `Désactivation du compte ${account.code} (${account.label})`,
        before: { isActive: true },
        after: { isActive: false },
        diff: [{ field: 'isActive', before: true, after: false }],
      })
    }
    res.json({ ok: true, account })
  } catch (err) {
    next(err)
  }
})

router.post('/seed', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const result = await seedAccountingDefaults({ ChartOfAccount, Journal, VatRate })
    AuditLog.record({
      action: 'CHART_OF_ACCOUNTS_SEED',
      entityType: 'ChartOfAccount',
      actor: buildActorFromReq(req),
      summary: 'Seed du plan comptable général (PCG)',
      metadata: { created: result },
    })
    res.json({ ok: true, created: result })
  } catch (err) {
    next(err)
  }
})

export default router
