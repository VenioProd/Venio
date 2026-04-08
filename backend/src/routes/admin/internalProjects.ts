import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import InternalProject, { ENTITIES, POLES } from '../../models/InternalProject.js'
import Intern from '../../models/Intern.js'
import User from '../../models/User.js'
import InternalMission from '../../models/InternalMission.js'
import { sendInternalProjectAssignedEmail, sendInternalMissionAssignedEmail } from '../../lib/email/templates/project.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

// Resolve whether the current user can see a project (admin always yes, intern only if member by pole or direct)
async function canAccess(userId: string, userRole: string, project: any): Promise<boolean> {
  if (userRole !== 'CLIENT') {
    // Check if user is a stagiaire/alternant with restricted access
    const intern = await Intern.findOne({ userId, status: 'ACTIF' })
    if (!intern) return true // Regular admin
    // Intern: check if their role pole matches OR directly assigned
    const user = await User.findById(userId).select('tags')
    if (!user?.tags?.includes('STAGIAIRE')) return true // Regular admin
    // members may be populated objects or ObjectIds — extract the string id safely
    const memberIds = project.members.map((m: any) => (m._id ?? m).toString())
    if (memberIds.includes(userId)) return true
    // Check pole match
    if (intern.departement && project.poles.includes(intern.departement)) return true
    return false
  }
  return false
}

// GET / — list all internal projects
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isStagiaire = await (async () => {
      const user = await User.findById(req.user!.id).select('tags')
      return user?.tags?.includes('STAGIAIRE') ?? false
    })()

    let projects
    if (isStagiaire) {
      const intern = await Intern.findOne({ userId: req.user!.id, status: 'ACTIF' })
      const memberFilter = intern?.departement
        ? {
            $or: [
              { members: req.user!.id },
              { poles: intern.departement },
            ],
          }
        : { members: req.user!.id }
      projects = await InternalProject.find({ status: { $ne: 'ARCHIVE' }, ...memberFilter })
        .populate('members', 'name email role')
        .populate('createdBy', 'name')
        .sort({ updatedAt: -1 })
    } else {
      const { status, entity } = req.query
      const filter: Record<string, any> = {}
      if (status && status !== 'all') filter.status = status
      if (entity && entity !== 'all') filter.entity = entity
      projects = await InternalProject.find(filter)
        .populate('members', 'name email role')
        .populate('createdBy', 'name')
        .sort({ updatedAt: -1 })
    }

    return res.json({ projects })
  } catch (err) {
    return next(err)
  }
})

// GET /meta — entities + poles lists
router.get('/meta', (_req: Request, res: Response) => {
  res.json({ entities: ENTITIES, poles: POLES })
})

// GET /missions — toutes les missions (SUPER_ADMIN = tout, autres = seulement les leurs)
router.get('/missions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, any> = {}
    if (req.user!.role !== 'SUPER_ADMIN') filter.assignedTo = req.user!.id

    const missions = await InternalMission.find(filter)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name')
      .populate('internalProject', 'name entity')
      .sort({ createdAt: -1 })
    return res.json({ missions })
  } catch (err) { return next(err) }
})

// GET /:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await InternalProject.findById(req.params.id)
      .populate('members', 'name email role tags')
      .populate('createdBy', 'name')
    if (!project) return res.status(404).json({ error: 'Projet introuvable' })

    const ok = await canAccess(req.user!.id, req.user!.role, project)
    if (!ok) return res.status(403).json({ error: 'Accès refusé' })

    return res.json({ project })
  } catch (err) {
    return next(err)
  }
})

// POST / — create
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, entity, poles, members, status, priority, startDate, endDate, tags } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Le nom est requis' })
    if (!entity) return res.status(400).json({ error: "L'entité est requise" })

    const project = await InternalProject.create({
      name: name.trim(),
      description: description || '',
      entity,
      poles: Array.isArray(poles) ? poles : [],
      members: Array.isArray(members) ? members : [],
      status: status || 'EN_COURS',
      priority: priority || 'NORMALE',
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      tags: Array.isArray(tags) ? tags : [],
      createdBy: req.user!.id,
    })

    const populated = await InternalProject.findById(project._id)
      .populate('members', 'name email role')
      .populate('createdBy', 'name')

    // Notifier chaque membre par email
    const baseUrl = process.env.CORS_ORIGIN || 'https://venio.paris'
    const projectUrl = `${baseUrl}/admin/projets-internes/${project._id}`
    const membersList = (populated?.members || []) as any[]
    for (const member of membersList) {
      if (member.email) {
        sendInternalProjectAssignedEmail({
          to: member.email,
          memberName: member.name || member.email,
          projectName: project.name,
          entity: project.entity,
          poles: project.poles,
          description: project.description,
          projectUrl,
        }).catch(() => {}) // fire and forget, ne bloque pas la réponse
      }
    }

    return res.status(201).json({ project: populated })
  } catch (err) {
    return next(err)
  }
})

