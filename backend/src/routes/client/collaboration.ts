import express, { type NextFunction, type Request, type Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import rateLimit from 'express-rate-limit'
import auth from '../../middleware/auth.js'
import User from '../../models/User.js'
import ProjectMember from '../../models/ProjectMember.js'
import ProjectInvitation from '../../models/ProjectInvitation.js'
import { canManageProjectMembers, getProjectAccess } from '../../lib/projectAccess.js'
import {
  createProjectInvitationToken,
  hashProjectInvitationToken,
  isValidProjectInvitationToken,
  PROJECT_INVITATION_TTL_MS,
} from '../../lib/projectInvitations.js'

const router = express.Router()

router.use(auth)

function clientOnly(req: Request, res: Response): boolean {
  if (req.user!.role === 'CLIENT') return true
  res.status(403).json({ error: 'Forbidden' })
  return false
}

async function ownerAccess(req: Request, res: Response) {
  if (!clientOnly(req, res)) return null
  const access = await getProjectAccess(req.params.projectId, req.user!.id)
  if (!access) {
    res.status(404).json({ error: 'Projet non trouvé' })
    return null
  }
  if (!canManageProjectMembers(access)) {
    res.status(403).json({ error: 'Seul le propriétaire peut gérer les collaborateurs' })
    return null
  }
  return access
}

function validationFailed(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (errors.isEmpty()) return false
  res.status(400).json({ error: errors.array()[0]?.msg ?? 'Requête invalide', errors: errors.array() })
  return true
}

function invitationMetadata(invitation: {
  _id: unknown
  role: string
  createdAt: Date
  expiresAt: Date
  revokedAt: Date | null
  usedAt: Date | null
  usedBy?: unknown
}) {
  return {
    _id: String(invitation._id),
    role: invitation.role,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    revokedAt: invitation.revokedAt,
    usedAt: invitation.usedAt,
    usedBy: invitation.usedBy ?? null,
  }
}

function invitationError(res: Response, status: number, code: string, error: string): Response {
  return res.status(status).json({ error, code })
}

function clientPortalBaseUrl(): string {
  const explicitClientUrl = process.env.CLIENT_URL?.trim()
  if (explicitClientUrl) return explicitClientUrl.replace(/\/$/, '')

  const corsOrigin = process.env.CORS_ORIGIN?.trim()
  if (corsOrigin) return `${corsOrigin.replace(/\/$/, '')}/espace-client`

  return 'http://localhost:5501/espace-client'
}

const invitationAcceptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Trop de tentatives d’acceptation, veuillez réessayer plus tard.',
    code: 'INVITATION_RATE_LIMITED',
  },
})

router.get('/:projectId/collaborators', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const access = await ownerAccess(req, res)
    if (!access) return

    const collaborators = await ProjectMember.find({ project: access.project._id })
      .sort({ createdAt: 1 })
      .populate('user', 'name email avatarUrl')
      .select('user role createdAt')
      .lean()
    return res.json({ collaborators })
  } catch (err) {
    return next(err)
  }
})

router.get(
  '/:projectId/invitations',
  param('projectId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const access = await ownerAccess(req, res)
      if (!access) return

      const invitations = await ProjectInvitation.find({ project: access.project._id })
        .sort({ createdAt: -1 })
        .select('role createdAt expiresAt revokedAt usedAt usedBy')
        .populate('usedBy', 'name email')
        .lean()
      return res.json({ invitations: invitations.map(invitationMetadata) })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:projectId/invitations',
  param('projectId').isMongoId(),
  body('role').isIn(['VIEWER', 'EDITOR']).withMessage('role doit être VIEWER ou EDITOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const access = await ownerAccess(req, res)
      if (!access) return

      const token = createProjectInvitationToken()
      const invitation = await ProjectInvitation.create({
        project: access.project._id,
        tokenHash: hashProjectInvitationToken(token),
        role: req.body.role,
        createdBy: req.user!.id,
        expiresAt: new Date(Date.now() + PROJECT_INVITATION_TTL_MS),
      })

      // The fragment is intentionally used for the bearer secret: browsers do
      // not send it to this server or intermediaries as part of the request.
      return res.status(201).json({
        invitation: invitationMetadata(invitation),
        invitationUrl: `${clientPortalBaseUrl()}/invitation#${token}`,
      })
    } catch (err) {
      return next(err)
    }
  },
)

router.delete(
  '/:projectId/invitations/:invitationId',
  param('projectId').isMongoId(),
  param('invitationId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const access = await ownerAccess(req, res)
      if (!access) return

      const invitation = await ProjectInvitation.findOneAndUpdate(
        {
          _id: req.params.invitationId,
          project: access.project._id,
          revokedAt: null,
          usedAt: null,
        },
        { $set: { revokedAt: new Date(), revokedBy: req.user!.id } },
        { new: true },
      )
      if (!invitation) {
        return invitationError(res, 409, 'INVITATION_NOT_ACTIVE', 'Cette invitation ne peut plus être révoquée')
      }
      return res.json({ invitation: invitationMetadata(invitation) })
    } catch (err) {
      return next(err)
    }
  },
)

