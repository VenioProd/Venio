import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import InternalProject, { ENTITIES, POLES } from '../../models/InternalProject.js'
import Intern from '../../models/Intern.js'
import User from '../../models/User.js'

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
    const memberIds = project.members.map((m: any) => m.toString())
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

export default router
