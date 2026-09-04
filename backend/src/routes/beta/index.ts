import express, { type Request, type Response, type NextFunction } from 'express'
import fs from 'fs'
import mongoose from 'mongoose'
import rateLimit from 'express-rate-limit'
import BetaScenario from '../../models/BetaScenario.js'
import BetaRun, {
  BETA_REPRODUCIBILITIES,
  BETA_SEVERITIES,
  BETA_VERDICTS,
  type BetaAttachment,
  type NewBetaAttachment,
} from '../../models/BetaRun.js'
import BetaComment from '../../models/BetaComment.js'
import { requireBetaTester } from '../../lib/beta/testerAuth.js'
import { refreshScenarioSummary } from '../../lib/beta/promote.js'
import { notifyBlockingFeedback } from '../../lib/beta/notify.js'
import { serializeCommentsForTester, serializeRunsForTester } from '../../lib/beta/serialize.js'
import {
  BETA_MAX_ATTACHMENTS_PER_RUN,
  betaUpload,
  checkAttachmentQuota,
  discardUpload,
  inspectUploadedImage,
} from '../../lib/beta/uploads.js'

const router = express.Router()

/**
 * Surface publique : l'identité tient dans une URL, donc on limite le débit
 * pour qu'un lien fuité ou un script ne puisse ni marteler ni balayer l'espace
 * de jetons.
 */
const testerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans une minute' },
})

router.use('/:token', testerLimiter, requireBetaTester)

const isObjectId = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v)

function readNumber(raw: unknown, max: number): number | null {
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 && value <= max ? Math.round(value) : null
}

/** Le contexte vient pour partie du client, pour partie de la requête. */
function captureContext(req: Request) {
  const body = req.body ?? {}
  return {
    url: typeof body.url === 'string' ? body.url.slice(0, 500) : null,
    userAgent: (req.get('user-agent') ?? '').slice(0, 500) || null,
    viewportWidth: readNumber(body.viewportWidth, 100000),
    viewportHeight: readNumber(body.viewportHeight, 100000),
    isMobile: typeof body.isMobile === 'boolean' ? body.isMobile : null,
  }
}

async function listRunsForTester(campaignId: mongoose.Types.ObjectId, viewerId: string) {
  const runs = await BetaRun.find({ campaign: campaignId }).sort({ createdAt: -1 }).lean()
  return serializeRunsForTester(runs as never, viewerId)
}

// GET /api/beta/:token — tout ce que le testeur peut voir de la campagne.
router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tester, campaign } = req.betaTester!
    const scenarios = await BetaScenario.find({ campaign: campaign._id, archivedAt: null })
      .sort({ rank: 1, number: 1 })
      .select('identifier title description steps summaryStatus')
      .lean()

    return res.json({
      tester: { name: tester.name },
      campaign: {
        name: campaign.name,
        description: campaign.description,
        targetUrl: campaign.targetUrl,
        endsAt: campaign.endsAt,
      },
      scenarios,
      runs: await listRunsForTester(campaign._id, String(tester._id)),
    })
  } catch (err) {
    return next(err)
  }
})

// POST /api/beta/:token/scenarios/:scenarioId/runs — dépose ou révise un verdict.
router.post('/:token/scenarios/:scenarioId/runs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tester, campaign } = req.betaTester!
    const { scenarioId } = req.params
    if (!isObjectId(scenarioId)) return res.status(404).json({ error: 'Démarche introuvable' })

    // Le rattachement à la campagne du jeton est vérifié ici, sans quoi un
    // testeur pourrait voter sur la campagne d'un autre client.
    const scenario = await BetaScenario.findOne({
      _id: scenarioId,
      campaign: campaign._id,
      archivedAt: null,
    }).select('_id')
    if (!scenario) return res.status(404).json({ error: 'Démarche introuvable' })

    const body = req.body ?? {}
    if (!(BETA_VERDICTS as readonly string[]).includes(body.verdict)) {
      return res.status(400).json({ error: 'Verdict invalide' })
    }
    const severity =
      body.verdict !== 'WORKS' && (BETA_SEVERITIES as readonly string[]).includes(body.severity) ? body.severity : null
    const reproducibility =
      body.verdict !== 'WORKS' && (BETA_REPRODUCIBILITIES as readonly string[]).includes(body.reproducibility)
        ? body.reproducibility
        : null

    const payload = {
      verdict: body.verdict,
      severity,
      reproducibility,
      failedStep: readNumber(body.failedStep, 40) || null,
      title: typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '',
      body: typeof body.body === 'string' ? body.body.trim().slice(0, 10000) : '',
      context: captureContext(req),
    }

    const existing = await BetaRun.findOne({ scenario: scenario._id, tester: tester._id })
    let run = existing
    if (run) {
      Object.assign(run, payload)
      // Une révision rouvre le retour : le statut précédent parlait d'un
      // état que le testeur vient de contredire.
      run.status = 'OPEN'
      await run.save()
    } else {
      run = await BetaRun.create({
        campaign: campaign._id,
        scenario: scenario._id,
        tester: tester._id,
        ...payload,
      })
    }

    await refreshScenarioSummary(scenario._id)
    await notifyBlockingFeedback(run, campaign, tester.name)

    const [view] = serializeRunsForTester([run.toObject() as never], String(tester._id))
    return res.status(existing ? 200 : 201).json({ run: view })
  } catch (err) {
    return next(err)
  }
})

