import express, { type Request, type Response, type NextFunction } from 'express'
import path from 'path'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import ClientUpload from '../../../models/ClientUpload.js'
import { ensureClient } from './helpers.js'

const router = express.Router()

router.get(
  '/:id/files',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = await ensureClient(req.params.id as string, req)
      if (!client) return res.status(404).json({ error: 'Client non trouvé' })

      const files = await ClientUpload.find({ client: client._id })
        .populate('project', 'name')
        .sort({ createdAt: -1 })
        .lean()

      return res.json({
        files: files.map((doc) => ({
          id: String(doc._id),
          project: doc.project
            ? {
                id: String((doc.project as unknown as { _id: unknown; name: string })._id),
                name: (doc.project as unknown as { _id: unknown; name: string }).name,
              }
            : null,
          category: doc.category,
          note: doc.note,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          size: doc.size,
          createdAt: doc.createdAt.toISOString(),
          downloadedByAdminAt: doc.downloadedByAdminAt ? doc.downloadedByAdminAt.toISOString() : null,
        })),
      })
    } catch (err) {
      return next(err)
    }
  },
)

router.get(
  '/:id/files/:fileId/download',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = await ensureClient(req.params.id as string, req)
      if (!client) return res.status(404).json({ error: 'Client non trouvé' })

      const file = await ClientUpload.findOne({ _id: req.params.fileId, client: client._id })
      if (!file) return res.status(404).json({ error: 'Fichier non trouvé' })

      const uploadsDir = path.resolve(process.cwd(), 'uploads')
      const filePath = path.resolve(process.cwd(), file.storagePath)
      if (!filePath.startsWith(uploadsDir)) {
        return res.status(403).json({ error: 'Access denied' })
      }

      if (!file.downloadedByAdminAt) {
        file.downloadedByAdminAt = new Date()
        await file.save()
      }

      // dotfiles: 'allow' — le chemin est déjà contraint à uploadsDir ci-dessus
      // (aucun risque de traversal), mais sans cette option `send` renvoie 404
      // dès qu'un segment du chemin absolu commence par un point (ex. un
      // checkout sous un dossier `.claude/...`), ce qui casse le téléchargement
      // sans rapport avec l'autorisation.
      return res.download(filePath, file.originalName, { dotfiles: 'allow' })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
