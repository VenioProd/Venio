import express, { Request, Response } from 'express'
import mongoose from 'mongoose'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import Project from '../../../models/Project.js'
import ProjectItem from '../../../models/ProjectItem.js'
import ProjectPhase from '../../../models/ProjectPhase.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { logActivity } from '../../../lib/activityLog.js'
import { createNotification } from '../../../lib/notifications.js'
import {
  findBlockingPhase,
  isPhaseValidated,
  PHASE_STATUS_LABELS,
  resolveAdminTransition,
  type PhaseAdminAction,
} from '../../../lib/projectPhases.js'
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

/**
 * Étapes déjà démarrées qui se retrouveraient derrière un jalon client non
 * validé sous un ordre donné, indexées par id d'étape fautive.
 */
function lockViolations(phases: IProjectPhase[], orderOf: (id: string) => number): Map<string, IProjectPhase> {
  const violations = new Map<string, IProjectPhase>()
  for (const phase of phases) {
    if (phase.status === 'A_VENIR') continue
    const blockers = phases
      .filter(
        (candidate) =>
          candidate.requiresClientValidation &&
          !isPhaseValidated(candidate) &&
          orderOf(String(candidate._id)) < orderOf(String(phase._id)),
      )
      .sort((a, b) => orderOf(String(a._id)) - orderOf(String(b._id)))
    if (blockers.length > 0) violations.set(String(phase._id), blockers[0])
  }
  return violations
}

