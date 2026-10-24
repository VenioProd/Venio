import express, { type NextFunction, type Request, type Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import { resolveSubject } from '../../lib/interactionAccess.js'
import { logInteraction } from '../../lib/interactions.js'
import { serveAttachment } from '../../lib/attachmentResponse.js'
import Interaction, { INTERACTION_BODY_MAX_LENGTH, INTERACTION_SUBJECT_MAX_LENGTH } from '../../models/Interaction.js'
import type { IInteraction } from '../../types/models/index.js'

const router = express.Router()
router.use(auth, requireAdmin)
const uploadDir = path.resolve(process.cwd(), 'uploads', 'interactions')
const extensions: Record<string, string> = {
  'audio/m4a': 'm4a',
  'audio/mp4': 'mp4',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (extensions[file.mimetype]) cb(null, true)
    else cb(new Error('UNSUPPORTED_AUDIO'))
  },
}).single('audio')

function responseOf(interaction: IInteraction) {
  const result = interaction.toObject()
  delete result.clientRequestId
  delete result.clientRequestHash
  return {
    interaction: result,
    audio: result.audio ? { ...result.audio, url: `/api/mobile/interactions/${result._id}/audio` } : null,
  }
}

function replay(res: Response, existing: IInteraction, hash: string) {
  if (existing.clientRequestHash !== hash) {
    return res.status(409).json({ error: 'Cette clé a déjà servi pour un autre contenu', code: 'IDEMPOTENCY_CONFLICT' })
  }
  return res.status(200).json(responseOf(existing))
}

router.post(
  '/',
  (req: Request, res: Response, next: NextFunction) => {
    const key = req.get('Idempotency-Key')
    if (!key || !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(key)) {
      return res
        .status(400)
        .json({ error: 'Une clé UUID Idempotency-Key est requise', code: 'IDEMPOTENCY_KEY_REQUIRED' })
    }
    upload(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ error: 'Audio trop volumineux', code: 'AUDIO_TOO_LARGE' })
        } else {
          res.status(400).json({ error: 'Audio invalide', code: 'INVALID_AUDIO' })
        }
        return
      }
      next()
    })
  },
  body('subjectType').isIn(['LEAD', 'CLIENT']),
  body('subjectId').isMongoId(),
  body('kind').isIn(['CALL', 'NOTE', 'MEETING']),
  body('direction').optional().isIn(['IN', 'OUT', 'NONE']),
  body('occurredAt').optional().isISO8601(),
  body('endsAt').optional().isISO8601(),
  body('subject').optional().isString().trim().isLength({ max: INTERACTION_SUBJECT_MAX_LENGTH }),
  body('body').isString().isLength({ min: 1, max: INTERACTION_BODY_MAX_LENGTH }),
  body('lang').optional({ values: 'null' }).isIn(['fr', 'en']),
  async (req: Request, res: Response, next: NextFunction) => {
    let storedFile: string | undefined
    try {
      if (!validationResult(req).isEmpty() || !req.body.body.trim())
        return res.status(400).json({ error: 'Interaction invalide' })
      const occurredAt = req.body.occurredAt ? new Date(req.body.occurredAt) : new Date()
      const endsAt = req.body.endsAt === undefined ? undefined : new Date(req.body.endsAt)
      const subject = await resolveSubject(
        {
          user: req.user,
          params: { subjectType: req.body.subjectType, subjectId: req.body.subjectId },
        } as unknown as Request,
        res,
        'write',
      )
      if (!subject) return
      const normalized = {
        subjectType: subject.type,
        subjectId: String(subject.id),
        kind: req.body.kind as 'CALL' | 'NOTE' | 'MEETING',
        direction: (req.body.direction ?? 'NONE') as 'IN' | 'OUT' | 'NONE',
        occurredAt: req.body.occurredAt ? occurredAt.toISOString() : null,
        ...(endsAt ? { endsAt: endsAt.toISOString() } : {}),
        subject: req.body.subject ?? '',
        body: req.body.body,
        lang: (req.body.lang ?? null) as 'fr' | 'en' | null,
      }
      const clientRequestId = req.get('Idempotency-Key')!.toLowerCase()
      const clientRequestHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
      const findReplay = () =>
        Interaction.findOne({ author: req.user!.id, clientRequestId }).select('+clientRequestId +clientRequestHash')
      const existing = await findReplay()
      if (existing) return replay(res, existing, clientRequestHash)
      if (endsAt && (req.body.kind !== 'MEETING' || endsAt <= occurredAt)) {
        return res.status(400).json({ error: 'La fin doit suivre le début du rendez-vous', code: 'INVALID_ENDS_AT' })
      }
      let audio
      if (req.file) {
        const filename = `${randomUUID()}.${extensions[req.file.mimetype]}`
        await fs.mkdir(uploadDir, { recursive: true })
        storedFile = path.join(uploadDir, filename)
        await fs.writeFile(storedFile, req.file.buffer, { flag: 'wx' })
        audio = { filename, originalName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size }
      }
      try {
        const interaction = await logInteraction({
          ...normalized,
          occurredAt,
          endsAt,
          author: req.user!.id,
          clientRequestId,
          clientRequestHash,
          audio,
        })
        storedFile = undefined
        return res.status(201).json(responseOf(interaction))
      } catch (err) {
        if (storedFile) {
          await fs.rm(storedFile, { force: true })
          storedFile = undefined
        }
        if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
          const winner = await findReplay()
          if (winner) return replay(res, winner, clientRequestHash)
        }
        throw err
      }
    } catch (err) {
      try {
        if (storedFile) await fs.rm(storedFile, { force: true })
      } catch (cleanupError) {
        return next(cleanupError)
      }
      return next(err)
    }
  },
)

router.get('/:id/audio', param('id').isMongoId(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Identifiant invalide' })
    const interaction = await Interaction.findById(req.params.id)
    if (!interaction) return res.status(404).json({ error: 'Interaction non trouvée' })
    const subject = await resolveSubject(
      {
        user: req.user,
        params: { subjectType: interaction.subjectType, subjectId: String(interaction.subjectId) },
      } as unknown as Request,
      res,
      'read',
    )
    if (!subject) return
    if (!interaction.audio) return res.status(404).json({ error: 'Audio non trouvé' })
    const file = path.join(uploadDir, path.basename(interaction.audio.filename))
    try {
      await fs.access(file)
    } catch {
      return res.status(404).json({ error: 'Audio non trouvé' })
    }
    return serveAttachment(res, file, interaction.audio.originalName)
  } catch (err) {
    return next(err)
  }
})
export default router
