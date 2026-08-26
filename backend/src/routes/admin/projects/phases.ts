import express, { Request, Response } from 'express'
import mongoose from 'mongoose'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import Project from '../../../models/Project.js'
import ProjectItem from '../../../models/ProjectItem.js'
import ProjectPhase from '../../../models/ProjectPhase.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { logActivity } from '../../../lib/activityLog.js'
import { isPhaseValidated } from '../../../lib/projectPhases.js'
import logger from '../../../lib/logger.js'
import type { IProjectPhase } from '../../../types/models/index.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const ADMIN_ITEM_SELECT = 'title type status isVisible'
const IMMUTABLE_FIELDS = ['title', 'description', 'dueAt', 'requiresClientValidation', 'linkedItems'] as const

function populatePhase(phase: IProjectPhase) {
  return phase.populate([
    { path: 'linkedItems', select: ADMIN_ITEM_SELECT },
    { path: 'validation.validatedBy', select: 'name email' },
    { path: 'revisionRequests.requestedBy', select: 'name email' },
  ])
}

/** Charge le projet puis l'étape ; répond 404 et retourne null si l'un manque. */
async function loadPhase(req: Request, res: Response): Promise<IProjectPhase | null> {
  const { projectId, phaseId } = req.params
  const project = await Project.findById(projectId)
  if (!project) {
    res.status(404).json({ error: 'Projet non trouvé' })
    return null
  }
  const phase = await ProjectPhase.findOne({ _id: phaseId, project: projectId })
  if (!phase) {
    res.status(404).json({ error: 'Étape non trouvée' })
    return null
  }
  return phase
}

/** Vérifie que chaque livrable lié appartient bien au projet. */
async function normalizeLinkedItems(projectId: string, linkedItems: unknown): Promise<string[] | null> {
  if (!Array.isArray(linkedItems)) return []
  const ids = linkedItems.map(String)
  if (ids.some((id) => !mongoose.isValidObjectId(id))) return null
  const owned = await ProjectItem.countDocuments({ _id: { $in: ids }, project: projectId })
  if (owned !== new Set(ids).size) return null
  return ids
}

// GET /api/admin/projects/:projectId/phases - Lister les étapes d'un projet
router.get('/:projectId/phases', requirePermission(PERMISSIONS.VIEW_PHASES), async (req: Request, res: Response) => {
  try {
    const project = await Project.findById(req.params.projectId)
    if (!project) return res.status(404).json({ error: 'Projet non trouvé' })

    const phases = await ProjectPhase.find({ project: req.params.projectId })
      .sort({ order: 1 })
      .populate('linkedItems', ADMIN_ITEM_SELECT)
      .populate('validation.validatedBy', 'name email')
      .populate('revisionRequests.requestedBy', 'name email')

    res.json({ phases })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/admin/projects/:projectId/phases - Créer une étape
router.post('/:projectId/phases', requirePermission(PERMISSIONS.MANAGE_PHASES), async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId)
    const { title, description, dueAt, requiresClientValidation, linkedItems, order } = req.body || {}

    const project = await Project.findById(projectId)
    if (!project) return res.status(404).json({ error: 'Projet non trouvé' })
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Le titre de l’étape est requis' })
    }

    const normalizedItems = await normalizeLinkedItems(projectId, linkedItems)
    if (normalizedItems === null) {
      return res.status(422).json({ error: 'Livrables liés invalides', code: 'INVALID_LINKED_ITEMS' })
    }

    // Ordre automatique si non fourni (pattern sections.ts)
    let phaseOrder = order
    if (phaseOrder === undefined) {
      const last = await ProjectPhase.findOne({ project: projectId }).sort({ order: -1 })
      phaseOrder = last ? last.order + 1 : 0
    }

    const phase = await ProjectPhase.create({
      project: projectId,
      title: title.trim(),
      description: description || '',
      order: phaseOrder,
      dueAt: dueAt ? new Date(dueAt) : null,
      requiresClientValidation: Boolean(requiresClientValidation),
      linkedItems: normalizedItems,
      createdBy: req.user!.id,
    })

    await logActivity({
      project: projectId,
      action: 'PHASE_CREATED',
      actor: req.user!.id,
      summary: `Étape « ${phase.title} » créée`,
      metadata: { phaseId: String(phase._id) },
    })

    await populatePhase(phase)
    res.status(201).json({ phase })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PATCH /api/admin/projects/:projectId/phases/reorder - Réordonner le pipeline
// ⚠️ Doit précéder PATCH /:projectId/phases/:phaseId, sinon Express capture "reorder" comme phaseId.
router.patch(
  '/:projectId/phases/reorder',
  requirePermission(PERMISSIONS.MANAGE_PHASES),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId)
      const { phaseIds } = req.body || {}

      const project = await Project.findById(projectId)
      if (!project) return res.status(404).json({ error: 'Projet non trouvé' })

      const existing = await ProjectPhase.find({ project: projectId }).select('_id')
      const existingIds = existing.map((phase) => String(phase._id))
      const submitted = Array.isArray(phaseIds) ? phaseIds.map(String) : []

      const sameCardinality = submitted.length === existingIds.length && new Set(submitted).size === submitted.length
      const sameSet = sameCardinality && submitted.every((id) => existingIds.includes(id))
      if (!sameSet) {
        return res
          .status(422)
          .json({ error: 'La liste doit contenir exactement les étapes du projet', code: 'INVALID_PHASE_LIST' })
      }

      await Promise.all(
        submitted.map((id, index) =>
          ProjectPhase.updateOne({ _id: id, project: projectId }, { $set: { order: index } }),
        ),
      )

      const phases = await ProjectPhase.find({ project: projectId })
        .sort({ order: 1 })
        .populate('linkedItems', ADMIN_ITEM_SELECT)
        .populate('validation.validatedBy', 'name email')
        .populate('revisionRequests.requestedBy', 'name email')

      await logActivity({
        project: projectId,
        action: 'PHASE_UPDATED',
        actor: req.user!.id,
        summary: 'Étapes du projet réordonnées',
        metadata: { phaseIds: submitted },
      })

      res.json({ phases })
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: 'Erreur serveur' })
    }
  },
)

