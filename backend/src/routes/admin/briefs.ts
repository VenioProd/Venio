import express, { type Request, type Response } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import MissionBrief from '../../models/MissionBrief.js'
import User from '../../models/User.js'
import Project from '../../models/Project.js'
import { createNotification } from '../../lib/notifications.js'
import { sendBriefAssignedEmail } from '../../lib/email.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

// GET /api/admin/briefs?projectId=
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { projectId } = req.query
    const filter: Record<string, unknown> = {}
    if (projectId) filter.project = projectId

    // Non-SUPER_ADMIN : seulement les briefs qui lui sont destinés
    if (user.role !== 'SUPER_ADMIN') {
      filter.destinataire = user.id
    }

    const briefs = await MissionBrief.find(filter)
      .populate('destinataire', 'name email')
      .populate('validationPar', 'name email')
      .populate('createdBy', 'name email')
      .populate('project', 'name')
      .sort({ createdAt: -1 })

    res.json(briefs)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/briefs/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const brief = await MissionBrief.findById(req.params.id)
      .populate('destinataire', 'name email')
      .populate('validationPar', 'name email')
      .populate('createdBy', 'name email')
      .populate('project', 'name')

    if (!brief) return res.status(404).json({ error: 'Brief introuvable' })
    res.json(brief)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/admin/briefs — SUPER_ADMIN only
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Seuls les super admins peuvent creer des briefs' })

    const {
      project, destinataire, entity, briefPriority, deadline,
      intitule, contexte, livrablesAttendus, formatLivrable,
      ressources, pointsVigilance, pointIntermediaire,
      validationPar, datesCles, commentaires,
    } = req.body

    if (!project || !destinataire || !intitule || !deadline) {
      return res.status(400).json({ error: 'Projet, destinataire, intitule et deadline requis' })
    }

    const brief = await MissionBrief.create({
      project, destinataire, entity, briefPriority, deadline: new Date(deadline),
      intitule, contexte, livrablesAttendus,
      formatLivrable: Array.isArray(formatLivrable) ? formatLivrable : [],
      ressources, pointsVigilance,
      pointIntermediaire: pointIntermediaire ? new Date(pointIntermediaire) : null,
      validationPar: validationPar || null,
      datesCles: Array.isArray(datesCles) ? datesCles : [],
      commentaires: commentaires || '',
      createdBy: user.id,
    })

    // Notify destinataire (in-app + email)
    if (String(destinataire) !== String(user.id)) {
      createNotification({
        recipient: destinataire,
        type: 'TASK_ASSIGNED',
        title: `Nouveau brief : ${intitule}`,
        message: `${user.name} vous a attribue un brief de mission`,
        link: '/admin/gestion',
      }).catch(() => {})

      // Send email
      const destUser = await User.findById(destinataire)
      const proj = await Project.findById(project)
      if (destUser?.email) {
        sendBriefAssignedEmail({
          to: destUser.email,
          destinataireName: destUser.name || destUser.email,
          briefTitle: intitule,
          projectName: proj?.name || '',
          priority: briefPriority || 'P2',
          deadline: new Date(deadline).toLocaleDateString('fr-FR'),
          assignedBy: user.name || 'Un super admin',
        }).catch(() => {})
      }
    }

    await brief.populate('destinataire', 'name email')
    await brief.populate('createdBy', 'name email')
    await brief.populate('project', 'name')

    res.status(201).json(brief)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PATCH /api/admin/briefs/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const brief = await MissionBrief.findById(req.params.id)
    if (!brief) return res.status(404).json({ error: 'Brief introuvable' })

    // Only SUPER_ADMIN can edit all fields; assignee can only update statut
    const isAssignee = brief.destinataire.toString() === user.id
    if (user.role !== 'SUPER_ADMIN' && !isAssignee) {
      return res.status(403).json({ error: 'Acces refuse' })
    }

    if (user.role === 'SUPER_ADMIN') {
      const fields = [
        'project', 'destinataire', 'entity', 'briefPriority', 'deadline',
        'intitule', 'contexte', 'livrablesAttendus', 'formatLivrable',
        'ressources', 'pointsVigilance', 'pointIntermediaire',
        'validationPar', 'statut', 'datesCles', 'commentaires',
      ] as const
      for (const f of fields) {
        if (req.body[f] !== undefined) {
          ;(brief as any)[f] = req.body[f]
        }
      }
    } else {
      // Assignee can only update statut and commentaires
      if (req.body.statut !== undefined) brief.statut = req.body.statut
      if (req.body.commentaires !== undefined) brief.commentaires = req.body.commentaires
    }

    await brief.save()
    await brief.populate('destinataire', 'name email')
    await brief.populate('createdBy', 'name email')
    await brief.populate('project', 'name')

    res.json(brief)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// DELETE /api/admin/briefs/:id — SUPER_ADMIN only
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Seuls les super admins peuvent supprimer' })

    await MissionBrief.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
