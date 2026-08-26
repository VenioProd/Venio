import express, { type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import ChangeRequest, { type IChangeRequest } from '../../models/ChangeRequest.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import Project from '../../models/Project.js'
import User from '../../models/User.js'
import { notifyUsers } from '../../lib/notifyHelpers.js'
import { syncUploadToNextcloud } from '../../lib/nextcloud.js'
import { findAttachmentMeta, serveAttachment } from '../../lib/attachmentResponse.js'
import {
  actorFromRequest,
  auditChangeRequest,
  logChangeRequestActivity,
  transitionChangeRequest,
  type ChangeRequestStatus,
  type FlowActor,
} from '../../lib/changeRequestFlow.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const uploadsDir = path.resolve('uploads/change-requests')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${safeName}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

const ACTIVE_STATUSES: ChangeRequestStatus[] = ['PLANIFIEE', 'EN_COURS', 'LIVREE']

async function loadOr404(req: Request, res: Response): Promise<IChangeRequest | null> {
  const found = await ChangeRequest.findById(req.params.id)
  if (!found) {
    res.status(404).json({ error: 'Demande non trouvée' })
    return null
  }
  return found
}

/** Le client et l'auteur sont notifiés ensemble ; notifyUsers déduplique. */
async function notifyRequesters(
  changeRequest: IChangeRequest,
  actor: FlowActor,
  params: {
    type: 'CHANGE_REQUEST_QUALIFIED' | 'CHANGE_REQUEST_DELIVERED' | 'CHANGE_REQUEST_REPLY'
    title: string
    message: string
  },
): Promise<void> {
  // Attendu (et jamais rejeté) : une notification perdue parce que le process
  // s'arrête entre la réponse HTTP et l'insertion serait invisible.
  await notifyUsers([changeRequest.client, changeRequest.createdBy], {
    type: params.type,
    title: params.title,
    message: params.message,
    link: `/espace-client/demandes/${changeRequest._id}`,
    metadata: { changeRequestId: String(changeRequest._id) },
    excludeUserId: actor.id,
  }).catch(() => {})
}

router.get(
  '/',
  requirePermission(PERMISSIONS.VIEW_CHANGE_REQUESTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {}
      if (req.query.status) filter.status = req.query.status
      if (req.query.client) filter.client = req.query.client
      if (req.query.project) filter.project = req.query.project

      const changeRequests = await ChangeRequest.find(filter)
        .sort({ createdAt: -1 })
        .populate('client', 'name companyName avatarUrl')
        .populate('project', 'name')
        .lean()

      return res.json({
        changeRequests: changeRequests.map((changeRequest) => ({
          ...changeRequest,
          replyCount: changeRequest.replies?.length ?? 0,
        })),
      })
    } catch (err) {
      return next(err)
    }
  },
)

router.get(
  '/stats',
  requirePermission(PERMISSIONS.VIEW_CHANGE_REQUESTS),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [aTraiter, enCours] = await Promise.all([
        ChangeRequest.countDocuments({ status: 'SOUMISE' }),
        ChangeRequest.countDocuments({ status: { $in: ACTIVE_STATUSES } }),
      ])
      return res.json({ aTraiter, enCours })
    } catch (err) {
      return next(err)
    }
  },
)

// Avant `/:id` : sinon « files » serait capturé comme identifiant.
router.get(
  '/files/:filename',
  requirePermission(PERMISSIONS.VIEW_CHANGE_REQUESTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filename = req.params.filename as string
      const owner = await ChangeRequest.findOne({
        $or: [{ attachments: { $elemMatch: { filename } } }, { 'replies.attachments': { $elemMatch: { filename } } }],
      })
        .select('attachments replies')
        .lean()
      if (!owner) return res.status(404).json({ error: 'Fichier introuvable' })

      const filePath = path.resolve(uploadsDir, filename)
      if (!filePath.startsWith(uploadsDir)) return res.status(403).json({ error: 'Access denied' })
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' })

      return serveAttachment(res, filePath, findAttachmentMeta(owner, filename)?.originalName || filename)
    } catch (err) {
      return next(err)
    }
  },
)