/** Jalon bloquant qu'un réordonnancement introduirait, s'il en introduit un. */
function findNewLockViolation(phases: IProjectPhase[], orderedIds: string[]): IProjectPhase | null {
  const currentOrder = new Map(phases.map((phase) => [String(phase._id), phase.order]))
  const nextOrder = new Map(orderedIds.map((id, index) => [id, index]))
  const before = lockViolations(phases, (id) => currentOrder.get(id) ?? 0)
  const after = lockViolations(phases, (id) => nextOrder.get(id) ?? 0)

  for (const [phaseId, blocker] of after) {
    if (!before.has(phaseId)) return blocker
  }
  return null
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

      const existing = await ProjectPhase.find({ project: projectId })
      const existingIds = existing.map((phase) => String(phase._id))
      const submitted = Array.isArray(phaseIds) ? phaseIds.map(String) : []

      const sameCardinality = submitted.length === existingIds.length && new Set(submitted).size === submitted.length
      const sameSet = sameCardinality && submitted.every((id) => existingIds.includes(id))
      if (!sameSet) {
        return res
          .status(422)
          .json({ error: 'La liste doit contenir exactement les étapes du projet', code: 'INVALID_PHASE_LIST' })
      }

      // Le verrou se calcule sur l'ordre courant : sans ce contrôle, un
      // aller-retour de réordonnancement suffirait à démarrer une étape puis à
      // la replacer derrière un jalon non validé. On refuse donc les
      // réorganisations qui CRÉENT une incohérence, sans bloquer celles d'un
      // pipeline déjà incohérent.
      const newViolation = findNewLockViolation(existing, submitted)
      if (newViolation) {
        return res.status(409).json({
          error: `L’étape « ${newViolation.title} » doit d’abord être validée par le client`,
          code: 'PHASE_LOCKED',
          blockingPhase: { _id: String(newViolation._id), title: newViolation.title },
        })
      }

      // Une seule commande plutôt que N updateOne concurrents : en cas
      // d'échec, le pipeline reste plus proche d'un état cohérent.
      await ProjectPhase.bulkWrite(
        submitted.map((id, index) => ({
          updateOne: { filter: { _id: id, project: projectId }, update: { $set: { order: index } } },
        })),
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

      const changedFields: string[] = []
      const updates: Record<string, unknown> = {}
      // La spec assume une échappatoire : désactiver la validation client pour
      // pouvoir clôturer un jalon. Elle n'est acceptable que si le journal
      // permet de démontrer le geste — d'où l'avant/après explicite.
      const previousRequiresValidation = phase.requiresClientValidation

      if (linkedItems !== undefined) {
        const normalizedItems = await normalizeLinkedItems(String(req.params.projectId), linkedItems)
        if (normalizedItems === null) {
          return res.status(422).json({ error: 'Livrables liés invalides', code: 'INVALID_LINKED_ITEMS' })
        }
        updates.linkedItems = normalizedItems
        changedFields.push('linkedItems')
      }
      if (title !== undefined) {
        updates.title = String(title)
        changedFields.push('title')
      }
      if (description !== undefined) {
        updates.description = String(description)
        changedFields.push('description')
      }
      if (dueAt !== undefined) {
        updates.dueAt = dueAt ? new Date(dueAt) : null
        changedFields.push('dueAt')
      }
      if (requiresClientValidation !== undefined) {
        updates.requiresClientValidation = Boolean(requiresClientValidation)
        changedFields.push('requiresClientValidation')
      }
      if (order !== undefined) {
        updates.order = Number(order)
        changedFields.push('order')
      }
      // `status` et `validation` ne sont jamais modifiables par cette route.

      if (changedFields.length === 0) {
        await populatePhase(phase)
        return res.json({ phase })
      }

      // Le réordonnancement d'affichage reste permis sur une étape validée ;
      // toute autre modification exige que l'étape ne soit pas validée AU
      // MOMENT DE L'ÉCRITURE, pas seulement au moment de la lecture.
      const touchesContent = changedFields.some((field) => (IMMUTABLE_FIELDS as readonly string[]).includes(field))
      const filter: Record<string, unknown> = { _id: phase._id, project: String(req.params.projectId) }
      if (touchesContent) filter['validation.validatedAt'] = null

      const updatedPhase = await ProjectPhase.findOneAndUpdate(filter, { $set: updates }, { new: true })
      if (!updatedPhase) {
        return res.status(409).json({
          error: 'Une étape validée par le client ne peut plus être modifiée',
          code: 'VALIDATED_PHASE_IMMUTABLE',
        })
      }

      const validationToggled =
        changedFields.includes('requiresClientValidation') &&
        updatedPhase.requiresClientValidation !== previousRequiresValidation
      const summary = validationToggled
        ? `Étape « ${updatedPhase.title} » : validation client ${updatedPhase.requiresClientValidation ? 'activée' : 'désactivée'}`
        : `Étape « ${updatedPhase.title} » modifiée`

      await logActivity({
        project: String(req.params.projectId),
        action: 'PHASE_UPDATED',
        actor: req.user!.id,
        summary,
        metadata: {
          phaseId: String(updatedPhase._id),
          changedFields,
          ...(validationToggled
            ? {
                requiresClientValidation: {
                  from: previousRequiresValidation,
                  to: updatedPhase.requiresClientValidation,
                },
              }
            : {}),
        },
      })

      await populatePhase(updatedPhase)
      res.json({ phase: updatedPhase })
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
      // Conditionnelle : une validation arrivée entre la lecture et ici ne doit
      // pas pouvoir être effacée par cette suppression.
      const result = await ProjectPhase.deleteOne({
        _id: phase._id,
        project: String(req.params.projectId),
        'validation.validatedAt': null,
      })
      if (result.deletedCount === 0) {
        return res.status(409).json({
          error: 'Une étape validée par le client ne peut pas être supprimée',
          code: 'VALIDATED_PHASE_IMMUTABLE',
        })
      }

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

/**
 * Fabrique les cinq routes de transition admin : elles partagent la même
 * mécanique (charger, arbitrer via la lib, écrire, journaliser) et ne diffèrent
 * que par l'action et ses effets de bord.
 */
function registerTransition(action: PhaseAdminAction) {
  router.post(
    `/:projectId/phases/:phaseId/${action}`,
    requirePermission(PERMISSIONS.MANAGE_PHASES),
    async (req: Request, res: Response) => {
      try {
        const projectId = String(req.params.projectId)
        const phase = await loadPhase(req, res)
        if (!phase) return

        const blockingPhase = action === 'start' ? await findBlockingPhase(projectId, phase.order) : null
        const outcome = resolveAdminTransition(phase, action, blockingPhase)
        if (!outcome.ok) {
          return res.status(outcome.refusal.status).json(outcome.refusal.body)
        }

        const previousStatus = phase.status
        // Écriture conditionnelle : la transition n'est appliquée que si le
        // statut n'a pas bougé depuis la lecture, et que le client n'a pas
        // validé l'étape entre-temps.
        const updated = await ProjectPhase.findOneAndUpdate(
          { _id: phase._id, project: projectId, status: previousStatus, 'validation.validatedAt': null },
          { $set: { status: outcome.nextStatus } },
          { new: true },
        )
        if (!updated) {
          return res.status(409).json({
            error: 'L’étape a changé entre-temps, rechargez la page',
            code: 'PHASE_CONFLICT',
          })
        }
        phase.status = updated.status

        if (action === 'request-validation') {
          const project = await Project.findById(projectId).select('name client')
          if (project?.client) {
            await createNotification({
              recipient: project.client,
              type: 'PHASE_VALIDATION_REQUESTED',
              title: `Validation attendue — ${project.name}`,
              message: `L’étape « ${phase.title} » attend votre validation.`,
              link: `/espace-client/projets/${projectId}?tab=progress`,
              metadata: { projectId, phaseId: String(phase._id) },
            }).catch(() => null)
          }
          await logActivity({
            project: projectId,
            action: 'PHASE_VALIDATION_REQUESTED',
            actor: req.user!.id,
            summary: `Validation client demandée pour l’étape « ${phase.title} »`,
            metadata: { phaseId: String(phase._id), from: previousStatus, to: phase.status },
          })
        } else {
          await logActivity({
            project: projectId,
            action: 'PHASE_STATUS_CHANGED',
            actor: req.user!.id,
            summary: `Étape « ${phase.title} » : ${PHASE_STATUS_LABELS[previousStatus]} → ${PHASE_STATUS_LABELS[phase.status]}`,
            metadata: { phaseId: String(phase._id), from: previousStatus, to: phase.status },
          })
        }

        await populatePhase(phase)
        res.json({ phase })
      } catch (err) {
        logger.error(err)
        res.status(500).json({ error: 'Erreur serveur' })
      }
    },
  )
}

for (const action of ['start', 'request-validation', 'complete', 'cancel-validation-request', 'revert'] as const) {
  registerTransition(action)
}

// POST /api/admin/projects/:projectId/phases/:phaseId/revisions/:revisionId/resolve
router.post(
  '/:projectId/phases/:phaseId/revisions/:revisionId/resolve',
  requirePermission(PERMISSIONS.MANAGE_PHASES),
  async (req: Request, res: Response) => {
    try {
      const phase = await loadPhase(req, res)
      if (!phase) return

      const revision = phase.revisionRequests.find((entry) => String(entry._id) === String(req.params.revisionId))
      if (!revision) return res.status(404).json({ error: 'Demande de retouches non trouvée' })
      if (revision.resolvedAt) {
        return res
          .status(409)
          .json({ error: 'Cette demande de retouches est déjà traitée', code: 'REVISION_ALREADY_RESOLVED' })
      }

      // Marquage atomique : deux admins qui traitent la même demande en même
      // temps ne peuvent pas obtenir deux 200 avec un resolvedBy arbitraire.
      const resolved = await ProjectPhase.findOneAndUpdate(
        {
          _id: phase._id,
          project: String(req.params.projectId),
          revisionRequests: { $elemMatch: { _id: revision._id, resolvedAt: null } },
        },
        {
          $set: {
            'revisionRequests.$[rev].resolvedAt': new Date(),
            'revisionRequests.$[rev].resolvedBy': req.user!.id,
          },
        },
        { new: true, arrayFilters: [{ 'rev._id': revision._id }] },
      )
      if (!resolved) {
        return res
          .status(409)
          .json({ error: 'Cette demande de retouches est déjà traitée', code: 'REVISION_ALREADY_RESOLVED' })
      }

      await logActivity({
        project: String(req.params.projectId),
        action: 'PHASE_REVISION_RESOLVED',
        actor: req.user!.id,
        summary: `Demande de retouches traitée sur l’étape « ${phase.title} »`,
        metadata: { phaseId: String(phase._id), revisionId: String(req.params.revisionId) },
      })

      await populatePhase(resolved)
      res.json({ phase: resolved })
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: 'Erreur serveur' })
    }
  },
)

export { loadPhase, populatePhase }
export default router
