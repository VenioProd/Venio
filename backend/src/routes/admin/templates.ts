import express, { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import ProjectTemplate from '../../models/ProjectTemplate.js'
import { PERMISSIONS } from '../../lib/permissions.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET /api/admin/templates — list all templates
router.get('/', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await ProjectTemplate.find().sort({ name: 1 }).lean()
    return res.json({ templates })
  } catch (err) {
    return next(err)
  }
})

// GET /api/admin/templates/:id — get single template
router.get('/:id', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await ProjectTemplate.findById(req.params.id).lean()
    if (!template) {
      return res.status(404).json({ error: 'Template non trouvé' })
    }
    return res.json({ template })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/templates — create template
router.post(
  '/',
  requirePermission(PERMISSIONS.EDIT_PROJECTS),
  body('name').trim().notEmpty().withMessage('Le nom est requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const { name, description, serviceTypes, deliverableTypes, tags, priority, defaultSections, defaultTasks, budget } = req.body

      const template = await ProjectTemplate.create({
        name,
        description: description || '',
        serviceTypes: Array.isArray(serviceTypes) ? serviceTypes : [],
        deliverableTypes: Array.isArray(deliverableTypes) ? deliverableTypes : [],
        tags: Array.isArray(tags) ? tags : [],
        priority: priority || 'NORMALE',
        defaultSections: Array.isArray(defaultSections) ? defaultSections.filter((s: any) => s.title) : [],
        defaultTasks: Array.isArray(defaultTasks) ? defaultTasks.filter((t: any) => t.title) : [],
        budget: budget && typeof budget === 'object' ? { amount: budget.amount || null, currency: budget.currency || 'EUR' } : { amount: null, currency: 'EUR' },
        createdBy: req.user!.id,
      })

      return res.status(201).json({ template })
    } catch (err) {
      return next(err)
    }
  }
)

// PATCH /api/admin/templates/:id — update template
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.EDIT_PROJECTS),
  body('name').optional().trim().notEmpty().withMessage('Le nom ne peut pas être vide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const update: Record<string, unknown> = {}
      const { name, description, serviceTypes, deliverableTypes, tags, priority, defaultSections, defaultTasks, budget } = req.body

      if (name !== undefined) update.name = name
      if (description !== undefined) update.description = description
      if (serviceTypes !== undefined) update.serviceTypes = Array.isArray(serviceTypes) ? serviceTypes : []
      if (deliverableTypes !== undefined) update.deliverableTypes = Array.isArray(deliverableTypes) ? deliverableTypes : []
      if (tags !== undefined) update.tags = Array.isArray(tags) ? tags : []
      if (priority !== undefined) update.priority = priority
      if (defaultSections !== undefined) update.defaultSections = Array.isArray(defaultSections) ? defaultSections.filter((s: any) => s.title) : []
      if (defaultTasks !== undefined) update.defaultTasks = Array.isArray(defaultTasks) ? defaultTasks.filter((t: any) => t.title) : []
      if (budget !== undefined) update.budget = budget && typeof budget === 'object' ? { amount: budget.amount || null, currency: budget.currency || 'EUR' } : { amount: null, currency: 'EUR' }

      const template = await ProjectTemplate.findByIdAndUpdate(req.params.id, update, { new: true })
      if (!template) {
        return res.status(404).json({ error: 'Template non trouvé' })
      }

      return res.json({ template })
    } catch (err) {
      return next(err)
    }
  }
)

// DELETE /api/admin/templates/:id
router.delete('/:id', requirePermission(PERMISSIONS.EDIT_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await ProjectTemplate.findByIdAndDelete(req.params.id)
    if (!template) {
      return res.status(404).json({ error: 'Template non trouvé' })
    }
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

export default router