router.get(
  '/:id',
  requirePermission(PERMISSIONS.VIEW_CHANGE_REQUESTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const changeRequest = await loadOr404(req, res)
      if (!changeRequest) return

      await changeRequest.populate([
        { path: 'client', select: 'name companyName avatarUrl email' },
        { path: 'project', select: 'name' },
        { path: 'quoteProposal', select: 'status title expiresAt' },
      ])

      const authorIds = [...new Set(changeRequest.replies.map((reply) => String(reply.authorId)))]
      const authors = await User.find({ _id: { $in: authorIds } }).select('_id avatarUrl')
      const avatarMap: Record<string, string> = {}
      authors.forEach((author) => {
        avatarMap[String(author._id)] = author.avatarUrl || ''
      })

      const payload = changeRequest.toObject() as unknown as Record<string, unknown>
      payload.replies = changeRequest.replies.map((reply) => {
        const raw = reply as unknown as { toObject?: () => Record<string, unknown> }
        return {
          ...(typeof raw.toObject === 'function' ? raw.toObject() : reply),
          authorAvatarUrl: avatarMap[String(reply.authorId)] || '',
        }
      })

      return res.json({ changeRequest: payload })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/reply',
  requirePermission(PERMISSIONS.MANAGE_CHANGE_REQUESTS),
  upload.array('files', 10),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const message = String(req.body.message ?? '').trim()
      if (!message) return res.status(400).json({ error: 'Message requis' })

      const changeRequest = await loadOr404(req, res)
      if (!changeRequest) return

      const actor = actorFromRequest(req.user!)
      const files = (req.files as Express.Multer.File[]) || []
      changeRequest.replies.push({
        authorId: actor.id as unknown as IChangeRequest['client'],
        authorName: actor.name,
        message,
        attachments: files.map((file) => ({
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        })),
        createdAt: new Date(),
      })
      await changeRequest.save()

      files.forEach((file) => syncUploadToNextcloud(file, 'demandes-client', String(changeRequest._id)))
      await notifyRequesters(changeRequest, actor, {
        type: 'CHANGE_REQUEST_REPLY',
        title: `Réponse de Venio : ${changeRequest.title}`,
        message: `${actor.name} a répondu à votre demande`,
      })

      return res.json({ changeRequest: changeRequest.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/qualify-include',
  requirePermission(PERMISSIONS.MANAGE_CHANGE_REQUESTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const changeRequest = await loadOr404(req, res)
      if (!changeRequest) return

      const actor = actorFromRequest(req.user!)
      // « Incluse » n'est pas un statut : la demande part directement en PLANIFIEE.
      const updated = await transitionChangeRequest({
        id: String(changeRequest._id),
        from: 'SOUMISE',
        to: 'PLANIFIEE',
        actor,
        note: 'Incluse dans le contrat de maintenance',
        set: { qualification: 'INCLUSE' },
      })
      if (!updated) return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })

      auditChangeRequest({
        action: 'CHANGE_REQUEST_QUALIFIED',
        actor,
        changeRequest: updated,
        extra: { qualification: 'INCLUSE', from: 'SOUMISE', to: 'PLANIFIEE' },
      })
      logChangeRequestActivity({
        changeRequest: updated,
        action: 'CHANGE_REQUEST_QUALIFIED',
        actor,
        summary: `Demande « ${updated.title} » incluse dans la maintenance`,
      })
      await notifyRequesters(updated, actor, {
        type: 'CHANGE_REQUEST_QUALIFIED',
        title: `Demande prise en charge : ${updated.title}`,
        message: 'Votre demande est incluse dans votre contrat et planifiée.',
      })

      return res.json({ changeRequest: updated.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/qualify-quote',
  requirePermission(PERMISSIONS.MANAGE_CHANGE_REQUESTS),
  // La route crée un document de facturation : deux permissions chaînées.
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const changeRequest = await loadOr404(req, res)
      if (!changeRequest) return
      if (changeRequest.status !== 'SOUMISE') {
        return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })
      }

      // QuoteProposal.project est requis : une demande hors projet doit s'en
      // voir attribuer un avant tout chiffrage.
      const targetProjectId = changeRequest.project ? String(changeRequest.project) : String(req.body.projectId ?? '')
      if (!targetProjectId) {
        return res
          .status(400)
          .json({ error: 'Un projet est requis pour créer un devis', code: 'PROJECT_REQUIRED_FOR_QUOTE' })
      }
      const project = await Project.findById(targetProjectId).select('client').lean()
      if (!project) return res.status(404).json({ error: 'Projet non trouvé' })
      if (String(project.client) !== String(changeRequest.client)) {
        return res
          .status(422)
          .json({ error: 'Ce projet appartient à un autre compte', code: 'PROJECT_CLIENT_MISMATCH' })
      }

      const actor = actorFromRequest(req.user!)
      const proposal = await QuoteProposal.create({
        project: targetProjectId,
        client: changeRequest.client,
        createdBy: actor.id,
        title: changeRequest.title,
        intro: changeRequest.description,
        status: 'DRAFT',
        expiresAt: req.body.expiresAt ? new Date(String(req.body.expiresAt)) : null,
      })

      const updated = await transitionChangeRequest({
        id: String(changeRequest._id),
        from: 'SOUMISE',
        to: 'A_CHIFFRER',
        actor,
        note: 'Devis à établir',
        set: { qualification: 'A_CHIFFRER', quoteProposal: proposal._id, project: targetProjectId },
      })
      if (!updated) {
        // Course perdue : le devis créé ne doit pas rester orphelin.
        await QuoteProposal.findByIdAndDelete(proposal._id)
        return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })
      }

      auditChangeRequest({
        action: 'CHANGE_REQUEST_QUALIFIED',
        actor,
        changeRequest: updated,
        extra: { qualification: 'A_CHIFFRER', proposalId: String(proposal._id), from: 'SOUMISE', to: 'A_CHIFFRER' },
      })
      logChangeRequestActivity({
        changeRequest: updated,
        action: 'CHANGE_REQUEST_QUALIFIED',
        actor,
        summary: `Demande « ${updated.title} » à chiffrer — devis créé`,
      })
      await notifyRequesters(updated, actor, {
        type: 'CHANGE_REQUEST_QUALIFIED',
        title: `Devis en préparation : ${updated.title}`,
        message: 'Cette évolution sort du périmètre de la maintenance : un devis vous sera transmis.',
      })

      return res.json({ changeRequest: updated.toObject(), proposal: proposal.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/refuse',
  requirePermission(PERMISSIONS.MANAGE_CHANGE_REQUESTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reason = String(req.body.reason ?? '').trim()
      if (!reason) return res.status(400).json({ error: 'Motif de refus requis' })

      const changeRequest = await loadOr404(req, res)
      if (!changeRequest) return
      // Refusable depuis SOUMISE et depuis A_CHIFFRER (devis expiré, annulé,
      // décliné) — sans quoi la demande resterait bloquée.
      const from = changeRequest.status
      if (from !== 'SOUMISE' && from !== 'A_CHIFFRER') {
        return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })
      }

      const actor = actorFromRequest(req.user!)
      const updated = await transitionChangeRequest({
        id: String(changeRequest._id),
        from,
        to: 'REFUSEE',
        actor,
        note: reason,
        set: { refusalReason: reason },
      })
      if (!updated) return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })

      auditChangeRequest({
        action: 'CHANGE_REQUEST_REFUSED',
        actor,
        changeRequest: updated,
        extra: { from, to: 'REFUSEE', reason },
      })
      logChangeRequestActivity({
        changeRequest: updated,
        action: 'CHANGE_REQUEST_QUALIFIED',
        actor,
        summary: `Demande « ${updated.title} » refusée : ${reason}`,
      })
      await notifyRequesters(updated, actor, {
        type: 'CHANGE_REQUEST_QUALIFIED',
        title: `Demande refusée : ${updated.title}`,
        message: reason,
      })

      return res.json({ changeRequest: updated.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/start',
  requirePermission(PERMISSIONS.MANAGE_CHANGE_REQUESTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const changeRequest = await loadOr404(req, res)
      if (!changeRequest) return

      const actor = actorFromRequest(req.user!)
      const updated = await transitionChangeRequest({
        id: String(changeRequest._id),
        from: 'PLANIFIEE',
        to: 'EN_COURS',
        actor,
      })
      if (!updated) return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })

      // Pas de notification client ici : il est prévenu à la qualification,
      // au devis et à la livraison.
      auditChangeRequest({
        action: 'CHANGE_REQUEST_STATUS_CHANGED',
        actor,
        changeRequest: updated,
        extra: { from: 'PLANIFIEE', to: 'EN_COURS' },
      })
      return res.json({ changeRequest: updated.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/deliver',
  requirePermission(PERMISSIONS.MANAGE_CHANGE_REQUESTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const changeRequest = await loadOr404(req, res)
      if (!changeRequest) return

      const actor = actorFromRequest(req.user!)
      const updated = await transitionChangeRequest({
        id: String(changeRequest._id),
        from: 'EN_COURS',
        to: 'LIVREE',
        actor,
        set: { deliveredAt: new Date() },
      })
      if (!updated) return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })

      auditChangeRequest({
        action: 'CHANGE_REQUEST_STATUS_CHANGED',
        actor,
        changeRequest: updated,
        extra: { from: 'EN_COURS', to: 'LIVREE' },
      })
      logChangeRequestActivity({
        changeRequest: updated,
        action: 'CHANGE_REQUEST_STATUS_CHANGED',
        actor,
        summary: `Demande « ${updated.title} » livrée`,
      })
      await notifyRequesters(updated, actor, {
        type: 'CHANGE_REQUEST_DELIVERED',
        title: `Demande livrée : ${updated.title}`,
        message: 'Merci de confirmer la mise en ligne depuis votre espace client.',
      })

      return res.json({ changeRequest: updated.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