// PATCH /:id — update
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await InternalProject.findById(req.params.id)
    if (!project) return res.status(404).json({ error: 'Projet introuvable' })

    const { name, description, entity, poles, members, status, priority, startDate, endDate, tags } = req.body

    // Garder trace des membres avant modification pour détecter les nouveaux
    const previousMemberIds = project.members.map((m) => m.toString())

    if (name !== undefined) project.name = name.trim()
    if (description !== undefined) project.description = description
    if (entity !== undefined) project.entity = entity
    if (Array.isArray(poles)) project.poles = poles
    if (Array.isArray(members)) project.members = members
    if (status !== undefined) project.status = status
    if (priority !== undefined) project.priority = priority
    if (startDate !== undefined) project.startDate = startDate ? new Date(startDate) : null
    if (endDate !== undefined) project.endDate = endDate ? new Date(endDate) : null
    if (Array.isArray(tags)) project.tags = tags

    await project.save()

    const populated = await InternalProject.findById(project._id)
      .populate('members', 'name email role')
      .populate('createdBy', 'name')

    // Notifier les nouveaux membres ajoutés
    if (Array.isArray(members)) {
      const baseUrl = process.env.CORS_ORIGIN || 'https://venio.paris'
      const projectUrl = `${baseUrl}/admin/projets-internes/${project._id}`
      const newMembersList = (populated?.members || []) as any[]
      for (const member of newMembersList) {
        if (!previousMemberIds.includes(member._id.toString()) && member.email) {
          sendInternalProjectAssignedEmail({
            to: member.email,
            memberName: member.name || member.email,
            projectName: project.name,
            entity: project.entity,
            poles: project.poles,
            description: project.description,
            projectUrl,
          }).catch(() => {})
        }
      }
    }

    return res.json({ project: populated })
  } catch (err) {
    return next(err)
  }
})

// DELETE /:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Seul le Super Admin peut supprimer un projet interne' })
    }
    const project = await InternalProject.findById(req.params.id)
    if (!project) return res.status(404).json({ error: 'Projet introuvable' })
    await project.deleteOne()
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

// ── MISSIONS ──────────────────────────────────────────────────────────────────

// GET /:projectId/missions
router.get('/:projectId/missions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await InternalProject.findById(req.params.projectId)
    if (!project) return res.status(404).json({ error: 'Projet introuvable' })
    const ok = await canAccess(req.user!.id, req.user!.role, project)
    if (!ok) return res.status(403).json({ error: 'Accès refusé' })

    // Seul le SUPER_ADMIN voit toutes les missions; les autres voient seulement les leurs
    const isAdmin = req.user!.role === 'SUPER_ADMIN'
    const filter: Record<string, any> = { internalProject: req.params.projectId }
    if (!isAdmin) filter.assignedTo = req.user!.id

    const missions = await InternalMission.find(filter)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
    return res.json({ missions })
  } catch (err) { return next(err) }
})

// POST /:projectId/missions (SUPER_ADMIN uniquement)
router.post('/:projectId/missions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Seul le Super Admin peut créer des missions' })

    const project = await InternalProject.findById(req.params.projectId)
    if (!project) return res.status(404).json({ error: 'Projet introuvable' })

    const { title, description, assignedTo, dueDate } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'Le titre est requis' })
    if (!assignedTo) return res.status(400).json({ error: 'Assigné à est requis' })

    const mission = await InternalMission.create({
      title: title.trim(),
      description: description || '',
      assignedTo,
      internalProject: req.params.projectId,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdBy: req.user!.id,
    })

    const populated = await InternalMission.findById(mission._id)
      .populate<{ assignedTo: { name: string; email: string } }>('assignedTo', 'name email')
      .populate('createdBy', 'name')

    // Notifier la personne assignée
    const assignee = populated?.assignedTo as any
    if (assignee?.email) {
      const baseUrl = process.env.CORS_ORIGIN || 'https://venio.paris'
      sendInternalMissionAssignedEmail({
        to: assignee.email,
        memberName: assignee.name || assignee.email,
        missionTitle: mission.title,
        missionDescription: mission.description || '',
        projectName: project.name,
        entity: project.entity,
        dueDate: mission.dueDate ? mission.dueDate.toISOString() : null,
        projectUrl: `${baseUrl}/admin/projets-internes/${project._id}`,
      }).catch(() => {})
    }

    return res.status(201).json({ mission: populated })
  } catch (err) { return next(err) }
})

// PATCH /:projectId/missions/:missionId
router.patch('/:projectId/missions/:missionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mission = await InternalMission.findOne({
      _id: req.params.missionId,
      internalProject: req.params.projectId,
    })
    if (!mission) return res.status(404).json({ error: 'Mission introuvable' })

    const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'RH'].includes(req.user!.role)
    const isAssigned = mission.assignedTo.toString() === req.user!.id
    if (!isAdmin && !isAssigned) return res.status(403).json({ error: 'Accès refusé' })

    const { title, description, assignedTo, status, dueDate } = req.body
    if (isAdmin) {
      if (title !== undefined) mission.title = title.trim()
      if (description !== undefined) mission.description = description
      if (assignedTo !== undefined) mission.assignedTo = assignedTo
      if (dueDate !== undefined) mission.dueDate = dueDate ? new Date(dueDate) : null
    }
    if (status !== undefined) mission.status = status

    await mission.save()
    const populated = await InternalMission.findById(mission._id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name')
    return res.json({ mission: populated })
  } catch (err) { return next(err) }
})

// DELETE /:projectId/missions/:missionId (SUPER_ADMIN uniquement)
router.delete('/:projectId/missions/:missionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Seul le Super Admin peut supprimer une mission' })

    const mission = await InternalMission.findOneAndDelete({
      _id: req.params.missionId,
      internalProject: req.params.projectId,
    })
    if (!mission) return res.status(404).json({ error: 'Mission introuvable' })
    return res.json({ success: true })
  } catch (err) { return next(err) }
})

export default router
