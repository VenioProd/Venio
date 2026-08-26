import express, { type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import crypto from 'node:crypto'
import auth from '../../middleware/auth.js'
import ClientUpload from '../../models/ClientUpload.js'
import ClientActivity from '../../models/ClientActivity.js'
import User from '../../models/User.js'
import { getProjectAccess } from '../../lib/projectAccess.js'
import { notifySuperAdmins } from '../../lib/notifyHelpers.js'
import { logActivity } from '../../lib/activityLog.js'
import logger from '../../lib/logger.js'

const router = express.Router()
router.use(auth)

const baseDir = path.resolve('uploads/client-files')

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
])

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(baseDir, String(req.user!.id))
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('UNSUPPORTED_FILE_TYPE'))
    }
  },
})

const CATEGORIES = new Set(['LOGO', 'TEXTE', 'PHOTO', 'BRIEF', 'AUTRE'])

async function removeFiles(files: Express.Multer.File[]): Promise<void> {
  await Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => {})))
}

function handleUploadErrors(err: unknown, res: Response): boolean {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Fichier trop volumineux (20 Mo max)', code: 'FILE_TOO_LARGE' })
      return true
    }
    res.status(400).json({ error: 'Trop de fichiers (10 maximum)', code: 'TOO_MANY_FILES' })
    return true
  }
  if (err instanceof Error && err.message === 'UNSUPPORTED_FILE_TYPE') {
    res.status(400).json({ error: 'Type de fichier non autorisé', code: 'UNSUPPORTED_FILE_TYPE' })
    return true
  }
  return false
}

router.post(
  '/files',
  (req: Request, res: Response, next: NextFunction) => {
    upload.array('files', 10)(req, res, (err) => {
      if (err) {
        if (handleUploadErrors(err, res)) return
        return next(err)
      }
      next()
    })
  },
  async (req: Request, res: Response, next: NextFunction) => {
    const files = (req.files as Express.Multer.File[]) || []
    let persisted = false
    try {
      if (req.user!.role !== 'CLIENT') {
        await removeFiles(files)
        return res.status(403).json({ error: 'Forbidden' })
      }
      if (files.length === 0) {
        return res.status(400).json({ error: 'Aucun fichier reçu' })
      }

      const { projectId, category, note } = req.body as { projectId?: string; category?: string; note?: string }
      const trimmedNote = String(note ?? '').slice(0, 500)
      const resolvedCategory = category && CATEGORIES.has(category) ? category : 'AUTRE'

      let project = null
      if (projectId) {
        const access = await getProjectAccess(projectId, req.user!.id)
        if (!access) {
          await removeFiles(files)
          return res.status(404).json({ error: 'Projet non trouvé' })
        }
        project = access.project
      }

      const created = await ClientUpload.create(
        files.map((file) => ({
          client: req.user!.id,
          project: project ? project._id : null,
          category: resolvedCategory,
          note: trimmedNote,
          originalName: file.originalname,
          storagePath: path.relative(process.cwd(), file.path),
          mimeType: file.mimetype,
          size: file.size,
        })),
      )
      persisted = true

      const clientUser = await User.findById(req.user!.id).select('name companyName').lean()
      const clientName = clientUser?.companyName || clientUser?.name || 'Client'

      await notifySuperAdmins({
        type: 'CLIENT_FILE_UPLOADED',
        title: `Fichiers reçus de ${clientName}`,
        message: `${files.length} fichier(s)${project ? ` — projet ${project.name}` : ''}`,
        link: `/admin/comptes-clients/${req.user!.id}?tab=files`,
        metadata: { clientId: req.user!.id, projectId: project ? String(project._id) : null, count: files.length },
        dedupeKey: `client-files:${req.user!.id}`,
      })

      await ClientActivity.create({
        clientId: req.user!.id,
        type: 'FICHIER_DEPOSE',
        label: `${files.length} fichier(s) déposé(s)${project ? ` sur le projet ${project.name}` : ''}`,
        payload: { count: files.length, projectId: project ? String(project._id) : null },
        actorId: req.user!.id,
      }).catch((err) => {
        logger.error({ data: (err as Error).message }, '[ClientActivity] Failed to log activity:')
      })

      if (project) {
        await logActivity({
          project: project._id,
          action: 'FICHIER_CLIENT_DEPOSE',
          actor: req.user!.id,
          summary: `${files.length} fichier(s) déposé(s) par le client`,
          metadata: { count: files.length },
        })
      }

      return res.status(201).json({
        files: created.map((doc) => ({
          id: String(doc._id),
          project: doc.project ? String(doc.project) : null,
          category: doc.category,
          note: doc.note,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          size: doc.size,
          createdAt: doc.createdAt.toISOString(),
        })),
      })
    } catch (err) {
      if (!persisted) {
        await removeFiles(files)
      }
      return next(err)
    }
  },
)

router.get('/files', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
    const { projectId, q } = req.query as Record<string, string | undefined>
    const query: Record<string, unknown> = { client: req.user!.id }
    if (projectId) query.project = projectId
    if (q) query.originalName = { $regex: q, $options: 'i' }

    const files = await ClientUpload.find(query).sort({ createdAt: -1 }).lean()
    return res.json({
      files: files.map((doc) => ({
        id: String(doc._id),
        project: doc.project ? String(doc.project) : null,
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
})

router.get('/files/:id/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
    const file = await ClientUpload.findOne({ _id: req.params.id, client: req.user!.id })
    if (!file) return res.status(404).json({ error: 'Fichier non trouvé' })

    const uploadsDir = path.resolve(process.cwd(), 'uploads')
    const filePath = path.resolve(process.cwd(), file.storagePath)
    if (!filePath.startsWith(uploadsDir)) {
      return res.status(403).json({ error: 'Access denied' })
    }
    // `dotfiles: 'allow'` : le nom de fichier stocké est toujours généré
    // par le serveur (préfixe `${Date.now()}-`, jamais de point en tête) et
    // le préfixe `uploadsDir` est déjà vérifié ci-dessus. Sans cette option,
    // `send` refuse (404) dès qu'un segment quelconque du chemin ABSOLU
    // commence par un point — y compris un dossier ancêtre sans rapport
    // avec l'upload (ex. un worktree sous `.claude/`).
    return res.download(filePath, file.originalName, { dotfiles: 'allow' })
  } catch (err) {
    return next(err)
  }
})

router.delete('/files/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
    const file = await ClientUpload.findOne({ _id: req.params.id, client: req.user!.id })
    if (!file) return res.status(404).json({ error: 'Fichier non trouvé' })

    const filePath = path.resolve(process.cwd(), file.storagePath)
    await fs.promises.unlink(filePath).catch(() => {})
    await ClientUpload.deleteOne({ _id: file._id })
    await ClientActivity.create({
      clientId: req.user!.id,
      type: 'FICHIER_SUPPRIME',
      label: `Fichier « ${file.originalName} » supprimé`,
      payload: { fileId: String(file._id) },
      actorId: req.user!.id,
    })

    return res.json({ ok: true })
  } catch (err) {
    return next(err)
  }
})

export default router
