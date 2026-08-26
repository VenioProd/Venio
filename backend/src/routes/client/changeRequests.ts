import express, { type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import auth from '../../middleware/auth.js'
import requireRole from '../../middleware/role.js'
import ChangeRequest, { type IChangeRequest } from '../../models/ChangeRequest.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import User from '../../models/User.js'
import { getProjectAccess } from '../../lib/projectAccess.js'
import { notifySuperAdmins } from '../../lib/notifyHelpers.js'
import { syncUploadToNextcloud } from '../../lib/nextcloud.js'
import { serveAttachment } from '../../lib/attachmentResponse.js'
import {
  actorFromRequest,
  auditChangeRequest,
  logChangeRequestActivity,
  transitionChangeRequest,
} from '../../lib/changeRequestFlow.js'

const router = express.Router()

router.use(auth)
router.use(requireRole('CLIENT'))

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

/** Statuts de devis exploitables par le client (mêmes que client/quotes.ts). */
const CLIENT_VISIBLE_PROPOSAL_STATUSES = ['SENT', 'SIGNED', 'EXPIRED']

/**
 * Une demande est visible du compte propriétaire et de son auteur. Le
 * collaborateur ne voit donc pas tout le compte, seulement ce qu'il a soumis.
 */
function visibilityFilter(userId: string): Record<string, unknown> {
  return { $or: [{ client: userId }, { createdBy: userId }] }
}

function attachmentsFrom(req: Request) {
  const files = (req.files as Express.Multer.File[]) || []
  return {
    files,
    attachments: files.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    })),
  }
}

/** 404 et non 403 : ne jamais révéler l'existence d'une demande. */
async function loadVisible(req: Request, res: Response): Promise<IChangeRequest | null> {
  const found = await ChangeRequest.findOne({ _id: req.params.id, ...visibilityFilter(req.user!.id) })
  if (!found) {
    res.status(404).json({ error: 'Demande non trouvée' })
    return null
  }
  return found
}

/** Le devis lié n'est exposé que lorsqu'il est consultable côté client. */
async function linkedProposalOf(changeRequest: IChangeRequest) {
  if (!changeRequest.quoteProposal || !changeRequest.project) return null
  const proposal = await QuoteProposal.findById(changeRequest.quoteProposal).select('status title').lean()
  if (!proposal || !CLIENT_VISIBLE_PROPOSAL_STATUSES.includes(proposal.status)) return null
  return {
    proposalId: String(proposal._id),
    projectId: String(changeRequest.project),
    status: proposal.status,
    title: proposal.title,
  }
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = visibilityFilter(req.user!.id)
    if (req.query.status) filter.status = req.query.status
    const found = await ChangeRequest.find(filter).sort({ createdAt: -1 }).populate('project', 'name')

    const changeRequests = []
    for (const changeRequest of found) {
      changeRequests.push({
        ...changeRequest.toObject(),
        replyCount: changeRequest.replies.length,
        linkedProposal: await linkedProposalOf(changeRequest),
      })
    }
    return res.json({ changeRequests })
  } catch (err) {
    return next(err)
  }
})

// Déclarée avant `/:id` : sinon « files » serait capturé comme identifiant.
router.get('/files/:filename', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filename = req.params.filename as string
    const owned = await ChangeRequest.exists({
      ...visibilityFilter(req.user!.id),
      $and: [
        {
          $or: [{ attachments: { $elemMatch: { filename } } }, { 'replies.attachments': { $elemMatch: { filename } } }],
        },
      ],
    })
    if (!owned) return res.status(404).json({ error: 'Fichier introuvable' })

    const filePath = path.resolve(uploadsDir, filename)
    if (!filePath.startsWith(uploadsDir)) return res.status(403).json({ error: 'Access denied' })
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' })

    const attachment = await ChangeRequest.findOne(
      { ...visibilityFilter(req.user!.id), 'attachments.filename': filename },
      { 'attachments.$': 1 },
    ).lean()
    return serveAttachment(res, filePath, attachment?.attachments?.[0]?.originalName || filename)
  } catch (err) {
    return next(err)
  }
})

