import express, { type Request, type Response, type NextFunction } from 'express'
import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import { body, param, validationResult } from 'express-validator'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'
import User from '../../models/User.js'
import DevProject from '../../models/DevProject.js'
import BetaCampaign, { BETA_CAMPAIGN_STATUSES } from '../../models/BetaCampaign.js'
import BetaScenario from '../../models/BetaScenario.js'
import BetaTester from '../../models/BetaTester.js'
import BetaRun, {
  BETA_REPRODUCIBILITIES,
  BETA_RUN_STATUSES,
  BETA_SEVERITIES,
  BETA_VERDICTS,
  type BetaAttachment,
  type NewBetaAttachment,
} from '../../models/BetaRun.js'
import BetaComment from '../../models/BetaComment.js'
import { createBetaTesterToken, hashBetaTesterToken } from '../../lib/beta/tokens.js'
import { createScenarioWithRetry, normalizeSteps } from '../../lib/beta/scenarios.js'
import { promoteRunToIssue, refreshScenarioSummary } from '../../lib/beta/promote.js'
import { buildCampaignReportData, renderCampaignReportPdf } from '../../lib/beta/report.js'
import { sanitizeReportedUrl } from '../../lib/beta/sanitizeUrl.js'
import {
  BETA_MAX_ATTACHMENT_BYTES,
  BETA_UPLOAD_DIR,
  checkAttachmentQuota,
  detectImageMimeType,
} from '../../lib/beta/uploads.js'

/**
 * Routes agent pour l'espace beta tests. Scopes : read:beta / write:beta.
 *
 * Un jeton agent n'a pas de compte associé : comme pour le dev tracker, les
 * écritures qui exigent un auteur sont portées par un SUPER_ADMIN faisant
 * office de compte système. Un agent peut donc rendre ses propres verdicts,
 * au même titre qu'un membre de l'équipe qui teste lui-même.
 */

const router = express.Router()

const isObjectId = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v)

function emit(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, { errors: errors.array() })
    return true
  }
  return false
}

async function resolveSystemUserId(): Promise<mongoose.Types.ObjectId | null> {
  const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
  return admin?._id ? (admin._id as mongoose.Types.ObjectId) : null
}

function readString(raw: unknown, maxLength: number): string {
  return typeof raw === 'string' ? raw.trim().slice(0, maxLength) : ''
}

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Le `tokenHash` ne sort jamais : il n'a d'utilité que côté serveur. */
const TESTER_PUBLIC_FIELDS = '-tokenHash'

// ─── Campagnes ───────────────────────────────────────────────────────────────

