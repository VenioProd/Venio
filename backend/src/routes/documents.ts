import express, { Request, Response, NextFunction } from 'express'
import path from 'path'
import auth from '../middleware/auth.js'
import Document from '../models/Document.js'
import Project from '../models/Project.js'

const router = express.Router()

router.use(auth)

router.get('/:id/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await Document.findById(req.params.id)
    if (!document) {
      return res.status(404).json({ error: 'Document not found' })
    }

    const project = await Project.findById(document.project)
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    if (req.user!.role === 'CLIENT' && project.client.toString() !== req.user!.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (!document.downloadedAt) {
      document.downloadedAt = new Date()
      await document.save()
    }

    // Prevent path traversal attacks.
    // Le séparateur final est INDISPENSABLE : sinon /var/uploads-evil/foo passe.
    const uploadsDir = path.resolve(process.cwd(), 'uploads')
    const filePath = path.resolve(process.cwd(), document.storagePath)
    if (!filePath.startsWith(uploadsDir + path.sep)) {
      return res.status(403).json({ error: 'Access denied' })
    }
    return res.download(filePath, document.originalName)
  } catch (err) {
    return next(err)
  }
})

export default router
