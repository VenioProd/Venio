import express, { type NextFunction, type Request, type Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import Project from '../../models/Project.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import { buildBillingDocumentForProposal } from '../../lib/quoteSignature.js'
import { buildSpecificationMarkdown } from '../../lib/quoteSpecification.js'
import ChangeRequest from '../../models/ChangeRequest.js'
import { notifyUsers } from '../../lib/notifyHelpers.js'

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

async function loadEditable(res: Response, id: string) {
  const proposal = await QuoteProposal.findById(id)
  if (!proposal) {
    res.status(404).json({ error: 'Proposition non trouvée' })
    return null
  }
  if (proposal.status === 'SIGNED') {
    res.status(409).json({ error: 'Une proposition signée est figée', code: 'PROPOSAL_ALREADY_SIGNED' })
    return null
  }
  return proposal
}

router.get(
  '/',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {}
      if (req.query.project) filter.project = req.query.project
      const proposals = await QuoteProposal.find(filter).sort({ createdAt: -1 }).lean()
      return res.json({ proposals })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  body('project').isMongoId().withMessage('Projet invalide'),
  body('title').trim().isLength({ min: 1 }).withMessage('Titre requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0]!.msg })
      }
      const project = await Project.findById(req.body.project).lean()
      if (!project) return res.status(404).json({ error: 'Projet non trouvé' })

      const proposal = await QuoteProposal.create({
        project: project._id,
        client: project.client,
        createdBy: req.user!.id,
        title: String(req.body.title).trim(),
        intro: req.body.intro ?? '',
        expiresAt: req.body.expiresAt ?? null,
        questions: req.body.questions ?? [],
        lines: req.body.lines ?? [],
      })

      proposal.selectedOptionalLineIds = proposal.lines
        .filter((line) => line.isOptional && line.isSelectedByDefault)
        .map((line) => line._id)
      proposal.specification.content = buildSpecificationMarkdown({
        title: proposal.title,
        questions: proposal.questions.toObject(),
        answers: [],
        lines: proposal.lines.toObject(),
        selectedOptionalLineIds: proposal.selectedOptionalLineIds,
      })
      await proposal.save()

      return res.status(201).json({ proposal: proposal.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proposal = await loadEditable(res, req.params.id as string)
      if (!proposal) return
      for (const field of ['title', 'intro', 'expiresAt', 'questions', 'lines'] as const) {
        if (req.body[field] !== undefined) proposal.set(field, req.body[field])
      }
      if (req.body.specification !== undefined) {
        proposal.specification.content = String(req.body.specification)
        proposal.specification.isManual = true
        proposal.specification.updatedAt = new Date()
      }
      await proposal.save()
      return res.json({ proposal: proposal.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/send',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proposal = await loadEditable(res, req.params.id as string)
      if (!proposal) return
      if (proposal.status !== 'DRAFT') {
        return res.status(409).json({ error: 'Seul un brouillon peut être envoyé', code: 'PROPOSAL_NOT_DRAFT' })
      }
      proposal.status = 'SENT'
      await proposal.save()

      // Le client suit sa demande depuis l'espace client : on l'y ramène avec
      // un lien direct vers le devis. Best-effort.
      const changeRequest = await ChangeRequest.findOne({ quoteProposal: proposal._id })
      if (changeRequest) {
        await notifyUsers([changeRequest.client, changeRequest.createdBy], {
          type: 'CHANGE_REQUEST_QUOTE_SENT',
          title: `Devis à signer : ${changeRequest.title}`,
          message: 'Votre devis est disponible dans votre espace client.',
          link: `/espace-client/projets/${proposal.project}/propositions/${proposal._id}`,
          metadata: { changeRequestId: String(changeRequest._id), proposalId: String(proposal._id) },
        }).catch(() => {})
      }

      return res.json({ proposal: proposal.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proposal = await loadEditable(res, req.params.id as string)
      if (!proposal) return
      proposal.status = 'CANCELLED'
      await proposal.save()
      return res.json({ proposal: proposal.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
