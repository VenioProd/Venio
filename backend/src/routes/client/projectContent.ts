import express, { Request, Response, NextFunction } from 'express'
import fs from 'fs'
import auth from '../../middleware/auth.js'
import ProjectSection from '../../models/ProjectSection.js'
import ProjectItem from '../../models/ProjectItem.js'
import Project from '../../models/Project.js'
import logger from '../../lib/logger.js'

const router = express.Router()

router.use(auth)

// GET /api/projects/:projectId/sections - Lister les sections visibles pour le client
router.get('/:projectId/sections', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params

    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Vérifier que le projet appartient au client
    const project = await Project.findOne({
      _id: projectId,
      client: req.user!.id,
    })

    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    // Ne retourner que les sections visibles
    const sections = await ProjectSection.find({
      project: projectId,
      isVisible: true,
    })
      .sort({ order: 1 })
      .select('-createdBy')

    res.json({ sections })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/projects/:projectId/items - Lister les items visibles pour le client
router.get('/:projectId/items', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params
    const { section, type } = req.query as Record<string, string | undefined>

    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Vérifier que le projet appartient au client
    const project = await Project.findOne({
      _id: projectId,
      client: req.user!.id,
    })

    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    const query: Record<string, unknown> = {
      project: projectId,
      isVisible: true,
    }

    if (section) query.section = section
    if (type) query.type = type

    // Ne retourner que les items visibles
    const items = await ProjectItem.find(query)
      .sort({ order: 1 })
      .populate('section', 'title')
      .select('-createdBy')

    // Masquer le storagePath pour la sécurité
    const sanitizedItems = items.map((item) => {
      const itemObj = item.toObject()
      if (itemObj.file?.storagePath) {
        ;(itemObj.file as any).storagePath = undefined
      }
      return itemObj
    })

    res.json({ items: sanitizedItems })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/projects/:projectId/items/:itemId - Voir un item (marque comme vu)
router.get('/:projectId/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { projectId, itemId } = req.params

    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Vérifier que le projet appartient au client
    const project = await Project.findOne({
      _id: projectId,
      client: req.user!.id,
    })

    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    const item = await ProjectItem.findOne({
      _id: itemId,
      project: projectId,
      isVisible: true,
    })
      .populate('section', 'title')
      .select('-createdBy')

    if (!item) {
      return res.status(404).json({ error: 'Item non trouvé' })
    }

    // Marquer comme vu si pas déjà fait
    if (!item.viewedAt) {
      item.viewedAt = new Date()
      await item.save()
    }

    // Masquer le storagePath
    const itemObj = item.toObject()
    if (itemObj.file?.storagePath) {
      ;(itemObj.file as any).storagePath = undefined
    }

    res.json({ item: itemObj })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/projects/:projectId/items/:itemId/download - Télécharger un fichier
router.get('/:projectId/items/:itemId/download', async (req: Request, res: Response) => {
  try {
    const { projectId, itemId } = req.params

    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Vérifier que le projet appartient au client
    const project = await Project.findOne({
      _id: projectId,
      client: req.user!.id,
    })

    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    const item = await ProjectItem.findOne({
      _id: itemId,
      project: projectId,
      isVisible: true,
      isDownloadable: true,
    })

    if (!item) {
      return res.status(404).json({ error: 'Item non trouvé ou non téléchargeable' })
    }

    if (!item.file?.storagePath) {
      return res.status(404).json({ error: 'Aucun fichier associé' })
    }

    if (!fs.existsSync(item.file.storagePath)) {
      return res.status(404).json({ error: 'Fichier introuvable' })
    }

    // Marquer comme téléchargé
    item.downloadedAt = new Date()
    await item.save()

    res.download(item.file.storagePath, item.file.originalName)
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
