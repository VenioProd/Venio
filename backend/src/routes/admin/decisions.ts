import express, { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requireSuperAdmin } from '../../middleware/role.js'
import Decision from '../../models/Decision.js'
import User from '../../models/User.js'
import { createNotification } from '../../lib/notifications.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET /api/admin/decisions?status=PENDING — liste des décisions
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, mine } = req.query
    const filter: Record<string, unknown> = {}
    if (typeof status === 'string') filter.status = status
    if (mine === 'true') filter.submittedBy = req.user!.id

    const decisions = await Decision.find(filter)
      .sort({ priority: -1, createdAt: -1 })
      .limit(50)
      .populate('submittedBy', 'name email avatarUrl')
      .populate('decidedBy', 'name email')

    return res.json({ decisions })
  } catch (err) {
    return next(err)
  }
})

// GET /api/admin/decisions/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decision = await Decision.findById(req.params.id)
      .populate('submittedBy', 'name email avatarUrl')
      .populate('decidedBy', 'name email')
    if (!decision) return res.status(404).json({ message: 'Décision introuvable' })
    return res.json({ decision })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/decisions — soumettre une décision (tout admin)
router.post(
  '/',
  body('title').isString().isLength({ min: 3, max: 200 }),
  body('description').isString().isLength({ min: 3 }),
  body('category').optional().isIn(['BUDGET', 'EMBAUCHE', 'PROJET', 'PARTENARIAT', 'AUTRE']),
  body('priority').optional().isIn(['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']),
  body('deadline').optional({ nullable: true }).isISO8601(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

      const { title, description, category, priority, context, options, recommendation, deadline } =
        req.body
      const decision = await Decision.create({
        title,
        description,
        category: category || 'AUTRE',
        priority: priority || 'NORMALE',
        submittedBy: req.user!.id,
        submittedByName: req.user!.name || req.user!.email || 'Inconnu',
        context: context || null,
        options: Array.isArray(options) ? options.slice(0, 10) : [],
        recommendation: recommendation || null,
        deadline: deadline ? new Date(deadline) : null,
      })

      // Notifier tous les super admins d'une nouvelle décision à traiter
      const superAdmins = await User.find({ role: 'SUPER_ADMIN', isActive: true }).select('_id').lean()
      const submitterName = req.user!.name || req.user!.email || 'Un admin'
      await Promise.allSettled(
        superAdmins
          .filter((admin) => String(admin._id) !== req.user!.id)
          .map((admin) =>
            createNotification({
              recipient: admin._id,
              type: 'DECISION_SUBMITTED',
              title: `Nouvelle décision à valider`,
              message: `${submitterName} a soumis : "${title}"`,
              link: `/admin/decisions`,
              metadata: { decisionId: String(decision._id) },
            })
          )
      )

      return res.status(201).json({ decision })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/admin/decisions/:id/approve — super admin uniquement
router.post('/:id/approve', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { comment } = req.body
    const decision = await Decision.findById(req.params.id)
    if (!decision) return res.status(404).json({ message: 'Décision introuvable' })
    if (decision.status !== 'PENDING') {
      return res.status(409).json({ message: 'Décision déjà traitée' })
    }
    decision.status = 'APPROVED'
    decision.decidedBy = req.user!.id as unknown as typeof decision.decidedBy
    decision.decidedByName = req.user!.name || req.user!.email || 'Super admin'
    decision.decisionComment = comment || null
    decision.decidedAt = new Date()
    await decision.save()

    // Notifier le soumetteur
    if (decision.submittedBy && String(decision.submittedBy) !== req.user!.id) {
      createNotification({
        recipient: decision.submittedBy,
        type: 'DECISION_APPROVED',
        title: `Décision approuvée ✅`,
        message: `"${decision.title}" a été approuvée${comment ? ` : ${comment}` : ''}`,
        link: `/admin/decisions`,
        metadata: { decisionId: String(decision._id) },
      }).catch(() => {})
    }

    return res.json({ decision })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/decisions/:id/reject — super admin uniquement
router.post('/:id/reject', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { comment } = req.body
    const decision = await Decision.findById(req.params.id)
    if (!decision) return res.status(404).json({ message: 'Décision introuvable' })
    if (decision.status !== 'PENDING') {
      return res.status(409).json({ message: 'Décision déjà traitée' })
    }
    decision.status = 'REJECTED'
    decision.decidedBy = req.user!.id as unknown as typeof decision.decidedBy
    decision.decidedByName = req.user!.name || req.user!.email || 'Super admin'
    decision.decisionComment = comment || null
    decision.decidedAt = new Date()
    await decision.save()

    // Notifier le soumetteur
    if (decision.submittedBy && String(decision.submittedBy) !== req.user!.id) {
      createNotification({
        recipient: decision.submittedBy,
        type: 'DECISION_REJECTED',
        title: `Décision refusée ❌`,
        message: `"${decision.title}" a été refusée${comment ? ` : ${comment}` : ''}`,
        link: `/admin/decisions`,
        metadata: { decisionId: String(decision._id) },
      }).catch(() => {})
    }

    return res.json({ decision })
  } catch (err) {
    return next(err)
  }
})

// DELETE /api/admin/decisions/:id — submitter ou super admin
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decision = await Decision.findById(req.params.id)
    if (!decision) return res.status(404).json({ message: 'Décision introuvable' })
    const isOwner = String(decision.submittedBy) === req.user!.id
    const isSuper = req.user!.role === 'SUPER_ADMIN'
    if (!isOwner && !isSuper) return res.status(403).json({ message: 'Accès refusé' })
    await decision.deleteOne()
    return res.json({ ok: true })
  } catch (err) {
    return next(err)
  }
})

export default router
