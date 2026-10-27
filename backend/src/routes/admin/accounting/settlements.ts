import express from 'express'
import { Types } from 'mongoose'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { buildActorFromReq, recordAudit } from '../../../lib/audit/auditHelpers.js'
import { runInTransaction } from '../../../lib/transaction.js'
import { lockProject } from '../../../lib/projectWriteLock.js'
import { moneyError } from '../../../lib/projectFinance/money.js'
import {
  recordSettlement,
  reverseSettlement,
  recordProjectCost,
  beneficiaryStatementFor,
  projectCostLines,
} from '../../../lib/projectFinance/settlements.js'
import Beneficiary from '../../../models/Beneficiary.js'
import AccountingLine from '../../../models/AccountingLine.js'
import AccountingEntry from '../../../models/AccountingEntry.js'
import projectFinanceErrors from './projectFinanceErrors.js'

const router = express.Router()
router.use(auth, requireAdmin)

router.post<{ id: string }>(
  '/beneficiaries/:id/settlements',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req, res, next) => {
    try {
      const result = await recordSettlement({
        beneficiaryId: req.params.id,
        projectId: req.body?.projectId,
        htCents: req.body?.htCents,
        vatCents: req.body?.vatCents,
        paidAt: req.body?.paidAt,
        invoiceRef: req.body?.invoiceRef,
        note: req.body?.note,
        idempotencyKey: req.body?.idempotencyKey,
        userId: req.user!.id,
      })
      await recordAudit({
        action: 'SHARE_SETTLEMENT_CREATE',
        actor: buildActorFromReq(req),
        entityType: 'ShareSettlement',
        entityId: String(result.settlement._id),
        after: result.settlement.toObject(),
      })
      res.status(result.alreadyExisted ? 200 : 201).json(result)
    } catch (err) {
      next(err)
    }
  },
)

router.post<{ id: string }>(
  '/settlements/:id/reversal',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req, res, next) => {
    try {
      const result = await reverseSettlement({
        settlementId: req.params.id,
        reason: req.body?.reason,
        idempotencyKey: req.body?.idempotencyKey,
        userId: req.user!.id,
      })
      await recordAudit({
        action: 'SHARE_SETTLEMENT_REVERSE',
        actor: buildActorFromReq(req),
        entityType: 'ShareSettlement',
        entityId: String(result.settlement._id),
        after: result.settlement.toObject(),
      })
      res.status(result.alreadyExisted ? 200 : 201).json(result)
    } catch (err) {
      next(err)
    }
  },
)

router.get<{ id: string }>(
  '/beneficiaries/:id/statement',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req, res, next) => {
    try {
      res.json(await beneficiaryStatementFor(req.params.id))
    } catch (err) {
      next(err)
    }
  },
)

router.get('/me/statement', async (req, res, next) => {
  try {
    const beneficiary = await Beneficiary.findOne({ user: req.user!.id }).select('_id')
    if (!beneficiary) {
      res.status(404).json({ error: 'Aucun bénéficiaire lié à cet utilisateur' })
      return
    }
    res.json(await beneficiaryStatementFor(beneficiary._id as Types.ObjectId))
  } catch (err) {
    next(err)
  }
})

router.post<{ projectId: string }>(
  '/projects/:projectId/costs',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req, res, next) => {
    try {
      const result = await recordProjectCost({
        projectId: req.params.projectId,
        accountCode: req.body?.accountCode,
        label: req.body?.label,
        supplier: req.body?.supplier,
        htCents: req.body?.htCents,
        vatCents: req.body?.vatCents,
        date: req.body?.date,
        idempotencyKey: req.body?.idempotencyKey,
        userId: req.user!.id,
      })
      await recordAudit({
        action: 'PROJECT_COST_CREATE',
        actor: buildActorFromReq(req),
        entityType: 'ProjectCost',
        entityId: String(result.cost._id),
        after: result.cost.toObject(),
      })
      res.status(result.alreadyExisted ? 200 : 201).json(result)
    } catch (err) {
      next(err)
    }
  },
)

router.get<{ projectId: string }>(
  '/projects/:projectId/costs',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req, res, next) => {
    try {
      res.json({ lines: await projectCostLines(req.params.projectId) })
    } catch (err) {
      next(err)
    }
  },
)

router.patch<{ lineId: string }>(
  '/lines/:lineId/project',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req, res, next) => {
    try {
      const projectId = req.body?.projectId
      if (projectId !== null && (typeof projectId !== 'string' || !Types.ObjectId.isValid(projectId)))
        throw moneyError('Le projet doit être un identifiant ou null')
      const result = await runInTransaction(async (session) => {
        const line = await AccountingLine.findById(req.params.lineId).session(session)
        if (!line) {
          const error = moneyError('Ligne introuvable')
          error.status = 404
          throw error
        }
        const entry = await AccountingEntry.findById(line.entry).session(session)
        if (!entry) throw moneyError('Écriture introuvable')
        if (entry.idempotencyKey?.startsWith('settlement:')) {
          const error = moneyError('Une ligne de versement ne peut pas être rattachée à un projet')
          error.status = 409
          throw error
        }
        if (!line.accountCode.startsWith('6'))
          throw moneyError('Seule une ligne de classe 6 peut être rattachée à un projet')
        if (projectId) await lockProject(projectId, session)
        const before = line.toObject()
        line.project = projectId === null ? null : new Types.ObjectId(projectId)
        await line.save({ session })
        return { line, before }
      })
      await recordAudit({
        action: 'ACCOUNTING_LINE_PROJECT_UPDATE',
        actor: buildActorFromReq(req),
        entityType: 'AccountingLine',
        entityId: String(result.line._id),
        before: result.before,
        after: result.line.toObject(),
      })
      res.json({ line: result.line })
    } catch (err) {
      next(err)
    }
  },
)

router.use(projectFinanceErrors)
export default router
