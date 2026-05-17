import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { body, param, validationResult } from 'express-validator'
import Project from '../../models/Project.js'
import ProjectSection from '../../models/ProjectSection.js'
import ProjectItem from '../../models/ProjectItem.js'
import ProjectUpdate from '../../models/ProjectUpdate.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour les Projets et leurs sous-ressources : sections, items
 * (sans fichier — l'upload de fichier passe par /documents au lot 5),
 * updates (timeline d'avancement).
 *
 * Scopes :
 *   - GET → read:projects
 *   - POST / PATCH / DELETE → write:projects
 *
 * Soft delete : PATCH /:id { isArchived: true } archive sans supprimer.
 * Hard delete : DELETE /:id supprime le projet ET ses sections/items/updates.
 */

const router = express.Router()

const PROJECT_STATUSES = ['EN_COURS', 'EN_ATTENTE', 'TERMINE'] as const
const PRIORITIES = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'] as const
const ITEM_TYPES = [
  'LIVRABLE',
  'DEVIS',
  'FACTURE',
  'CONTRAT',
  'CAHIER_DES_CHARGES',
  'MAQUETTE',
  'DOCUMENTATION',
  'LIEN',
  'NOTE',
  'AUTRE',
] as const
const ITEM_STATUSES = ['EN_ATTENTE', 'EN_COURS', 'TERMINE', 'VALIDE'] as const

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function isValidObjectId(id: unknown): boolean {
  return typeof id === 'string' && mongoose.isValidObjectId(id)
}

function emitValidationError(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, {
      errors: errors.array(),
    })
    return true
  }
  return false
}

async function getDefaultAdminId(res: Response): Promise<string | null> {
  const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
  if (!admin) {
    respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN trouvé pour attribuer la ressource')
    return null
  }
  return String(admin._id)
}