// PATCH /api/admin/projects/:projectId/phases/:phaseId - Modifier une étape
router.patch(
  '/:projectId/phases/:phaseId',
  requirePermission(PERMISSIONS.MANAGE_PHASES),
  async (req: Request, res: Response) => {
    try {
      const phase = await loadPhase(req, res)
      if (!phase) return

      const { title, description, dueAt, requiresClientValidation, linkedItems, order } = req.body || {}

      // Une étape validée atteste un accord daté : seul son ordre d'affichage reste mobile.
      if (isPhaseValidated(phase) && IMMUTABLE_FIELDS.some((field) => req.body?.[field] !== undefined)) {
        return res.status(409).json({
          error: 'Une étape validée par le client ne peut plus être modifiée',
          code: 'VALIDATED_PHASE_IMMUTABLE',
        })
      }

      if (linkedItems !== undefined) {
        const normalizedItems = await normalizeLinkedItems(String(req.params.projectId), linkedItems)
        if (normalizedItems === null) {
          return res.status(422).json({ error: 'Livrables liés invalides', code: 'INVALID_LINKED_ITEMS' })
        }
        phase.linkedItems = normalizedItems as unknown as typeof phase.linkedItems
      }
      if (title !== undefined) phase.title = String(title)
      if (description !== undefined) phase.description = String(description)
      if (dueAt !== undefined) phase.dueAt = dueAt ? new Date(dueAt) : null
      if (requiresClientValidation !== undefined) phase.requiresClientValidation = Boolean(requiresClientValidation)
      if (order !== undefined) phase.order = Number(order)
      // `status` et `validation` ne sont jamais modifiables par cette route.

      await phase.save()

      await logActivity({
        project: String(req.params.projectId),
        action: 'PHASE_UPDATED',
        actor: req.user!.id,
        summary: `Étape « ${phase.title} » modifiée`,
        metadata: { phaseId: String(phase._id) },
      })

      await populatePhase(phase)
      res.json({ phase })
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: 'Erreur serveur' })
    }
  },
)

// DELETE /api/admin/projects/:projectId/phases/:phaseId - Supprimer une étape
router.delete(
  '/:projectId/phases/:phaseId',
  requirePermission(PERMISSIONS.MANAGE_PHASES),
  async (req: Request, res: Response) => {
    try {
      const phase = await loadPhase(req, res)
      if (!phase) return

      if (isPhaseValidated(phase)) {
        return res.status(409).json({
          error: 'Une étape validée par le client ne peut pas être supprimée',
          code: 'VALIDATED_PHASE_IMMUTABLE',
        })
      }

      const title = phase.title
      await phase.deleteOne()

      await logActivity({
        project: String(req.params.projectId),
        action: 'PHASE_DELETED',
        actor: req.user!.id,
        summary: `Étape « ${title} » supprimée`,
        metadata: { phaseId: String(req.params.phaseId) },
      })

      res.json({ message: 'Étape supprimée' })
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: 'Erreur serveur' })
    }
  },
)

export { loadPhase, populatePhase }
export default router
