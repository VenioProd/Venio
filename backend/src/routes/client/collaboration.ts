import express, { type NextFunction, type Request, type Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import User from '../../models/User.js'
import ProjectMember from '../../models/ProjectMember.js'
import { canManageProjectMembers, getProjectAccess } from '../../lib/projectAccess.js'

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

// Membership is owner-managed. There are no invitation links in this slice,
// so there is no bearer secret to log, leak, or revoke.
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

router.post(
  '/:projectId/collaborators',
  param('projectId').isMongoId(),
  body('userId').isMongoId().withMessage('userId doit être un ObjectId valide'),
  body('role').isIn(['VIEWER', 'EDITOR']).withMessage('role doit être VIEWER ou EDITOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const access = await ownerAccess(req, res)
      if (!access) return

      if (req.body.userId === req.user!.id) {
        return res.status(422).json({ error: 'Le propriétaire a déjà accès au projet' })
      }
      const user = await User.findOne({ _id: req.body.userId, role: 'CLIENT', isActive: { $ne: false } }).select('_id')
      if (!user) return res.status(422).json({ error: 'Le collaborateur doit être un client actif' })

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
