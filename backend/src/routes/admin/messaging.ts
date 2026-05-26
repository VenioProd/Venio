import express, { Request, Response, NextFunction } from 'express'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import User from '../../models/User.js'
import InternalMessage from '../../models/InternalMessage.js'
import { getIo } from '../../realtime/ioSingleton.js'
import {
  createConversation,
  createMessage,
  listConversations,
  listMessages,
  markConversationRead,
  searchMessages,
  softDeleteMessage,
  toggleReaction,
  updateMessage,
} from '../../services/internalMessaging.js'
import { multerFileFilter } from '../../lib/uploadConfig.js'

const router = express.Router()

const uploadDir = path.resolve(process.cwd(), 'uploads', 'internal-messaging')
fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: multerFileFilter,
})

router.use(auth)
router.use(requireAdmin)
router.use(requirePermission(PERMISSIONS.VIEW_MESSAGING))

router.get('/users', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await User.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RH', 'COMMERCIAL', 'COMPTABLE', 'VIEWER', 'STAGIAIRE', 'AGENT'] },
      isActive: { $ne: false },
    })
      .select('name email role')
      .sort({ name: 1 })
    return res.json({ users })
  } catch (err) {
    return next(err)
  }
})

function handleValidation(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
    return false
  }
  return true
}

router.get('/conversations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversations = await listConversations(req.user!)
    return res.json({ conversations })
  } catch (err) {
    return next(err)
  }
})

router.post(
  '/conversations',
  requirePermission(PERMISSIONS.MANAGE_CHANNELS),
  body('type').isIn(['CHANNEL', 'DM', 'GROUP']).withMessage('Type de conversation invalide'),
  body('name').optional().isString().trim(),
  body('visibility').optional().isIn(['PUBLIC', 'PRIVATE']).withMessage('Visibilité invalide'),
  body('participantIds').optional().isArray().withMessage('Participants invalides'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return
      const conversation = await createConversation(req.user!, {
        type: req.body.type,
        name: req.body.name,
        visibility: req.body.visibility,
        participantIds: req.body.participantIds,
      })
      return res.status(201).json({ conversation })
    } catch (err) {
      return next(err)
    }
  }
)

router.post(
  '/direct',
  requirePermission(PERMISSIONS.SEND_MESSAGES),
  body('participantId').isString().notEmpty().withMessage('Destinataire requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return
      const conversation = await createConversation(req.user!, {
        type: 'DM',
        participantIds: [req.body.participantId],
      })
      return res.status(201).json({ conversation })
    } catch (err) {
      return next(err)
    }
  }
)

router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await searchMessages(req.user!, String(req.query.q || ''))
    return res.json({ results })
  } catch (err) {
    return next(err)
  }
})

router.get('/conversations/:conversationId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversationId = String(req.params.conversationId)
    const messages = await listMessages(req.user!, conversationId, {
      before: req.query.before ? String(req.query.before) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    })
    return res.json({ messages })
  } catch (err) {
    return next(err)
  }
})

router.post(
  '/conversations/:conversationId/messages',
  requirePermission(PERMISSIONS.SEND_MESSAGES),
  body('content').isString().trim().notEmpty().withMessage('Le contenu du message est requis'),
  body('parentMessage').optional({ nullable: true }).isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return
      const message = await createMessage(req.user!, String(req.params.conversationId), {
        content: req.body.content,
        parentMessage: req.body.parentMessage || null,
      })
      return res.status(201).json({ message })
    } catch (err) {
      return next(err)
    }
  }
)

router.post(
  '/conversations/:conversationId/attachments',
  requirePermission(PERMISSIONS.SEND_MESSAGES),
  upload.array('files', 5),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = (req.files || []) as Express.Multer.File[]
      const attachments = files.map((file) => ({
        originalName: file.originalname,
        storagePath: path.relative(process.cwd(), file.path),
        mimeType: file.mimetype,
        size: file.size,
      }))
      const message = await createMessage(req.user!, String(req.params.conversationId), {
        content: String(req.body.content || 'Pièce jointe'),
        attachments,
      })
      getIo()?.to(`conversation:${req.params.conversationId}`).emit('message:created', { message })
      return res.status(201).json({ message })
    } catch (err) {
      return next(err)
    }
  }
)

router.get('/messages/:messageId/attachments/:index/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const message = await InternalMessage.findById(req.params.messageId)
    const index = Number(req.params.index)
    const attachment = message?.attachments[index]
    if (!message || !attachment) {
      return res.status(404).json({ error: 'Fichier non trouvé' })
    }
    await listMessages(req.user!, message.conversation.toString(), { limit: 1 })

    const safeRoot = path.resolve(process.cwd(), 'uploads', 'internal-messaging')
    const filePath = path.resolve(process.cwd(), attachment.storagePath)
    if (!filePath.startsWith(safeRoot + path.sep)) {
      return res.status(403).json({ error: 'Access denied' })
    }
    return res.download(filePath, attachment.originalName)
  } catch (err) {
    return next(err)
  }
})

router.post('/conversations/:conversationId/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await markConversationRead(req.user!, String(req.params.conversationId))
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

router.patch(
  '/messages/:messageId',
  requirePermission(PERMISSIONS.SEND_MESSAGES),
  body('content').isString().trim().notEmpty().withMessage('Le contenu du message est requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return
      const message = await updateMessage(req.user!, String(req.params.messageId), req.body.content)
      return res.json({ message })
    } catch (err) {
      return next(err)
    }
  }
)

router.delete('/messages/:messageId', requirePermission(PERMISSIONS.SEND_MESSAGES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const message = await softDeleteMessage(req.user!, String(req.params.messageId))
    return res.json({ message })
  } catch (err) {
    return next(err)
  }
})

router.post(
  '/messages/:messageId/reactions',
  requirePermission(PERMISSIONS.SEND_MESSAGES),
  body('emoji').isString().trim().notEmpty().withMessage('Réaction requise'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!handleValidation(req, res)) return
      const message = await toggleReaction(req.user!, String(req.params.messageId), req.body.emoji)
      return res.json({ message })
    } catch (err) {
      return next(err)
    }
  }
)

export default router
