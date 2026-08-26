import express, { type NextFunction, type Request, type Response } from 'express'
import fs from 'fs'
import path from 'path'
import { body, param, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import AuditLog from '../../models/AuditLog.js'
import BillingDocument from '../../models/BillingDocument.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import { getProjectAccess } from '../../lib/projectAccess.js'
import { computeQuoteTotals, validateSelection } from '../../lib/quoteTotals.js'
import { buildSpecificationMarkdown } from '../../lib/quoteSpecification.js'
import { buildBillingDocumentForProposal, lockProposalForSignature } from '../../lib/quoteSignature.js'
import { promoteChangeRequestOnSignature } from '../../lib/changeRequestFlow.js'
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

/**
 * Arbitrer et signer engagent financièrement : réservé au propriétaire, même
 * si un collaborateur EDITOR peut par ailleurs modifier le contenu du projet.
 */
async function loadEditableProposal(req: Request, res: Response) {
  const loaded = await loadProposalForClient(req, res)
  if (!loaded) return null
  if (loaded.access.role !== 'OWNER') {
    res
      .status(403)
      .json({ error: 'Seul le propriétaire du projet peut valider une proposition', code: 'OWNER_REQUIRED' })
    return null
  }
  if (loaded.proposal.status === 'EXPIRED') {
    res.status(410).json({ error: 'Cette proposition a expiré', code: 'PROPOSAL_EXPIRED' })
    return null
  }
  if (loaded.proposal.status !== 'SENT') {
    res.status(409).json({ error: 'Cette proposition n’est plus modifiable', code: 'PROPOSAL_ALREADY_SIGNED' })
    return null
  }
  return loaded
}

function refreshSpecification(proposal: IQuoteProposal): void {
  if (proposal.specification.isManual) return
  proposal.specification.content = buildSpecificationMarkdown({
    title: proposal.title,
    questions: proposal.questions.toObject(),
    answers: proposal.answers.toObject(),
    lines: proposal.lines.toObject(),
    selectedOptionalLineIds: proposal.selectedOptionalLineIds,
  })
  proposal.specification.updatedAt = new Date()
}

router.patch(
  '/:projectId/proposals/:id/answers',
  param('projectId').isMongoId(),
  param('id').isMongoId(),
  body('answers').isArray().withMessage('answers doit être un tableau'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const loaded = await loadEditableProposal(req, res)
      if (!loaded) return
      const { proposal } = loaded

      const knownQuestions = new Set(proposal.questions.map((question) => String(question._id)))
      const incoming = req.body.answers as { question?: string; value?: unknown }[]
      const unknown = incoming.filter((answer) => !knownQuestions.has(String(answer.question)))
      if (unknown.length > 0) {
        return res.status(422).json({ error: 'Question inconnue', code: 'UNKNOWN_QUESTION' })
      }

      proposal.set(
        'answers',
        incoming.map((answer) => ({ question: answer.question, value: String(answer.value ?? '') })),
      )
      refreshSpecification(proposal)
      await proposal.save()

      return res.json({ proposal: proposal.toObject(), totals: totalsOf(proposal) })
    } catch (err) {
      return next(err)
    }
  },
)

router.patch(
  '/:projectId/proposals/:id/selection',
  param('projectId').isMongoId(),
  param('id').isMongoId(),
  body('selectedOptionalLineIds').isArray().withMessage('selectedOptionalLineIds doit être un tableau'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const loaded = await loadEditableProposal(req, res)
      if (!loaded) return
      const { proposal } = loaded

      const selection = (req.body.selectedOptionalLineIds as string[]).map(String)
      const check = validateSelection(proposal.lines.toObject(), selection)
      if (!check.valid) {
        return res
          .status(422)
          .json({ error: 'Sélection invalide', code: 'INVALID_LINE_SELECTION', invalidIds: check.invalidIds })
      }

      // Le corps de requête peut contenir un total : il n'est jamais lu.
      proposal.set('selectedOptionalLineIds', selection)
      refreshSpecification(proposal)
      await proposal.save()

      return res.json({ proposal: proposal.toObject(), totals: totalsOf(proposal) })
    } catch (err) {
      return next(err)
    }
  },
)

const CONSENT_TEXT =
  'Je reconnais avoir pris connaissance du périmètre et du montant de cette proposition, et je l’accepte sans réserve.'

