import express, { Request, Response } from 'express'
import auth from '../../middleware/auth.js'
import ProjectPhase from '../../models/ProjectPhase.js'
import { getProjectAccess, type ProjectAccess } from '../../lib/projectAccess.js'
import { logActivity } from '../../lib/activityLog.js'
import { notifyUsers } from '../../lib/notifyHelpers.js'
import { phaseAdminRecipients } from '../../lib/projectPhases.js'
import logger from '../../lib/logger.js'
import type { IProjectPhase } from '../../types/models/index.js'

const router = express.Router()

router.use(auth)

// Les livrables liés servent à décider : le client a besoin du descriptif, pas du chemin disque.
const CLIENT_ITEM_SELECT = 'title type status isVisible isDownloadable description url content file'

/**
 * Réduit une étape à ce que le client a le droit de voir : identités internes
 * masquées, chemins de stockage retirés (pattern projectContent.ts).
 */
function sanitizePhase(phase: IProjectPhase): Record<string, unknown> {
  const raw = phase.toObject() as Record<string, any>
  delete raw.createdBy
  if (raw.validation) delete raw.validation.validatedBy
  raw.revisionRequests = (raw.revisionRequests || []).map((revision: Record<string, unknown>) => ({
    _id: revision._id,
    requestedByName: revision.requestedByName,
    comment: revision.comment,
    createdAt: revision.createdAt,
    resolvedAt: revision.resolvedAt,
  }))
  raw.linkedItems = (raw.linkedItems || []).map((item: Record<string, any>) => {
    if (item?.file?.storagePath) item.file.storagePath = undefined
    return item
  })
  return raw
}

/**
 * Charge l'étape SANS populate pour toute mutation : un populate avec `match`
 * retire du tableau les livrables non visibles, et un save() dans cet état les
 * effacerait définitivement de linkedItems.
 */
function findPhaseForUpdate(projectId: string, phaseId: string) {
  return ProjectPhase.findOne({ _id: phaseId, project: projectId })
}

/** Recharge l'étape avec ses livrables visibles, pour la réponse. */
function findPhasePopulated(projectId: string, phaseId: string) {
  return ProjectPhase.findOne({ _id: phaseId, project: projectId }).populate({
    path: 'linkedItems',
    match: { isVisible: true },
    select: CLIENT_ITEM_SELECT,
  })
}

/** Garde-fou commun : compte CLIENT + accès au projet, sinon 403/404. */
async function loadAccess(req: Request, res: Response): Promise<ProjectAccess | null> {
  if (req.user!.role !== 'CLIENT') {
    res.status(403).json({ error: 'Forbidden' })
    return null
  }
  const access = await getProjectAccess(String(req.params.projectId), req.user!.id)
  if (!access) {
    res.status(404).json({ error: 'Projet non trouvé' })
    return null
  }
  return access
}

// GET /api/projects/:projectId/phases - Timeline des étapes visible par le client
router.get('/:projectId/phases', async (req: Request, res: Response) => {
  try {
    const access = await loadAccess(req, res)
    if (!access) return

    const phases = await ProjectPhase.find({ project: String(req.params.projectId) })
      .sort({ order: 1 })
      .populate({ path: 'linkedItems', match: { isVisible: true }, select: CLIENT_ITEM_SELECT })

    res.json({ phases: phases.map(sanitizePhase) })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/projects/:projectId/phases/:phaseId/validate - Valider un jalon
router.post('/:projectId/phases/:phaseId/validate', async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId)
    const phaseId = String(req.params.phaseId)
    const access = await loadAccess(req, res)
    if (!access) return
    // Valider engage le client : réservé au propriétaire (pattern quotes.ts).
    if (access.role !== 'OWNER') {
      return res
        .status(403)
        .json({ error: 'Seul le propriétaire du projet peut valider une étape', code: 'OWNER_REQUIRED' })
    }

    const phase = await findPhaseForUpdate(projectId, phaseId)
    if (!phase) return res.status(404).json({ error: 'Étape non trouvée' })
    if (phase.status !== 'EN_ATTENTE_VALIDATION') {
      return res.status(409).json({ error: 'Cette étape n’attend pas de validation', code: 'INVALID_TRANSITION' })
    }

    phase.validation = {
      validatedBy: req.user!.id,
      validatedByName: req.user!.name || '',
      validatedAt: new Date(),
      comment: typeof req.body?.comment === 'string' ? req.body.comment.trim() : '',
    } as unknown as typeof phase.validation
    phase.status = 'TERMINEE'
    await phase.save()

    const project = access.project
    await notifyUsers(await phaseAdminRecipients(project), {
      type: 'PHASE_VALIDATED',
      title: `Étape validée — ${project.name}`,
      message: `${req.user!.name} a validé l’étape « ${phase.title} ».`,
      link: `/admin/projets/${projectId}?tab=phases`,
      metadata: { projectId, phaseId: String(phase._id) },
    }).catch(() => null)

    await logActivity({
      project: projectId,
      action: 'PHASE_VALIDATED',
      actor: req.user!.id,
      summary: `Étape « ${phase.title} » validée par ${req.user!.name}`,
      metadata: { phaseId: String(phase._id), from: 'EN_ATTENTE_VALIDATION', to: 'TERMINEE' },
    })

    const updated = await findPhasePopulated(projectId, phaseId)
    res.json({ phase: sanitizePhase(updated!) })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/projects/:projectId/phases/:phaseId/revisions - Demander des retouches
router.post('/:projectId/phases/:phaseId/revisions', async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId)
    const phaseId = String(req.params.phaseId)
    const access = await loadAccess(req, res)
    if (!access) return
    if (access.role === 'VIEWER') {
      return res.status(403).json({ error: 'Accès en lecture seule' })
    }

    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : ''
    if (!comment) {
      return res
        .status(422)
        .json({ error: 'Un commentaire est requis pour demander des retouches', code: 'COMMENT_REQUIRED' })
    }

    const phase = await findPhaseForUpdate(projectId, phaseId)
    if (!phase) return res.status(404).json({ error: 'Étape non trouvée' })
    if (phase.status !== 'EN_ATTENTE_VALIDATION') {
      return res.status(409).json({ error: 'Cette étape n’attend pas de validation', code: 'INVALID_TRANSITION' })
    }

    phase.revisionRequests.push({
      requestedBy: req.user!.id,
      requestedByName: req.user!.name || '',
      comment,
      createdAt: new Date(),
    } as never)
    phase.status = 'EN_COURS'
    await phase.save()

    const project = access.project
    await notifyUsers(await phaseAdminRecipients(project), {
      type: 'PHASE_REVISION_REQUESTED',
      title: `Retouches demandées — ${project.name}`,
      message: `${req.user!.name} a demandé des retouches sur l’étape « ${phase.title} ».`,
      link: `/admin/projets/${projectId}?tab=phases`,
      metadata: { projectId, phaseId: String(phase._id) },
    }).catch(() => null)

    await logActivity({
      project: projectId,
      action: 'PHASE_REVISION_REQUESTED',
      actor: req.user!.id,
      summary: `Retouches demandées sur l’étape « ${phase.title} » par ${req.user!.name}`,
      metadata: { phaseId: String(phase._id), from: 'EN_ATTENTE_VALIDATION', to: 'EN_COURS' },
    })

    const updated = await findPhasePopulated(projectId, phaseId)
    res.json({ phase: sanitizePhase(updated!) })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
