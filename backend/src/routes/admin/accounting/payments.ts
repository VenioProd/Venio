import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { buildActorFromReq, recordAudit } from '../../../lib/audit/auditHelpers.js'
import { recordPayment, recordRefund } from '../../../lib/projectFinance/payments.js'
import ProjectPayment from '../../../models/ProjectPayment.js'
import ShareAllocation from '../../../models/ShareAllocation.js'
import projectFinanceErrors from './projectFinanceErrors.js'

const router = express.Router()
router.use(auth, requireAdmin)
router.post<{ invoiceId: string }>(
  '/invoices/:invoiceId/payments',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req, res, next) => {
    try {
      const result = await recordPayment({
        invoiceId: req.params.invoiceId,
        amountTtcCents: req.body?.amountTtcCents,
        method: req.body?.method,
        receivedAt: req.body?.receivedAt,
        reference: req.body?.reference,
        idempotencyKey: req.body?.idempotencyKey,
        userId: req.user!.id,
      })
      await recordAudit({
        action: 'PROJECT_PAYMENT_CREATE',
        actor: buildActorFromReq(req),
        entityType: 'ProjectPayment',
        entityId: String(result.payment._id),
        after: result.payment.toObject(),
      })
      res.status(result.alreadyExisted ? 200 : 201).json(result)
    } catch (err) {
      next(err)
    }
  },
)
router.post<{ paymentId: string }>(
  '/payments/:paymentId/refunds',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req, res, next) => {
    try {
      const result = await recordRefund({
        paymentId: req.params.paymentId,
        amountTtcCents: req.body?.amountTtcCents,
        receivedAt: req.body?.receivedAt,
        reason: req.body?.reason,
        idempotencyKey: req.body?.idempotencyKey,
        userId: req.user!.id,
      })
      await recordAudit({
        action: 'PROJECT_REFUND_CREATE',
        actor: buildActorFromReq(req),
        entityType: 'ProjectPayment',
        entityId: String(result.payment._id),
        after: result.payment.toObject(),
      })
      res.status(result.alreadyExisted ? 200 : 201).json(result)
    } catch (err) {
      next(err)
    }
  },
)
async function paymentsWithAllocations(filter: { invoice: string } | { project: string }) {
  const payments = await ProjectPayment.find(filter).sort({ receivedAt: 1, createdAt: 1 }).lean()
  const allocations = await ShareAllocation.find({ payment: { $in: payments.map((payment) => payment._id) } }).lean()
  return payments.map((payment) => ({
    ...payment,
    allocations: allocations.filter((allocation) => String(allocation.payment) === String(payment._id)),
  }))
}
router.get<{ invoiceId: string }>(
  '/invoices/:invoiceId/payments',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req, res, next) => {
    try {
      res.json({ payments: await paymentsWithAllocations({ invoice: req.params.invoiceId }) })
    } catch (err) {
      next(err)
    }
  },
)
router.get<{ projectId: string }>(
  '/projects/:projectId/payments',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req, res, next) => {
    try {
      res.json({ payments: await paymentsWithAllocations({ project: req.params.projectId }) })
    } catch (err) {
      next(err)
    }
  },
)
router.use(projectFinanceErrors)
export default router