router.get('/beta/campaigns', requireScope('read:beta'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    if (isObjectId(req.query.devProject)) filter.devProject = req.query.devProject
    if (
      typeof req.query.status === 'string' &&
      (BETA_CAMPAIGN_STATUSES as readonly string[]).includes(req.query.status)
    ) {
      filter.status = req.query.status
    }
    const [items, total] = await Promise.all([
      BetaCampaign.find(filter).sort({ updatedAt: -1 }).skip(pag.skip).limit(pag.limit).lean(),
      BetaCampaign.countDocuments(filter),
    ])
    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get(
  '/beta/campaigns/:id',
  requireScope('read:beta'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const campaign = await BetaCampaign.findById(req.params.id).lean()
      if (!campaign) return respondError(res, 404, 'NOT_FOUND', 'Campagne introuvable')
      const scenarios = await BetaScenario.find({ campaign: campaign._id, archivedAt: null })
        .sort({ rank: 1, number: 1 })
        .lean()
      res.json({ ...campaign, scenarios })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/beta/campaigns',
  requireScope('write:beta'),
  body('name').isString().trim().notEmpty().withMessage('name requis'),
  body('devProject').isMongoId().withMessage('devProject invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const project = await DevProject.findById(req.body.devProject).select('_id').lean()
      if (!project) return respondError(res, 400, 'INVALID_REFERENCE', 'Projet dev introuvable')

      const createdBy = await resolveSystemUserId()
      if (!createdBy) return respondError(res, 500, 'NO_SYSTEM_USER', 'Aucun compte système disponible')

      const campaign = await BetaCampaign.create({
        devProject: req.body.devProject,
        name: readString(req.body.name, 160),
        description: readString(req.body.description, 5000),
        targetUrl: readString(req.body.targetUrl, 500) || null,
        startsAt: parseDate(req.body.startsAt),
        endsAt: parseDate(req.body.endsAt),
        createdBy,
      })
      res.status(201).json(campaign.toObject())
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  '/beta/campaigns/:id',
  requireScope('write:beta'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const campaign = await BetaCampaign.findById(req.params.id)
      if (!campaign) return respondError(res, 404, 'NOT_FOUND', 'Campagne introuvable')

      if (req.body.name !== undefined) {
        const name = readString(req.body.name, 160)
        if (!name) return respondError(res, 400, 'VALIDATION_ERROR', 'name ne peut pas être vide')
        campaign.name = name
      }
      if (req.body.description !== undefined) campaign.description = readString(req.body.description, 5000)
      if (req.body.targetUrl !== undefined) campaign.targetUrl = readString(req.body.targetUrl, 500) || null
      if (req.body.startsAt !== undefined) campaign.startsAt = parseDate(req.body.startsAt)
      if (req.body.endsAt !== undefined) campaign.endsAt = parseDate(req.body.endsAt)
      if (req.body.status !== undefined) {
        if (!(BETA_CAMPAIGN_STATUSES as readonly string[]).includes(req.body.status)) {
          return respondError(res, 400, 'VALIDATION_ERROR', 'status invalide')
        }
        campaign.status = req.body.status
      }

      await campaign.save()
      res.json(campaign.toObject())
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/beta/campaigns/:id/report',
  requireScope('read:beta'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const exists = await BetaCampaign.findById(req.params.id).select('_id').lean()
      if (!exists) return respondError(res, 404, 'NOT_FOUND', 'Campagne introuvable')

      const data = await buildCampaignReportData(String(req.params.id))
      const buffer = await renderCampaignReportPdf(data)
      const safeName = data.campaign.name.replace(/[^a-zA-Z0-9-]/g, '_')
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="Beta_${safeName}.pdf"`)
      res.send(buffer)
    } catch (err) {
      next(err)
    }
  },
)

// ─── Démarches ───────────────────────────────────────────────────────────────

router.get(
  '/beta/campaigns/:id/scenarios',
  requireScope('read:beta'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const pag = parsePagination(req)
      const filter = { campaign: req.params.id, archivedAt: null }
      const [items, total] = await Promise.all([
        BetaScenario.find(filter).sort({ rank: 1, number: 1 }).skip(pag.skip).limit(pag.limit).lean(),
        BetaScenario.countDocuments(filter),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/beta/campaigns/:id/scenarios',
  requireScope('write:beta'),
  param('id').isMongoId(),
  body('title').isString().trim().notEmpty().withMessage('title requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const campaign = await BetaCampaign.findById(req.params.id).select('_id').lean()
      if (!campaign) return respondError(res, 404, 'NOT_FOUND', 'Campagne introuvable')

      const scenario = await createScenarioWithRetry({
        campaign: campaign._id as mongoose.Types.ObjectId,
        title: readString(req.body.title, 200),
        description: readString(req.body.description, 10000),
        steps: req.body.steps,
      })
      res.status(201).json(scenario.toObject())
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  '/beta/scenarios/:id',
  requireScope('write:beta'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const scenario = await BetaScenario.findById(req.params.id)
      if (!scenario) return respondError(res, 404, 'NOT_FOUND', 'Démarche introuvable')

      if (req.body.title !== undefined) {
        const title = readString(req.body.title, 200)
        if (!title) return respondError(res, 400, 'VALIDATION_ERROR', 'title ne peut pas être vide')
        scenario.title = title
      }
      if (req.body.description !== undefined) scenario.description = readString(req.body.description, 10000)
      if (req.body.steps !== undefined) scenario.steps = normalizeSteps(req.body.steps)
      if (typeof req.body.rank === 'number' && Number.isFinite(req.body.rank)) scenario.rank = req.body.rank

      await scenario.save()
      res.json(scenario.toObject())
    } catch (err) {
      next(err)
    }
  },
)

router.delete(
  '/beta/scenarios/:id',
  requireScope('write:beta'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      // Archivage, jamais suppression : les verdicts déjà rendus restent la
      // trace de ce qui a été testé.
      const scenario = await BetaScenario.findByIdAndUpdate(
        req.params.id,
        { $set: { archivedAt: new Date() } },
        { new: true },
      ).lean()
      if (!scenario) return respondError(res, 404, 'NOT_FOUND', 'Démarche introuvable')
      res.json(scenario)
    } catch (err) {
      next(err)
    }
  },
)

// ─── Testeurs ────────────────────────────────────────────────────────────────

router.get(
  '/beta/campaigns/:id/testers',
  requireScope('read:beta'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const pag = parsePagination(req)
      const filter = { campaign: req.params.id }
      const [items, total] = await Promise.all([
        BetaTester.find(filter)
          .select(TESTER_PUBLIC_FIELDS)
          .sort({ createdAt: 1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .lean(),
        BetaTester.countDocuments(filter),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  },
)

const DEFAULT_TESTER_TTL_MS = 30 * 24 * 60 * 60 * 1000

router.post(
  '/beta/campaigns/:id/testers',
  requireScope('write:beta'),
  param('id').isMongoId(),
  body('name').isString().trim().notEmpty().withMessage('name requis'),
  body('email').isEmail().withMessage('email invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const campaign = await BetaCampaign.findById(req.params.id).select('_id endsAt').lean()
      if (!campaign) return respondError(res, 404, 'NOT_FOUND', 'Campagne introuvable')

      const token = createBetaTesterToken()
      const tester = await BetaTester.create({
        campaign: campaign._id,
        name: readString(req.body.name, 120),
        email: String(req.body.email).trim(),
        tokenHash: hashBetaTesterToken(token),
        expiresAt: campaign.endsAt ?? new Date(Date.now() + DEFAULT_TESTER_TTL_MS),
      })

      // Seule réponse où le secret est lisible : il n'est stocké que haché.
      const { tokenHash: _hidden, ...safe } = tester.toObject()
      res.status(201).json({ tester: safe, token })
    } catch (err) {
      if ((err as { code?: number } | null)?.code === 11000) {
        return respondError(res, 409, 'DUPLICATE', 'Ce testeur est déjà invité sur cette campagne')
      }
      next(err)
    }
  },
)

router.post(
  '/beta/testers/:id/revoke',
  requireScope('write:beta'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const tester = await BetaTester.findByIdAndUpdate(
        req.params.id,
        { $set: { revokedAt: new Date() } },
        { new: true },
      )
        .select(TESTER_PUBLIC_FIELDS)
        .lean()
      if (!tester) return respondError(res, 404, 'NOT_FOUND', 'Testeur introuvable')
      res.json(tester)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/beta/testers/:id/rotate',
  requireScope('write:beta'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const tester = await BetaTester.findById(req.params.id)
      if (!tester) return respondError(res, 404, 'NOT_FOUND', 'Testeur introuvable')

      const token = createBetaTesterToken()
      tester.tokenHash = hashBetaTesterToken(token)
      tester.revokedAt = null
      await tester.save()

      const { tokenHash: _hidden, ...safe } = tester.toObject()
      res.json({ tester: safe, token })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Verdicts ────────────────────────────────────────────────────────────────

router.get(
  '/beta/campaigns/:id/runs',
  requireScope('read:beta'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const pag = parsePagination(req)
      const filter: Record<string, unknown> = { campaign: req.params.id }
      if (req.query.status === 'open') filter.status = { $in: ['OPEN', 'ACKNOWLEDGED'] }
      else if (
        typeof req.query.status === 'string' &&
        (BETA_RUN_STATUSES as readonly string[]).includes(req.query.status)
      ) {
        filter.status = req.query.status
      }
      if (typeof req.query.verdict === 'string' && (BETA_VERDICTS as readonly string[]).includes(req.query.verdict)) {
        filter.verdict = req.query.verdict
      }
      if (isObjectId(req.query.scenario)) filter.scenario = req.query.scenario

      const [items, total] = await Promise.all([
        BetaRun.find(filter)
          .populate('tester', 'name email')
          .populate('scenario', 'identifier title')
          .populate('devIssue', 'identifier title status')
          .sort({ updatedAt: -1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .lean(),
        BetaRun.countDocuments(filter),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/beta/scenarios/:id/runs',
  requireScope('write:beta'),
  param('id').isMongoId(),
  body('verdict').isIn(BETA_VERDICTS).withMessage('verdict invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const scenario = await BetaScenario.findOne({ _id: req.params.id, archivedAt: null }).select('_id campaign')
      if (!scenario) return respondError(res, 404, 'NOT_FOUND', 'Démarche introuvable')

      const author = await resolveSystemUserId()
      if (!author) return respondError(res, 500, 'NO_SYSTEM_USER', 'Aucun compte système disponible')

      const isFailure = req.body.verdict !== 'WORKS'
      const payload = {
        verdict: req.body.verdict,
        severity:
          isFailure && (BETA_SEVERITIES as readonly string[]).includes(req.body.severity) ? req.body.severity : null,
        reproducibility:
          isFailure && (BETA_REPRODUCIBILITIES as readonly string[]).includes(req.body.reproducibility)
            ? req.body.reproducibility
            : null,
        failedStep: Number.isFinite(Number(req.body.failedStep)) ? Number(req.body.failedStep) : null,
        title: readString(req.body.title, 200),
        body: readString(req.body.body, 10000),
        context: {
          url: sanitizeReportedUrl(req.body.url),
          userAgent: readString(req.body.userAgent, 500) || null,
          viewportWidth: null,
          viewportHeight: null,
          isMobile: null,
        },
      }

      // Un auteur ne détient qu'un verdict courant par démarche : l'agent
      // révise le sien, il n'en empile pas.
      const existing = await BetaRun.findOne({ scenario: scenario._id, user: author })
      let run = existing
      if (run) {
        Object.assign(run, payload)
        run.status = 'OPEN'
        await run.save()
      } else {
        run = await BetaRun.create({
          campaign: scenario.campaign,
          scenario: scenario._id,
          user: author,
          ...payload,
        })
      }

      await refreshScenarioSummary(scenario._id)
      res.status(existing ? 200 : 201).json(run.toObject())
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  '/beta/runs/:id',
  requireScope('write:beta'),
  param('id').isMongoId(),
  body('status').isIn(BETA_RUN_STATUSES).withMessage('status invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const run = await BetaRun.findById(req.params.id)
      if (!run) return respondError(res, 404, 'NOT_FOUND', 'Retour introuvable')

      run.status = req.body.status
      await run.save()
      await refreshScenarioSummary(run.scenario)
      res.json(run.toObject())
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/beta/runs/:id/promote',
  requireScope('write:beta'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const run = await BetaRun.findById(req.params.id).select('devIssue verdict')
      if (!run) return respondError(res, 404, 'NOT_FOUND', 'Retour introuvable')

      const actorId = await resolveSystemUserId()
      if (!actorId) return respondError(res, 500, 'NO_SYSTEM_USER', 'Aucun compte système disponible')

      const alreadyLinked = Boolean(run.devIssue)
      try {
        const issue = await promoteRunToIssue({ runId: String(run._id), actorId: String(actorId) })
        res.status(alreadyLinked ? 200 : 201).json(issue.toObject())
      } catch (err) {
        if (err instanceof Error && /favorable/i.test(err.message)) {
          return respondError(res, 400, 'INVALID_STATE', err.message)
        }
        throw err
      }
    } catch (err) {
      next(err)
    }
  },
)

// ─── Fils de discussion ──────────────────────────────────────────────────────

router.get(
  '/beta/runs/:id/comments',
  requireScope('read:beta'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const pag = parsePagination(req)
      const filter = { run: req.params.id }
      const [items, total] = await Promise.all([
        BetaComment.find(filter)
          .populate('authorUser', 'name email')
          .populate('authorTester', 'name')
          .sort({ createdAt: 1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .lean(),
        BetaComment.countDocuments(filter),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/beta/runs/:id/comments',
  requireScope('write:beta'),
  param('id').isMongoId(),
  body('body').isString().trim().notEmpty().withMessage('body requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const run = await BetaRun.findById(req.params.id).select('_id campaign')
      if (!run) return respondError(res, 404, 'NOT_FOUND', 'Retour introuvable')

      const authorUser = await resolveSystemUserId()
      if (!authorUser) return respondError(res, 500, 'NO_SYSTEM_USER', 'Aucun compte système disponible')

      const comment = await BetaComment.create({
        run: run._id,
        campaign: run.campaign,
        authorUser,
        body: readString(req.body.body, 10000),
        visibleToTester: req.body.visibleToTester !== false,
      })
      res.status(201).json(comment.toObject())
    } catch (err) {
      next(err)
    }
  },
)

// ─── Captures ────────────────────────────────────────────────────────────────

/** Même cap que les documents : le base64 gonfle le corps d'environ un tiers. */
const MAX_BASE64_BYTES = Math.ceil((BETA_MAX_ATTACHMENT_BYTES * 4) / 3)

router.post(
  '/beta/runs/:id/attachments',
  requireScope('write:beta'),
  param('id').isMongoId(),
  body('filename').isString().trim().notEmpty().withMessage('filename requis'),
  body('contentBase64').isString().notEmpty().withMessage('contentBase64 requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const run = await BetaRun.findById(req.params.id)
      if (!run) return respondError(res, 404, 'NOT_FOUND', 'Retour introuvable')

      if (String(req.body.contentBase64).length > MAX_BASE64_BYTES) {
        return respondError(res, 413, 'PAYLOAD_TOO_LARGE', 'Capture trop volumineuse')
      }

      const buffer = Buffer.from(String(req.body.contentBase64), 'base64')
      // Comme côté testeur : seuls les octets de tête décident du type réel.
      // SVG reste exclu — c'est du XML capable de porter du script.
      const mimeType = detectImageMimeType(buffer)
      if (!mimeType) {
        return respondError(res, 400, 'UNSUPPORTED_MEDIA', 'Seules les captures PNG, JPEG, GIF ou WebP sont acceptées')
      }

      const quota = checkAttachmentQuota({
        runAttachmentCount: run.attachments.length,
        testerTotalBytes: 0,
        incomingBytes: buffer.length,
      })
      if (!quota.ok) return respondError(res, 400, 'QUOTA_EXCEEDED', quota.reason)

      if (!fs.existsSync(BETA_UPLOAD_DIR)) fs.mkdirSync(BETA_UPLOAD_DIR, { recursive: true })
      const safeName = String(req.body.filename)
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(-80)
      const storagePath = path.join(BETA_UPLOAD_DIR, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`)
      await fs.promises.writeFile(storagePath, buffer)

      const attachment: NewBetaAttachment = {
        originalName: safeName,
        storagePath,
        mimeType,
        size: buffer.length,
        uploadedAt: new Date(),
      }
      run.attachments.push(attachment as BetaAttachment)
      await run.save()

      const saved = run.attachments[run.attachments.length - 1]!
      res.status(201).json({
        _id: saved._id,
        originalName: saved.originalName,
        mimeType: saved.mimeType,
        size: saved.size,
      })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/beta/runs/:id/attachments/:attachmentId',
  requireScope('read:beta'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const run = await BetaRun.findById(req.params.id).select('attachments')
      if (!run) return respondError(res, 404, 'NOT_FOUND', 'Retour introuvable')

      const attachment = run.attachments.find(
        (candidate) => String((candidate as { _id?: unknown })._id) === req.params.attachmentId,
      )
      if (!attachment) return respondError(res, 404, 'NOT_FOUND', 'Capture introuvable')
      if (!fs.existsSync(attachment.storagePath)) {
        return respondError(res, 410, 'FILE_GONE', 'Fichier physique introuvable')
      }

      // Type détecté au dépôt, jamais celui annoncé par l'appelant.
      res.setHeader('Content-Type', attachment.mimeType)
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Disposition', `inline; filename="${attachment.originalName.replace(/"/g, '_')}"`)
      fs.createReadStream(attachment.storagePath).pipe(res)
    } catch (err) {
      next(err)
    }
  },
)

export default router
