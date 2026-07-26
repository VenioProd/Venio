import express, { type NextFunction, type Request, type Response } from 'express'
import { param, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import AuditLog from '../../models/AuditLog.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import { getProjectAccess } from '../../lib/projectAccess.js'
import { computeQuoteTotals } from '../../lib/quoteTotals.js'
import type { IQuoteProposal } from '../../types/models/index.js'

const router = express.Router()

router.use(auth)

const CLIENT_VISIBLE_STATUSES = ['SENT', 'SIGNED', 'EXPIRED']

export function validationFailed(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (errors.isEmpty()) return false
  res.status(400).json({ error: errors.array()[0]?.msg ?? 'Requête invalide' })
  return true
}

function totalsOf(proposal: IQuoteProposal) {
  const { subtotal, taxTotal, total } = computeQuoteTotals(proposal.lines.toObject(), proposal.selectedOptionalLineIds)
  return { subtotal, taxTotal, total }
}

/**
 * Une offre dont la validité est dépassée bascule à la lecture plutôt que via
 * une tâche planifiée : l'état reste juste sans dépendre d'un ordonnanceur.
 */
async function applyExpiry(proposal: IQuoteProposal): Promise<IQuoteProposal> {
  if (proposal.status !== 'SENT') return proposal
  if (!proposal.expiresAt || proposal.expiresAt.getTime() > Date.now()) return proposal
  proposal.status = 'EXPIRED'
  await proposal.save()
  AuditLog.create({ action: 'QUOTE_PROPOSAL_EXPIRED', metadata: { proposalId: String(proposal._id) } }).catch(() => {})
  return proposal
}

export async function loadProposalForClient(req: Request, res: Response) {
  if (req.user!.role !== 'CLIENT') {
    res.status(403).json({ error: 'Forbidden' })
    return null
  }
  const access = await getProjectAccess(req.params.projectId as string, req.user!.id)
  if (!access) {
    res.status(404).json({ error: 'Projet non trouvé' })
    return null
  }
  const proposal = await QuoteProposal.findOne({ _id: req.params.id, project: access.project._id })
  // 404 plutôt que 403 : un brouillon ne doit pas révéler son existence.
  if (!proposal || !CLIENT_VISIBLE_STATUSES.includes(proposal.status)) {
    res.status(404).json({ error: 'Proposition non trouvée' })
    return null
  }
  return { access, proposal: await applyExpiry(proposal) }
}

router.get('/:projectId/proposals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
    const access = await getProjectAccess(req.params.projectId as string, req.user!.id)
    if (!access) return res.status(404).json({ error: 'Projet non trouvé' })

    const found = await QuoteProposal.find({
      project: access.project._id,
      status: { $in: CLIENT_VISIBLE_STATUSES },
    }).sort({ createdAt: -1 })

    const proposals = []
    for (const proposal of found) {
      const fresh = await applyExpiry(proposal)
      proposals.push({ ...fresh.toObject(), totals: totalsOf(fresh) })
    }
    return res.json({ proposals })
  } catch (err) {
    return next(err)
  }
})

router.get(
  '/:projectId/proposals/:id',
  param('projectId').isMongoId(),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const loaded = await loadProposalForClient(req, res)
      if (!loaded) return

      AuditLog.create({
        userId: req.user!.id,
        email: req.user!.email,
        action: 'QUOTE_PROPOSAL_VIEWED',
        ip: req.headers['x-forwarded-for'] || req.ip || '',
        userAgent: req.headers['user-agent'] || '',
        metadata: { proposalId: String(loaded.proposal._id) },
      }).catch(() => {})

      return res.json({ proposal: loaded.proposal.toObject(), totals: totalsOf(loaded.proposal) })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