// POST /api/beta/:token/runs/:runId/confirm — « j'ai le même souci ».
router.post('/:token/runs/:runId/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tester, campaign } = req.betaTester!
    const { runId } = req.params
    if (!isObjectId(runId)) return res.status(404).json({ error: 'Retour introuvable' })

    const run = await BetaRun.findOne({ _id: runId, campaign: campaign._id })
    if (!run) return res.status(404).json({ error: 'Retour introuvable' })
    if (run.tester && String(run.tester) === String(tester._id)) {
      return res.status(400).json({ error: 'On ne confirme pas son propre retour' })
    }

    // $addToSet : la confirmation est une adhésion, pas un compteur qu'on
    // incrémente à chaque clic.
    await BetaRun.updateOne({ _id: run._id }, { $addToSet: { confirmations: tester._id } })

    const updated = await BetaRun.findById(run._id).lean()
    const [view] = serializeRunsForTester([updated as never], String(tester._id))
    return res.json({ run: view })
  } catch (err) {
    return next(err)
  }
})

/** Charge un retour appartenant au porteur du lien, ou rien. */
async function findOwnRun(req: Request) {
  const { tester, campaign } = req.betaTester!
  const { runId } = req.params
  if (!isObjectId(runId)) return null
  return BetaRun.findOne({ _id: runId, campaign: campaign._id, tester: tester._id })
}

// GET/POST /api/beta/:token/runs/:runId/comments — le fil de son propre retour.
router.get('/:token/runs/:runId/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const run = await findOwnRun(req)
    if (!run) return res.status(404).json({ error: 'Retour introuvable' })
    const comments = await BetaComment.find({ run: run._id }).sort({ createdAt: 1 }).lean()
    return res.json({
      comments: serializeCommentsForTester(comments as never, String(req.betaTester!.tester._id)),
    })
  } catch (err) {
    return next(err)
  }
})

router.post('/:token/runs/:runId/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const run = await findOwnRun(req)
    if (!run) return res.status(404).json({ error: 'Retour introuvable' })

    const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 10000) : ''
    if (!body) return res.status(400).json({ error: 'Le message est vide' })

    const comment = await BetaComment.create({
      run: run._id,
      campaign: run.campaign,
      authorTester: req.betaTester!.tester._id,
      body,
    })
    const [view] = serializeCommentsForTester([comment.toObject() as never], String(req.betaTester!.tester._id))
    return res.status(201).json({ comment: view })
  } catch (err) {
    return next(err)
  }
})

// POST /api/beta/:token/runs/:runId/attachments — capture d'écran.
router.post(
  '/:token/runs/:runId/attachments',
  betaUpload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    const file = req.file as Express.Multer.File | undefined
    try {
      const run = await findOwnRun(req)
      if (!run) {
        if (file) discardUpload(file.path)
        return res.status(404).json({ error: 'Retour introuvable' })
      }
      if (!file) return res.status(400).json({ error: 'Aucun fichier fourni' })

      // Le type annoncé par le navigateur ne décide de rien : seuls les
      // octets de tête disent ce que le fichier est réellement.
      const mimeType = inspectUploadedImage(file.path)
      if (!mimeType) {
        discardUpload(file.path)
        return res.status(400).json({ error: 'Seules les captures PNG, JPEG, GIF ou WebP sont acceptées' })
      }

      const testerRuns = await BetaRun.find({
        campaign: run.campaign,
        tester: req.betaTester!.tester._id,
      })
        .select('attachments')
        .lean()
      const testerTotalBytes = testerRuns
        .flatMap((other) => other.attachments ?? [])
        .reduce((total, attachment) => total + attachment.size, 0)

      const quota = checkAttachmentQuota({
        runAttachmentCount: run.attachments.length,
        testerTotalBytes,
        incomingBytes: file.size,
      })
      if (!quota.ok) {
        discardUpload(file.path)
        return res.status(400).json({ error: quota.reason })
      }

      const attachment: NewBetaAttachment = {
        originalName: file.originalname.slice(0, 300),
        storagePath: file.path,
        mimeType,
        size: file.size,
        uploadedAt: new Date(),
      }
      run.attachments.push(attachment as BetaAttachment)
      await run.save()

      return res.status(201).json({
        attachments: run.attachments.map((attachment) => ({
          _id: attachment._id,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          size: attachment.size,
        })),
      })
    } catch (err) {
      if (file) discardUpload(file.path)
      return next(err)
    }
  },
)

// GET /api/beta/:token/runs/:runId/attachments/:attachmentId
router.get('/:token/runs/:runId/attachments/:attachmentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const run = await findOwnRun(req)
    if (!run) return res.status(404).json({ error: 'Capture introuvable' })

    const attachment = run.attachments.find(
      (candidate) => String((candidate as { _id?: unknown })._id) === req.params.attachmentId,
    )
    if (!attachment || !fs.existsSync(attachment.storagePath)) {
      return res.status(404).json({ error: 'Capture introuvable' })
    }

    // Le type servi est celui que le serveur a détecté, jamais celui annoncé
    // à l'upload — et `nosniff` empêche le navigateur de réinterpréter.
    res.setHeader('Content-Type', attachment.mimeType)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    res.setHeader('Cache-Control', 'private, max-age=300')
    return fs.createReadStream(attachment.storagePath).pipe(res)
  } catch (err) {
    return next(err)
  }
})

export default router
