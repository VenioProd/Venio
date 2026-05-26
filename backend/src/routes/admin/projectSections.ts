import express, { Request, Response } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import ProjectSection from '../../models/ProjectSection.js'
import Project from '../../models/Project.js'
import { PERMISSIONS } from '../../lib/permissions.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET /api/admin/projects/:projectId/sections - Lister les sections d'un projet
router.get('/:projectId/sections', requirePermission(PERMISSIONS.VIEW_CONTENT), async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params

    const project = await Project.findById(projectId)
    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    const sections = await ProjectSection.find({ project: projectId })
      .sort({ order: 1 })
      .populate('createdBy', 'name email')

    res.json({ sections })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/admin/projects/:projectId/sections - Créer une section
router.post('/:projectId/sections', requirePermission(PERMISSIONS.EDIT_CONTENT), async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params
    const { title, description, order, isVisible } = req.body

    const project = await Project.findById(projectId)
    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    // Déterminer l'ordre automatiquement si non fourni
    let sectionOrder = order
    if (sectionOrder === undefined) {
      const lastSection = await ProjectSection.findOne({ project: projectId })
        .sort({ order: -1 })
      sectionOrder = lastSection ? lastSection.order + 1 : 0
    }

    const section = new ProjectSection({
      project: projectId,
      title,
      description: description || '',
      order: sectionOrder,
      isVisible: isVisible !== undefined ? isVisible : true,
      createdBy: req.user!.id,
    })

    await section.save()
    await section.populate('createdBy', 'name email')

    res.status(201).json({ section })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PATCH /api/admin/projects/:projectId/sections/:sectionId - Modifier une section
router.patch('/:projectId/sections/:sectionId', requirePermission(PERMISSIONS.EDIT_CONTENT), async (req: Request, res: Response) => {
  try {
    const { projectId, sectionId } = req.params
    const { title, description, order, isVisible } = req.body

    const section = await ProjectSection.findOne({
      _id: sectionId,
      project: projectId,
    })

    if (!section) {
      return res.status(404).json({ error: 'Section non trouvée' })
    }

    if (title !== undefined) section.title = title
    if (description !== undefined) section.description = description
    if (order !== undefined) section.order = order
    if (isVisible !== undefined) section.isVisible = isVisible

    await section.save()
    await section.populate('createdBy', 'name email')

    res.json({ section })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// DELETE /api/admin/projects/:projectId/sections/:sectionId - Supprimer une section
router.delete('/:projectId/sections/:sectionId', requirePermission(PERMISSIONS.EDIT_CONTENT), async (req: Request, res: Response) => {
  try {
    const { projectId, sectionId } = req.params

    const section = await ProjectSection.findOne({
      _id: sectionId,
      project: projectId,
    })

    if (!section) {
      return res.status(404).json({ error: 'Section non trouvée' })
    }

    await section.deleteOne()

    res.json({ message: 'Section supprimée' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
