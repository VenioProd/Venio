import express, { type NextFunction, type Request, type Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requireAnyPermission, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import QuoteTemplate from '../../models/QuoteTemplate.js'

const router = express.Router()
router.use(auth, requireAdmin)

const fields = ['name', 'title', 'intro', 'questions', 'lines', 'validityDays'] as const
const validators = [
  body('name').optional().isString().trim().notEmpty(),
  body('title').optional().isString().trim().notEmpty(),
  body('intro').optional().isString(),
  body('questions').optional().isArray(),
  body('lines').optional().isArray(),
  body('validityDays').optional().isInt({ min: 1 }).toInt(),
]

router.get(
  '/',
  requireAnyPermission([PERMISSIONS.MANAGE_QUOTES, PERMISSIONS.MANAGE_BILLING]),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const templates = await QuoteTemplate.find({ isActive: true }).sort({ name: 1 }).lean()
      return res.json({ templates })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  validators,
  body('name').exists(),
  body('title').exists(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Modèle invalide' })
      const payload = Object.fromEntries(
        fields.filter((field) => req.body[field] !== undefined).map((field) => [field, req.body[field]]),
      )
      const template = await QuoteTemplate.create({ ...payload, createdBy: req.user!.id })
      return res.status(201).json({ template })
    } catch (err) {
      if (err instanceof Error && err.name === 'ValidationError')
        return res.status(400).json({ error: 'Modèle invalide' })
      return next(err)
    }
  },
)

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  param('id').isMongoId(),
  validators,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Modèle invalide' })
      const template = await QuoteTemplate.findOne({ _id: req.params.id, isActive: true })
      if (!template) return res.status(404).json({ error: 'Modèle non trouvé' })
      for (const field of fields) if (req.body[field] !== undefined) template.set(field, req.body[field])
      await template.save()
      return res.json({ template })
    } catch (err) {
      if (err instanceof Error && err.name === 'ValidationError')
        return res.status(400).json({ error: 'Modèle invalide' })
      return next(err)
    }
  },
)

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Identifiant invalide' })
      const template = await QuoteTemplate.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })
      if (!template) return res.status(404).json({ error: 'Modèle non trouvé' })
      return res.json({ template })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
