import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { buildActorFromReq, recordAudit } from '../../../lib/audit/auditHelpers.js'
import { createCreditNote } from '../../../lib/projectFinance/creditNotes.js'
import projectFinanceErrors from './projectFinanceErrors.js'

const router = express.Router()
router.use(auth, requireAdmin)
router.post<{ invoiceId: string }>(
  '/invoices/:invoiceId/credit-notes',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req, res, next) => {
    try {
      const document = await createCreditNote({
        invoiceId: req.params.invoiceId,
        amountHtCents: req.body?.amountHtCents,
        reason: req.body?.reason,
        userId: req.user!.id,
      })
      await recordAudit({
        action: 'BILLING_CREDIT_NOTE_CREATE',
        actor: buildActorFromReq(req),
        entityType: 'BillingDocument',
        entityId: String(document._id),
        after: document.toObject(),
      })
      res.status(201).json({ document })
    } catch (err) {
      next(err)
    }
  },
)
router.use(projectFinanceErrors)
export default router