// The secret only arrives in a JSON body after authentication. There is no
// public "inspect invitation" endpoint, so a bearer link never reveals a
// project or its content by itself.
router.post(
  '/invitations/accept',
  invitationAcceptLimiter,
  body('token')
    .custom((value) => isValidProjectInvitationToken(value))
    .withMessage('Invitation invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) {
        return invitationError(res, 404, 'INVITATION_INVALID', 'Invitation introuvable ou invalide')
      }
      if (!clientOnly(req, res)) return

      const tokenHash = hashProjectInvitationToken(req.body.token)
      const invitation = await ProjectInvitation.findOne({ tokenHash }).select('+tokenHash')
      if (!invitation) {
        return invitationError(res, 404, 'INVITATION_INVALID', 'Invitation introuvable ou invalide')
      }

      const now = new Date()
      if (invitation.revokedAt) {
        return invitationError(res, 410, 'INVITATION_REVOKED', 'Cette invitation a été révoquée')
      }
      if (invitation.expiresAt.getTime() <= now.getTime()) {
        return invitationError(res, 410, 'INVITATION_EXPIRED', 'Cette invitation a expiré')
      }
      if (invitation.usedAt) {
        return invitationError(res, 409, 'INVITATION_ALREADY_USED', 'Cette invitation a déjà été utilisée')
      }

      const project = await getProjectAccess(String(invitation.project), req.user!.id)
      if (project?.role === 'OWNER') {
        return invitationError(res, 422, 'INVITATION_OWNER', 'Le propriétaire a déjà accès à ce projet')
      }
      if (project) {
        return invitationError(res, 409, 'INVITATION_ALREADY_MEMBER', 'Vous avez déjà accès à ce projet')
      }

      // Claim the link before creating membership. The state predicates make
      // concurrent accepts mutually exclusive, including across processes.
      const claimed = await ProjectInvitation.findOneAndUpdate(
        {
          _id: invitation._id,
          tokenHash,
          revokedAt: null,
          usedAt: null,
          expiresAt: { $gt: now },
        },
        { $set: { usedAt: now, usedBy: req.user!.id } },
        { new: true },
      )
      if (!claimed) {
        const current = await ProjectInvitation.findById(invitation._id).select('revokedAt usedAt expiresAt')
        if (current?.revokedAt)
          return invitationError(res, 410, 'INVITATION_REVOKED', 'Cette invitation a été révoquée')
        if (current && current.expiresAt.getTime() <= Date.now()) {
          return invitationError(res, 410, 'INVITATION_EXPIRED', 'Cette invitation a expiré')
        }
        return invitationError(res, 409, 'INVITATION_ALREADY_USED', 'Cette invitation a déjà été utilisée')
      }

      try {
        await ProjectMember.create({
          project: claimed.project,
          user: req.user!.id,
          role: claimed.role,
          createdBy: claimed.createdBy,
        })
      } catch (err) {
        // An owner may add the same user between the pre-check and this insert.
        // The invitation remains consumed, but no privilege can be widened.
        if ((err as { code?: number }).code === 11000) {
          return invitationError(res, 409, 'INVITATION_ALREADY_MEMBER', 'Vous avez déjà accès à ce projet')
        }
        return next(err)
      }

      return res.status(201).json({ projectId: String(claimed.project), role: claimed.role })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:projectId/collaborators',
  param('projectId').isMongoId(),
  body('email')
    .trim()
    .isEmail()
    .withMessage('email doit être une adresse valide')
    .customSanitizer((value) => String(value).toLowerCase()),
  body('role').isIn(['VIEWER', 'EDITOR']).withMessage('role doit être VIEWER ou EDITOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const access = await ownerAccess(req, res)
      if (!access) return

      // This is an exact, normalized lookup only. Deliberately do not expose a
      // client directory or a search endpoint from the project space.
      const email = String(req.body.email).trim().toLowerCase()
      const user = await User.findOne({ email, role: 'CLIENT', isActive: { $ne: false } }).select('_id')
      if (!user) return res.status(422).json({ error: 'Client actif introuvable pour cette adresse' })

      if (String(user._id) === req.user!.id) {
        return res.status(422).json({ error: 'Le propriétaire a déjà accès au projet' })
      }

      const collaborator = await ProjectMember.create({
        project: access.project._id,
        user: user._id,
        role: req.body.role,
        createdBy: req.user!.id,
      })
      await collaborator.populate('user', 'name email avatarUrl')
      return res.status(201).json({ collaborator })
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        return res.status(409).json({ error: 'Ce collaborateur a déjà accès au projet' })
      }
      return next(err)
    }
  },
)

router.patch(
  '/:projectId/collaborators/:memberId',
  param('projectId').isMongoId(),
  param('memberId').isMongoId(),
  body('role').isIn(['VIEWER', 'EDITOR']).withMessage('role doit être VIEWER ou EDITOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const access = await ownerAccess(req, res)
      if (!access) return
      const collaborator = await ProjectMember.findOneAndUpdate(
        { _id: req.params.memberId, project: access.project._id },
        { $set: { role: req.body.role } },
        { new: true },
      ).populate('user', 'name email avatarUrl')
      if (!collaborator) return res.status(404).json({ error: 'Collaborateur introuvable' })
      return res.json({ collaborator })
    } catch (err) {
      return next(err)
    }
  },
)

router.delete(
  '/:projectId/collaborators/:memberId',
  param('projectId').isMongoId(),
  param('memberId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const access = await ownerAccess(req, res)
      if (!access) return
      const collaborator = await ProjectMember.findOneAndDelete({
        _id: req.params.memberId,
        project: access.project._id,
      })
      if (!collaborator) return res.status(404).json({ error: 'Collaborateur introuvable' })
      return res.json({ success: true })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