router.post('/', upload.array('files', 10), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const title = String(req.body.title ?? '').trim()
    const description = String(req.body.description ?? '').trim()
    if (!title) return res.status(400).json({ error: 'Titre requis' })
    if (!description) return res.status(400).json({ error: 'Description requise' })

    const pageUrl = String(req.body.pageUrl ?? '').trim()
    if (pageUrl && !/^https?:\/\/\S+$/i.test(pageUrl)) {
      return res.status(400).json({ error: 'URL de page invalide' })
    }

    const priority = ['BASSE', 'NORMALE', 'HAUTE'].includes(req.body.priority) ? req.body.priority : 'NORMALE'

    // Sur projet, la demande appartient au COMPTE propriétaire : un
    // collaborateur soumet ainsi pour le compte de son client.
    let project: string | null = null
    let client = req.user!.id
    if (req.body.projectId) {
      const access = await getProjectAccess(String(req.body.projectId), req.user!.id)
      if (!access) return res.status(404).json({ error: 'Projet non trouvé' })
      project = String(access.project._id)
      client = String(access.project.client)
    }

    const actor = actorFromRequest(req.user!)
    const { files, attachments } = attachmentsFrom(req)

    const created = await ChangeRequest.create({
      client,
      project,
      title,
      description,
      pageUrl,
      priority,
      createdBy: actor.id,
      createdByName: actor.name,
      attachments,
      statusHistory: [{ status: 'SOUMISE', at: new Date(), byUserId: actor.id, byName: actor.name, note: '' }],
    })

    files.forEach((file) => syncUploadToNextcloud(file, 'demandes-client', String(created._id)))

    auditChangeRequest({ action: 'CHANGE_REQUEST_CREATED', actor, changeRequest: created })
    logChangeRequestActivity({
      changeRequest: created,
      action: 'CHANGE_REQUEST_CREATED',
      actor,
      summary: `Demande de changement « ${created.title} » soumise`,
    })
    await notifySuperAdmins({
      type: 'CHANGE_REQUEST_CREATED',
      title: `Nouvelle demande : ${created.title}`,
      message: `${actor.name} a soumis une demande de changement`,
      link: `/admin/demandes-clients/${created._id}`,
      metadata: { changeRequestId: String(created._id) },
    }).catch(() => {})

    return res.status(201).json({ changeRequest: created.toObject() })
  } catch (err) {
    return next(err)
  }
})

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const changeRequest = await loadVisible(req, res)
    if (!changeRequest) return

    await changeRequest.populate('project', 'name')
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
    payload.linkedProposal = await linkedProposalOf(changeRequest)

    return res.json({ changeRequest: payload })
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/reply', upload.array('files', 10), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const message = String(req.body.message ?? '').trim()
    if (!message) return res.status(400).json({ error: 'Message requis' })

    const changeRequest = await loadVisible(req, res)
    if (!changeRequest) return

    const actor = actorFromRequest(req.user!)
    const { files, attachments } = attachmentsFrom(req)

    // Répondre ne change jamais le statut : le fil reste ouvert même sur un
    // état terminal (question après refus, remerciement après validation).
    changeRequest.replies.push({
      authorId: actor.id as unknown as IChangeRequest['client'],
      authorName: actor.name,
      message,
      attachments,
      createdAt: new Date(),
    })
    await changeRequest.save()

    files.forEach((file) => syncUploadToNextcloud(file, 'demandes-client', String(changeRequest._id)))
    await notifySuperAdmins({
      type: 'CHANGE_REQUEST_REPLY',
      title: `Réponse client : ${changeRequest.title}`,
      message: `${actor.name} a répondu sur une demande`,
      link: `/admin/demandes-clients/${changeRequest._id}`,
      metadata: { changeRequestId: String(changeRequest._id) },
    }).catch(() => {})

    return res.json({ changeRequest: changeRequest.toObject() })
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const changeRequest = await loadVisible(req, res)
    if (!changeRequest) return

    // Valider clôt l'engagement : réservé au compte, comme signer un devis.
    if (String(changeRequest.client) !== req.user!.id) {
      return res.status(403).json({ error: 'Seul le titulaire du compte peut valider', code: 'OWNER_REQUIRED' })
    }
    if (changeRequest.status !== 'LIVREE') {
      return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })
    }

    const actor = actorFromRequest(req.user!)
    const updated = await transitionChangeRequest({
      id: String(changeRequest._id),
      from: 'LIVREE',
      to: 'VALIDEE',
      actor,
      set: { validatedAt: new Date() },
    })
    if (!updated) return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })

    auditChangeRequest({
      action: 'CHANGE_REQUEST_STATUS_CHANGED',
      actor,
      changeRequest: updated,
      extra: { from: 'LIVREE', to: 'VALIDEE' },
    })
    logChangeRequestActivity({
      changeRequest: updated,
      action: 'CHANGE_REQUEST_STATUS_CHANGED',
      actor,
      summary: `Demande « ${updated.title} » validée par le client`,
    })
    return res.json({ changeRequest: updated.toObject() })
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/request-correction', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const comment = String(req.body.comment ?? '').trim()
    if (!comment) return res.status(400).json({ error: 'Commentaire requis' })

    const changeRequest = await loadVisible(req, res)
    if (!changeRequest) return
    if (changeRequest.status !== 'LIVREE') {
      return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })
    }

    const actor = actorFromRequest(req.user!)
    const updated = await transitionChangeRequest({
      id: String(changeRequest._id),
      from: 'LIVREE',
      to: 'EN_COURS',
      actor,
      note: comment,
    })
    if (!updated) return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })

    // Le commentaire vit dans le fil ET dans l'historique : l'un se lit dans
    // la conversation, l'autre dans la frise.
    updated.replies.push({
      authorId: actor.id as unknown as IChangeRequest['client'],
      authorName: actor.name,
      message: comment,
      attachments: [],
      createdAt: new Date(),
    })
    await updated.save()

    auditChangeRequest({
      action: 'CHANGE_REQUEST_STATUS_CHANGED',
      actor,
      changeRequest: updated,
      extra: { from: 'LIVREE', to: 'EN_COURS', reason: 'correction' },
    })
    await notifySuperAdmins({
      type: 'CHANGE_REQUEST_REPLY',
      title: `Correction demandée : ${updated.title}`,
      message: `${actor.name} demande une correction`,
      link: `/admin/demandes-clients/${updated._id}`,
      metadata: { changeRequestId: String(updated._id) },
    }).catch(() => {})

    return res.json({ changeRequest: updated.toObject() })
  } catch (err) {
    return next(err)
  }
})

export default router
