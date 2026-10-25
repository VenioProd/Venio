import { readableProjectIds, canReadProject } from '../../lib/adminProjectAccess.js'
import express, { type NextFunction, type Request, type Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requireAnyPermission, requirePermission, userHasPermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import Project from '../../models/Project.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import QuoteTemplate from '../../models/QuoteTemplate.js'
import Lead from '../../models/Lead.js'
import { canReadLead } from '../../lib/crmScope.js'
import { loadQuotePortfolio } from '../../lib/quotePortfolio.js'
import type { IQuoteProposal } from '../../types/models/index.js'
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

async function initializeProposal(proposal: IQuoteProposal) {
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
}

/**
 * Ce sur quoi porte un nouveau devis : un projet, ou un lead seul. Répond
 * lui-même 404 ou 403 et renvoie null quand la cible n'est pas admissible.
 */
async function quoteTarget(req: Request, res: Response, wanted: { project?: string; leadId?: string }) {
  if (wanted.project) {
    const project = await Project.findById(wanted.project).select('client assignedTo').lean()
    if (!project) {
      res.status(404).json({ error: 'Projet non trouvé' })
      return null
    }
    if (!(await loadQuotePortfolio(req, { projects: [project] })).canQuoteProject(project)) {
      res.status(403).json({ error: "Ce projet n'est pas dans votre portefeuille", code: 'PROJECT_OUT_OF_SCOPE' })
      return null
    }
    return { project: project._id, client: project.client, leadId: null }
  }
  const lead = await Lead.findById(wanted.leadId).select('assignedTo createdBy clientAccountId').lean()
  if (!lead || !canReadLead(req, lead)) {
    res.status(404).json({ error: 'Lead non trouvé' })
    return null
  }
  if (!(await loadQuotePortfolio(req, { leads: [lead] })).canQuoteLead(lead)) {
    res.status(403).json({ error: "Ce lead n'est pas dans votre portefeuille", code: 'LEAD_OUT_OF_SCOPE' })
    return null
  }
  // Le compte client lié au lead n'est pas repris : sans projet, personne
  // n'accède au devis, et le rattachement fixera le client à partir du projet.
  return { project: null, client: null, leadId: lead._id }
}

router.get(
  '/',
  requireAnyPermission([PERMISSIONS.MANAGE_QUOTES, PERMISSIONS.MANAGE_BILLING]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ids = await readableProjectIds(req.user!)
      const filter: Record<string, unknown> =
        ids === null ? {} : { $and: [{ $or: [{ project: null }, { project: { $in: ids } }] }] }
      if (req.query.project) filter.project = String(req.query.project)
      if (req.query.lead) filter.leadId = String(req.query.lead)
      const proposals = await QuoteProposal.find(filter).sort({ createdAt: -1 }).lean()
      return res.json({ proposals })
    } catch (err) {
      return next(err)
    }
  },
)

router.get(
  '/:id',
  requireAnyPermission([PERMISSIONS.MANAGE_QUOTES, PERMISSIONS.MANAGE_BILLING]),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Identifiant invalide' })
      const proposal = await QuoteProposal.findById(req.params.id).lean()
      if (!proposal || (proposal.project && !(await canReadProject(req.user!, String(proposal.project)))))
        return res.status(404).json({ error: 'Proposition non trouvée' })
      return res.json({ proposal })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/from-template',
  requireAnyPermission([PERMISSIONS.MANAGE_QUOTES, PERMISSIONS.MANAGE_BILLING]),
  body('templateId').isMongoId(),
  body('project').optional().isMongoId(),
  body('leadId').optional().isMongoId(),
  body().custom((value) => Boolean(value?.project) !== Boolean(value?.leadId)),
  body('title').optional().isString().trim().notEmpty(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) {
        return res.status(400).json({ error: 'Modèle, projet ou lead (un seul des deux), ou titre invalide' })
      }
      const template = await QuoteTemplate.findOne({ _id: req.body.templateId, isActive: true }).lean()
      if (!template) return res.status(404).json({ error: 'Modèle actif non trouvé' })
      const target = await quoteTarget(req, res, { project: req.body.project, leadId: req.body.leadId })
      if (!target) return
      const proposal = new QuoteProposal({
        ...target,
        createdBy: req.user!.id,
        title: req.body.title ?? template.title,
        intro: template.intro,
        questions: template.questions,
        lines: template.lines,
        status: 'DRAFT',
        expiresAt: new Date(Date.now() + template.validityDays * 86400000),
      })
      await initializeProposal(proposal)
      return res.status(201).json({ proposal: proposal.toObject() })
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

      await initializeProposal(proposal)

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

// Un devis né sur un lead passe sur le projet de l'affaire quand il existe.
router.post(
  '/:id/attach-project',
  requireAnyPermission([PERMISSIONS.MANAGE_QUOTES, PERMISSIONS.MANAGE_BILLING]),
  param('id').isMongoId(),
  body('project').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Identifiant invalide' })
      const proposal = await QuoteProposal.findById(req.params.id)
      if (!proposal) return res.status(404).json({ error: 'Proposition non trouvée' })
      if (!(await userHasPermission(req, PERMISSIONS.MANAGE_BILLING)) && String(proposal.createdBy) !== req.user!.id) {
        return res
          .status(403)
          .json({ error: 'Vous ne pouvez rattacher que vos propositions', code: 'NOT_PROPOSAL_OWNER' })
      }
      if (proposal.project) {
        return res
          .status(409)
          .json({ error: 'Ce devis est déjà rattaché à un projet', code: 'PROPOSAL_ALREADY_ATTACHED' })
      }
      if (proposal.status !== 'DRAFT') {
        return res.status(409).json({ error: 'Seul un brouillon peut être rattaché', code: 'PROPOSAL_NOT_DRAFT' })
      }
      const target = await quoteTarget(req, res, { project: req.body.project })
      if (!target) return
      // Conditionnel : deux rattachements simultanés ne peuvent pas s'écraser.
      const attached = await QuoteProposal.findOneAndUpdate(
        { _id: proposal._id, project: null, status: 'DRAFT' },
        { $set: { project: target.project, client: target.client } },
        { new: true },
      ).lean()
      if (!attached) {
        return res
          .status(409)
          .json({ error: 'Ce devis est déjà rattaché à un projet', code: 'PROPOSAL_ALREADY_ATTACHED' })
      }
      return res.json({ proposal: attached })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/send',
  requireAnyPermission([PERMISSIONS.MANAGE_QUOTES, PERMISSIONS.MANAGE_BILLING]),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Identifiant invalide' })
      const proposal = await QuoteProposal.findById(req.params.id)
      if (!proposal) return res.status(404).json({ error: 'Proposition non trouvée' })
      if (!(await userHasPermission(req, PERMISSIONS.MANAGE_BILLING)) && String(proposal.createdBy) !== req.user!.id) {
        return res
          .status(403)
          .json({ error: 'Vous ne pouvez envoyer que vos propositions', code: 'NOT_PROPOSAL_OWNER' })
      }
      if (proposal.status === 'SIGNED') {
        return res.status(409).json({ error: 'Une proposition signée est figée', code: 'PROPOSAL_ALREADY_SIGNED' })
      }
      if (proposal.status !== 'DRAFT') {
        return res.status(409).json({ error: 'Seul un brouillon peut être envoyé', code: 'PROPOSAL_NOT_DRAFT' })
      }
      if (!proposal.project) {
        return res.status(409).json({
          error: 'Rattachez le devis à un projet avant de l’envoyer',
          code: 'PROPOSAL_NOT_ATTACHED',
        })
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