function parseSort(
  raw: unknown,
  fallback: Record<string, 1 | -1>,
  whitelist: string[]
): Record<string, 1 | -1> {
  if (typeof raw !== 'string' || !raw) return fallback
  const desc = raw.startsWith('-')
  const field = desc ? raw.slice(1) : raw
  if (!whitelist.includes(field)) return fallback
  return { [field]: desc ? -1 : 1 } as Record<string, 1 | -1>
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/projects', requireScope('read:projects'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}

    if (req.query.archived === 'true') {
      filter.isArchived = true
    } else if (req.query.archived === 'false' || req.query.archived === undefined) {
      filter.$or = [{ isArchived: false }, { isArchived: { $exists: false } }]
    }
    if (typeof req.query.status === 'string' && (PROJECT_STATUSES as readonly string[]).includes(req.query.status)) {
      filter.status = req.query.status
    }
    if (typeof req.query.client === 'string' && isValidObjectId(req.query.client)) {
      filter.client = req.query.client
    }
    if (typeof req.query.assignedTo === 'string' && isValidObjectId(req.query.assignedTo)) {
      filter.assignedTo = req.query.assignedTo
    }
    if (typeof req.query.priority === 'string' && (PRIORITIES as readonly string[]).includes(req.query.priority)) {
      filter.priority = req.query.priority
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ name: regex }, { description: regex }, { projectNumber: regex }]
    }

    const sort = parseSort(req.query.sort, { updatedAt: -1 }, [
      'createdAt',
      'updatedAt',
      'name',
      'status',
      'priority',
      'endDate',
    ])

    const [items, total] = await Promise.all([
      Project.find(filter)
        .populate('client', 'name email companyName')
        .populate('assignedTo', 'name email')
        .sort(sort)
        .skip(pag.skip)
        .limit(pag.limit)
        .lean(),
      Project.countDocuments(filter),
    ])

    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get(
  '/projects/:id',
  requireScope('read:projects'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const project = await Project.findById(req.params.id)
        .populate('client', 'name email companyName')
        .populate('assignedTo', 'name email')
        .lean()
      if (!project) return respondError(res, 404, 'NOT_FOUND', 'Projet introuvable')
      res.json(project)
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/projects',
  requireScope('write:projects'),
  body('name').isString().trim().isLength({ min: 1 }).withMessage('Le nom est requis'),
  body('client').custom((v) => isValidObjectId(v)).withMessage('client (ObjectId du User) requis'),
  body('status').optional().isIn(PROJECT_STATUSES as unknown as string[]),
  body('priority').optional().isIn(PRIORITIES as unknown as string[]),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const clientUser = await User.findOne({ _id: req.body.client, role: 'CLIENT' }).select('_id').lean()
      if (!clientUser) return respondError(res, 422, 'INVALID_CLIENT', `Aucun User CLIENT avec _id=${req.body.client}`)

      const payload = normalizeProjectPayload(req.body)
      const project = await Project.create({
        ...payload,
        name: String(req.body.name).trim(),
        client: req.body.client,
      })
      res.locals.audit = {
        entityType: 'Project',
        entityId: String(project._id),
        entityRef: project.name,
        summary: `Création du projet "${project.name}"`,
        after: project.toObject(),
      }
      res.status(201).json(project.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/projects/:id',
  requireScope('write:projects'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const project = await Project.findById(req.params.id)
      if (!project) return respondError(res, 404, 'NOT_FOUND', 'Projet introuvable')
      const before = project.toObject()
      const payload = normalizeProjectPayload(req.body || {})
      Object.assign(project, payload)
      if (typeof req.body.isArchived === 'boolean') {
        ;(project as unknown as { isArchived: boolean }).isArchived = req.body.isArchived
      }
      await project.save()
      res.locals.audit = {
        entityType: 'Project',
        entityId: String(project._id),
        entityRef: project.name,
        summary: `Modification du projet "${project.name}"`,
        before,
        after: project.toObject(),
      }
      res.json(project.toObject())
    } catch (err) {
      next(err)
    }
  }
)

/**
 * DELETE /projects/:id — supprime le projet ET toutes ses sections/items/updates.
 * Pas de retour en arrière ; préférer PATCH { isArchived: true } pour soft-delete.
 */
router.delete(
  '/projects/:id',
  requireScope('write:projects'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const project = await Project.findById(req.params.id)
      if (!project) return respondError(res, 404, 'NOT_FOUND', 'Projet introuvable')
      const before = project.toObject()
      await Promise.all([
        ProjectItem.deleteMany({ project: project._id }),
        ProjectSection.deleteMany({ project: project._id }),
        ProjectUpdate.deleteMany({ project: project._id }),
        Project.deleteOne({ _id: project._id }),
      ])
      res.locals.audit = {
        entityType: 'Project',
        entityId: String(project._id),
        entityRef: project.name,
        summary: `Suppression définitive du projet "${project.name}"`,
        before,
      }
      res.json({ ok: true, deletedId: String(project._id) })
    } catch (err) {
      next(err)
    }
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// SECTIONS
// ═══════════════════════════════════════════════════════════════════════════

router.get(
  '/projects/:id/sections',
  requireScope('read:projects'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const items = await ProjectSection.find({ project: req.params.id })
        .sort({ order: 1, createdAt: 1 })
        .lean()
      res.json({ items })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/projects/:id/sections',
  requireScope('write:projects'),
  param('id').isMongoId(),
  body('title').isString().trim().isLength({ min: 1 }),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const project = await Project.exists({ _id: req.params.id })
      if (!project) return respondError(res, 404, 'NOT_FOUND', 'Projet introuvable')
      const createdBy = await getDefaultAdminId(res)
      if (!createdBy) return
      const section = await ProjectSection.create({
        project: req.params.id,
        title: String(req.body.title).trim(),
        description: typeof req.body.description === 'string' ? req.body.description : '',
        order: typeof req.body.order === 'number' ? req.body.order : 0,
        isVisible: req.body.isVisible !== false,
        createdBy,
      })
      res.locals.audit = {
        entityType: 'ProjectSection',
        entityId: String(section._id),
        entityRef: section.title,
        summary: `Création de la section "${section.title}"`,
        after: section.toObject(),
      }
      res.status(201).json(section.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/projects/:id/sections/:sectionId',
  requireScope('write:projects'),
  param('id').isMongoId(),
  param('sectionId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const section = await ProjectSection.findOne({
        _id: req.params.sectionId,
        project: req.params.id,
      })
      if (!section) return respondError(res, 404, 'NOT_FOUND', 'Section introuvable')
      const before = section.toObject()
      const fields = ['title', 'description']
      for (const f of fields) {
        if (typeof req.body[f] === 'string') {
          ;(section as unknown as Record<string, string>)[f] = req.body[f]
        }
      }
      if (typeof req.body.order === 'number') section.order = req.body.order
      if (typeof req.body.isVisible === 'boolean') section.isVisible = req.body.isVisible
      await section.save()
      res.locals.audit = {
        entityType: 'ProjectSection',
        entityId: String(section._id),
        before,
        after: section.toObject(),
      }
      res.json(section.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/projects/:id/sections/:sectionId',
  requireScope('write:projects'),
  param('id').isMongoId(),
  param('sectionId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const section = await ProjectSection.findOne({
        _id: req.params.sectionId,
        project: req.params.id,
      })
      if (!section) return respondError(res, 404, 'NOT_FOUND', 'Section introuvable')
      const before = section.toObject()
      // Détache les items de la section (les laisse exister sans section)
      await ProjectItem.updateMany({ section: section._id }, { $set: { section: null } })
      await ProjectSection.deleteOne({ _id: section._id })
      res.locals.audit = {
        entityType: 'ProjectSection',
        entityId: String(section._id),
        entityRef: section.title,
        before,
      }
      res.json({ ok: true, deletedId: String(section._id) })
    } catch (err) {
      next(err)
    }
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// ITEMS  (sans upload binaire — l'upload de fichier passera par /documents)
// ═══════════════════════════════════════════════════════════════════════════

router.get(
  '/projects/:id/items',
  requireScope('read:projects'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const filter: Record<string, unknown> = { project: req.params.id }
      if (typeof req.query.section === 'string') {
        if (req.query.section === 'null') {
          filter.section = null
        } else if (isValidObjectId(req.query.section)) {
          filter.section = req.query.section
        }
      }
      if (typeof req.query.type === 'string' && (ITEM_TYPES as readonly string[]).includes(req.query.type)) {
        filter.type = req.query.type
      }
      const items = await ProjectItem.find(filter)
        .sort({ section: 1, order: 1, createdAt: 1 })
        .lean()
      res.json({ items })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/projects/:id/items',
  requireScope('write:projects'),
  param('id').isMongoId(),
  body('title').isString().trim().isLength({ min: 1 }).withMessage('title requis'),
  body('type').isIn(ITEM_TYPES as unknown as string[]).withMessage(`type requis (${ITEM_TYPES.join(', ')})`),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const project = await Project.exists({ _id: req.params.id })
      if (!project) return respondError(res, 404, 'NOT_FOUND', 'Projet introuvable')
      // Si type LIVRABLE/FACTURE/etc. avec file → on refuse en V1 (lot 5)
      if (req.body.file) {
        return respondError(
          res,
          400,
          'FILE_UPLOAD_NOT_SUPPORTED',
          "L'upload de fichier via cet endpoint n'est pas supporté. Utiliser /documents (à venir au lot 5)."
        )
      }
      // Section optionnelle, mais doit appartenir au projet si fournie
      if (req.body.section && isValidObjectId(req.body.section)) {
        const sectionOk = await ProjectSection.exists({
          _id: req.body.section,
          project: req.params.id,
        })
        if (!sectionOk) return respondError(res, 422, 'INVALID_SECTION', 'Section non liée à ce projet')
      } else if (req.body.section) {
        return respondError(res, 400, 'VALIDATION_ERROR', 'section doit être un ObjectId valide ou null')
      }
      const createdBy = await getDefaultAdminId(res)
      if (!createdBy) return
      const item = await ProjectItem.create({
        project: req.params.id,
        section: req.body.section || null,
        type: req.body.type,
        title: String(req.body.title).trim(),
        description: typeof req.body.description === 'string' ? req.body.description : '',
        url: typeof req.body.url === 'string' ? req.body.url : undefined,
        content: typeof req.body.content === 'string' ? req.body.content : undefined,
        order: typeof req.body.order === 'number' ? req.body.order : 0,
        isVisible: req.body.isVisible !== false,
        isDownloadable: req.body.isDownloadable !== false,
        status:
          typeof req.body.status === 'string' && (ITEM_STATUSES as readonly string[]).includes(req.body.status)
            ? req.body.status
            : 'EN_ATTENTE',
        createdBy,
      })
      res.locals.audit = {
        entityType: 'ProjectItem',
        entityId: String(item._id),
        entityRef: item.title,
        summary: `Création de l'item ${item.type} "${item.title}"`,
        after: item.toObject(),
      }
      res.status(201).json(item.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/projects/:id/items/:itemId',
  requireScope('write:projects'),
  param('id').isMongoId(),
  param('itemId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const item = await ProjectItem.findOne({
        _id: req.params.itemId,
        project: req.params.id,
      })
      if (!item) return respondError(res, 404, 'NOT_FOUND', 'Item introuvable')
      if (req.body.file) {
        return respondError(
          res,
          400,
          'FILE_UPLOAD_NOT_SUPPORTED',
          "L'upload de fichier via cet endpoint n'est pas supporté. Utiliser /documents."
        )
      }
      const before = item.toObject()
      const stringFields = ['title', 'description', 'url', 'content']
      for (const f of stringFields) {
        if (typeof req.body[f] === 'string') {
          ;(item as unknown as Record<string, string>)[f] = req.body[f]
        }
      }
      if (typeof req.body.order === 'number') item.order = req.body.order
      if (typeof req.body.isVisible === 'boolean') item.isVisible = req.body.isVisible
      if (typeof req.body.isDownloadable === 'boolean') item.isDownloadable = req.body.isDownloadable
      if (typeof req.body.status === 'string' && (ITEM_STATUSES as readonly string[]).includes(req.body.status)) {
        item.status = req.body.status as typeof item.status
      }
      if (req.body.section !== undefined) {
        if (req.body.section === null) {
          item.section = null as unknown as typeof item.section
        } else if (isValidObjectId(req.body.section)) {
          const sectionOk = await ProjectSection.exists({
            _id: req.body.section,
            project: req.params.id,
          })
          if (!sectionOk) return respondError(res, 422, 'INVALID_SECTION', 'Section non liée à ce projet')
          item.section = req.body.section
        } else {
          return respondError(res, 400, 'VALIDATION_ERROR', 'section doit être un ObjectId valide ou null')
        }
      }
      await item.save()
      res.locals.audit = {
        entityType: 'ProjectItem',
        entityId: String(item._id),
        before,
        after: item.toObject(),
      }
      res.json(item.toObject())
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/projects/:id/items/:itemId',
  requireScope('write:projects'),
  param('id').isMongoId(),
  param('itemId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const item = await ProjectItem.findOne({
        _id: req.params.itemId,
        project: req.params.id,
      })
      if (!item) return respondError(res, 404, 'NOT_FOUND', 'Item introuvable')
      const before = item.toObject()
      await ProjectItem.deleteOne({ _id: item._id })
      res.locals.audit = {
        entityType: 'ProjectItem',
        entityId: String(item._id),
        entityRef: item.title,
        before,
      }
      res.json({ ok: true, deletedId: String(item._id) })
    } catch (err) {
      next(err)
    }
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// UPDATES (timeline d'avancement — pas d'édition après création)
// ═══════════════════════════════════════════════════════════════════════════

router.get(
  '/projects/:id/updates',
  requireScope('read:projects'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const pag = parsePagination(req)
      const filter = { project: req.params.id }
      const [items, total] = await Promise.all([
        ProjectUpdate.find(filter)
          .sort({ createdAt: -1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .populate('createdBy', 'name email')
          .lean(),
        ProjectUpdate.countDocuments(filter),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/projects/:id/updates',
  requireScope('write:projects'),
  param('id').isMongoId(),
  body('title').isString().trim().isLength({ min: 1 }).withMessage('title requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const project = await Project.exists({ _id: req.params.id })
      if (!project) return respondError(res, 404, 'NOT_FOUND', 'Projet introuvable')
      const createdBy = await getDefaultAdminId(res)
      if (!createdBy) return
      const update = await ProjectUpdate.create({
        project: req.params.id,
        title: String(req.body.title).trim(),
        description: typeof req.body.description === 'string' ? req.body.description : '',
        createdBy,
      })
      res.locals.audit = {
        entityType: 'ProjectUpdate',
        entityId: String(update._id),
        entityRef: update.title,
        summary: `Update projet : "${update.title}"`,
        after: update.toObject(),
      }
      res.status(201).json(update.toObject())
    } catch (err) {
      next(err)
    }
  }
)

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function normalizeProjectPayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (typeof body.description === 'string') out.description = body.description
  if (typeof body.status === 'string' && (PROJECT_STATUSES as readonly string[]).includes(body.status)) {
    out.status = body.status
  }
  if (Array.isArray(body.serviceTypes)) out.serviceTypes = body.serviceTypes
  if (Array.isArray(body.deliverableTypes)) out.deliverableTypes = body.deliverableTypes
  if (Array.isArray(body.tags)) out.tags = body.tags
  if (typeof body.priority === 'string' && (PRIORITIES as readonly string[]).includes(body.priority)) {
    out.priority = body.priority
  }
  if (typeof body.responsible === 'string') out.responsible = body.responsible
  if (typeof body.assignedTo === 'string' && isValidObjectId(body.assignedTo)) {
    out.assignedTo = body.assignedTo
  } else if (body.assignedTo === null) {
    out.assignedTo = null
  }
  if (typeof body.projectNumber === 'string') out.projectNumber = body.projectNumber
  if (typeof body.internalNotes === 'string') out.internalNotes = body.internalNotes
  if (typeof body.summary === 'string') out.summary = body.summary
  if (body.startDate !== undefined) out.startDate = body.startDate ? new Date(body.startDate as string) : null
  if (body.endDate !== undefined) out.endDate = body.endDate ? new Date(body.endDate as string) : null
  if (body.deliveredAt !== undefined) out.deliveredAt = body.deliveredAt ? new Date(body.deliveredAt as string) : null
  if (body.reminderAt !== undefined) out.reminderAt = body.reminderAt ? new Date(body.reminderAt as string) : null
  if (typeof body.name === 'string') out.name = String(body.name).trim()
  return out
}

export default router
