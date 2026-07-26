import express, { type NextFunction, type Request, type Response } from 'express'
import { param, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import { buildBillingDocumentForProposal } from '../../lib/quoteSignature.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

router.post(
  '/:id/rebuild-document',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) {
        return res.status(400).json({ error: 'Identifiant invalide' })
      }
      const proposal = await QuoteProposal.findById(req.params.id)
      if (!proposal) return res.status(404).json({ error: 'Proposition non trouvée' })
      if (proposal.status !== 'SIGNED') {
        return res
          .status(409)
          .json({ error: 'Seule une proposition signée produit un document', code: 'PROPOSAL_NOT_SIGNED' })
      }

      const billingDocument = await buildBillingDocumentForProposal(proposal)
      return res.status(201).json({ billingDocument: billingDocument.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
