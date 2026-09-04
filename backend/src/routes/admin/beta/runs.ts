import express, { type Request, type Response, type NextFunction } from 'express'
import fs from 'fs'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import BetaRun, { BETA_RUN_STATUSES, type BetaSeverity } from '../../../models/BetaRun.js'
import BetaComment from '../../../models/BetaComment.js'
import { promoteRunToIssue, refreshScenarioSummary } from '../../../lib/beta/promote.js'
import { isObjectId, loadCampaign, readString } from './shared.js'

const router = express.Router()

/**
 * Ordre de tri de la file : d'abord la gravité, puis le nombre de testeurs qui
 * confirment. C'est l'ordre dans lequel on veut traiter, pas l'ordre d'arrivée.
 */
const SEVERITY_WEIGHT: Record<BetaSeverity, number> = {
  BLOCKER: 0,
  MAJOR: 1,
  MINOR: 2,
  COSMETIC: 3,
}

const OPEN_STATUSES = ['OPEN', 'ACKNOWLEDGED']

// GET /api/admin/beta/campaigns/:campaignId/runs
router.get(
  '/campaigns/:campaignId/runs',
  requirePermission(PERMISSIONS.VIEW_BETA),
  loadCampaign,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = { campaign: req.betaCampaign!._id }
      const { status, verdict, scenario } = req.query
      if (status === 'open') filter.status = { $in: OPEN_STATUSES }
      else if (typeof status === 'string' && (BETA_RUN_STATUSES as readonly string[]).includes(status)) {
        filter.status = status
      }
      if (typeof verdict === 'string' && ['WORKS', 'BROKEN', 'TO_OPTIMIZE'].includes(verdict)) {
        filter.verdict = verdict
      }
      if (isObjectId(scenario)) filter.scenario = scenario

      const runs = await BetaRun.find(filter)
        .populate('tester', 'name email')
        .populate('user', 'name email')
        .populate('scenario', 'identifier title')
        .populate('devIssue', 'identifier title status')
        .lean()

      runs.sort((a, b) => {
        const bySeverity =
          (a.severity ? SEVERITY_WEIGHT[a.severity] : 9) - (b.severity ? SEVERITY_WEIGHT[b.severity] : 9)
        if (bySeverity !== 0) return bySeverity
        const byConfirmations = (b.confirmations?.length ?? 0) - (a.confirmations?.length ?? 0)
        if (byConfirmations !== 0) return byConfirmations
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })

      return res.json({
        runs: runs.map((run) => ({
          ...run,
          confirmationCount: run.confirmations?.length ?? 0,
          attachments: (run.attachments ?? []).map((attachment) => ({
            _id: (attachment as { _id?: unknown })._id,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            size: attachment.size,
          })),
        })),
      })
    } catch (err) {
      return next(err)
    }
  },
)

/** Charge un retour par son identifiant, ou répond 404. */
async function loadRun(req: Request, res: Response) {
  const { runId } = req.params
  if (!isObjectId(runId)) {
    res.status(400).json({ error: 'Identifiant invalide' })
    return null
  }
  const run = await BetaRun.findById(runId)
  if (!run) {
    res.status(404).json({ error: 'Retour introuvable' })
    return null
  }
  return run
}

// PATCH /api/admin/beta/runs/:runId — statut de traitement.
router.patch(
  '/runs/:runId',
  requirePermission(PERMISSIONS.MANAGE_BETA),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const run = await loadRun(req, res)
      if (!run) return undefined

      const { status } = req.body ?? {}
      if (!(BETA_RUN_STATUSES as readonly string[]).includes(status)) {
        return res.status(400).json({ error: 'Statut de retour invalide' })
      }

      run.status = status
      await run.save()
      // Le statut affiché de la démarche découle des verdicts : le recalculer
      // ici évite qu'il reste rouge après un classement sans suite.
      await refreshScenarioSummary(run.scenario)

      return res.json({ run })
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/admin/beta/runs/:runId/promote — ouvre l'issue liée.
router.post(
  '/runs/:runId/promote',
  requirePermission(PERMISSIONS.MANAGE_BETA),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const run = await loadRun(req, res)
      if (!run) return undefined

      const alreadyLinked = Boolean(run.devIssue)
      try {
        const issue = await promoteRunToIssue({ runId: String(run._id), actorId: req.user!.id })
        return res.status(alreadyLinked ? 200 : 201).json({ issue })
      } catch (err) {
        // Seul le refus métier se traduit en 400 ; le reste reste une erreur
        // serveur, qu'on ne veut pas maquiller.
        if (err instanceof Error && /favorable/i.test(err.message)) {
          return res.status(400).json({ error: err.message })
        }
        throw err
      }
    } catch (err) {
      return next(err)
    }
  },
)

// GET/POST /api/admin/beta/runs/:runId/comments
router.get(
  '/runs/:runId/comments',
  requirePermission(PERMISSIONS.VIEW_BETA),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const run = await loadRun(req, res)
      if (!run) return undefined
      const comments = await BetaComment.find({ run: run._id })
        .populate('authorUser', 'name email')
        .populate('authorTester', 'name')
        .sort({ createdAt: 1 })
        .lean()
      return res.json({ comments })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/runs/:runId/comments',
  requirePermission(PERMISSIONS.MANAGE_BETA),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const run = await loadRun(req, res)
      if (!run) return undefined

      const body = readString(req.body?.body, 10000)
      if (!body) return res.status(400).json({ error: 'Le message est vide' })

      const comment = await BetaComment.create({
        run: run._id,
        campaign: run.campaign,
        authorUser: req.user!.id,
        body,
        visibleToTester: req.body?.visibleToTester !== false,
      })
      return res.status(201).json({ comment })
    } catch (err) {
      return next(err)
    }
  },
)

// GET /api/admin/beta/runs/:runId/attachments/:attachmentId
router.get(
  '/runs/:runId/attachments/:attachmentId',
  requirePermission(PERMISSIONS.VIEW_BETA),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const run = await loadRun(req, res)
      if (!run) return undefined

      const attachment = run.attachments.find(
        (candidate) => String((candidate as { _id?: unknown })._id) === req.params.attachmentId,
      )
      if (!attachment || !fs.existsSync(attachment.storagePath)) {
        return res.status(404).json({ error: 'Capture introuvable' })
      }

      // Même précaution que côté testeur : type détecté au dépôt, `nosniff`,
      // et une CSP qui neutralise le document si le navigateur s'égarait.
      res.setHeader('Content-Type', attachment.mimeType)
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
      return fs.createReadStream(attachment.storagePath).pipe(res)
    } catch (err) {
      return next(err)
    }
  },
)

export default router