router.post(
  '/:projectId/proposals/:id/sign',
  param('projectId').isMongoId(),
  param('id').isMongoId(),
  body('signerName').trim().isLength({ min: 2 }).withMessage('Nom du signataire requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const loaded = await loadEditableProposal(req, res)
      if (!loaded) return
      const { proposal } = loaded

      if (req.body.consent !== true) {
        return res.status(422).json({ error: 'Consentement explicite requis', code: 'CONSENT_REQUIRED' })
      }

      const answered = new Map(proposal.answers.map((answer) => [String(answer.question), answer.value.trim()]))
      const missingQuestionIds = proposal.questions
        .filter((question) => question.required && !answered.get(String(question._id)))
        .map((question) => String(question._id))
      if (missingQuestionIds.length > 0) {
        return res.status(422).json({
          error: 'Certaines questions obligatoires sont sans réponse',
          code: 'MISSING_REQUIRED_ANSWERS',
          missingQuestionIds,
        })
      }

      const ipHeader = req.headers['x-forwarded-for'] || req.ip || 'inconnue'
      const ip = Array.isArray(ipHeader) ? ipHeader[0]! : String(ipHeader)
      const locked = await lockProposalForSignature(String(proposal._id), {
        signerUserId: req.user!.id,
        signerName: String(req.body.signerName).trim(),
        signerEmail: req.user!.email,
        ip,
        userAgent: String(req.headers['user-agent'] || ''),
        consentText: CONSENT_TEXT,
      })
      if (!locked) {
        return res.status(409).json({ error: 'Cette proposition a déjà été signée', code: 'PROPOSAL_ALREADY_SIGNED' })
      }

      // Une demande de changement adossée à ce devis passe en PLANIFIEE dès la
      // signature. Best-effort et placé avant la génération du document : un
      // échec de PDF (rattrapable via rebuild-document) ne doit pas laisser la
      // demande bloquée en A_CHIFFRER.
      promoteChangeRequestOnSignature(locked, req.user!).catch(() => {})

      const billingDocument = await buildBillingDocumentForProposal(locked)

      AuditLog.create({
        userId: req.user!.id,
        email: req.user!.email,
        action: 'QUOTE_PROPOSAL_SIGNED',
        ip,
        userAgent: req.headers['user-agent'] || '',
        metadata: { proposalId: String(locked._id), billingDocumentId: String(billingDocument._id) },
      }).catch(() => {})

      return res.status(201).json({ billingDocument: billingDocument.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

const CLIENT_VISIBLE_BILLING_STATUSES = ['ISSUED', 'SENT', 'ACCEPTED', 'PAID']

router.get('/:projectId/billing', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
    const access = await getProjectAccess(req.params.projectId as string, req.user!.id)
    if (!access) return res.status(404).json({ error: 'Projet non trouvé' })

    const documents = await BillingDocument.find({
      project: access.project._id,
      status: { $in: CLIENT_VISIBLE_BILLING_STATUSES },
    })
      .sort({ issuedAt: -1, createdAt: -1 })
      .select('-pdfStoragePath -createdBy')
      .lean()

    return res.json({ documents })
  } catch (err) {
    return next(err)
  }
})

router.get(
  '/:projectId/billing/:documentId/pdf',
  param('projectId').isMongoId(),
  param('documentId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
      const access = await getProjectAccess(req.params.projectId as string, req.user!.id)
      if (!access) return res.status(404).json({ error: 'Projet non trouvé' })

      const document = await BillingDocument.findOne({
        _id: req.params.documentId,
        project: access.project._id,
        status: { $in: CLIENT_VISIBLE_BILLING_STATUSES },
      }).lean()
      if (!document?.pdfStoragePath) {
        return res.status(404).json({ error: 'Document non disponible' })
      }

      const uploadsDir = path.resolve(process.cwd(), 'uploads')
      const filePath = path.resolve(process.cwd(), document.pdfStoragePath)
      if (!filePath.startsWith(uploadsDir + path.sep) || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Document non disponible' })
      }

      // `res.download` s'appuie sur `send`, qui refuse tout chemin absolu
      // contenant un segment commençant par un point — un dépôt logé sous un
      // dossier masqué suffit à le déclencher.
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${document.number}.pdf"`)
      return fs.createReadStream(filePath).pipe(res)
    } catch (err) {
      return next(err)
    }
  },
)

export default router
