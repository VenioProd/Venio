import express, { type Request, type Response, type NextFunction } from 'express'
import path from 'path'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import ClientUpload from '../../../models/ClientUpload.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

router.get(
  '/:projectId/client-files',
  requirePermission(PERMISSIONS.VIEW_CONTENT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = await ClientUpload.find({ project: req.params.projectId })
        .populate('client', 'name companyName')
        .sort({ createdAt: -1 })
        .lean()

      return res.json({
        files: files.map((doc) => ({
          id: String(doc._id),
          client: doc.client
            ? {
                id: String((doc.client as unknown as { _id: unknown })._id),
                name: (doc.client as unknown as { name: string }).name,
                companyName: (doc.client as unknown as { companyName?: string }).companyName || '',
              }
            : null,
          category: doc.category,
          note: doc.note,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          size: doc.size,
          createdAt: doc.createdAt.toISOString(),
        })),
      })
    } catch (err) {
      return next(err)
    }
  },
)

router.get(
  '/:projectId/client-files/:fileId/download',
  requirePermission(PERMISSIONS.VIEW_CONTENT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await ClientUpload.findOne({ _id: req.params.fileId, project: req.params.projectId })
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
