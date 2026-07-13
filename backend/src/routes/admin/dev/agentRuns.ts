import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { requireSuperAdmin } from '../../../middleware/role.js'
import DevAgentRun, { type DevAgentRunStatus, type IDevAgentRun } from '../../../models/DevAgentRun.js'
import DevIssue from '../../../models/DevIssue.js'
import DevIssueComment from '../../../models/DevIssueComment.js'
import DevProject from '../../../models/DevProject.js'
import { computeProjectRecommendations } from '../../../lib/dev/recommendations.js'
import { recordIssueEvent } from '../../../lib/dev/issueMutations.js'
import {
  buildDevAgentRunContext,
  getDevAgentBridge,
  isValidDevAgentIdempotencyKey,
  launchFingerprint,
  projectLaunchAvailability,
  type DevAgentRunContext,
} from '../../../lib/dev/agentLaunch.js'

const router = express.Router()
const CLOSED_STATUSES = new Set(['DONE', 'DUPLICATE', 'CANCELLED'])

function validId(value: unknown): value is string {
  return typeof value === 'string' && mongoose.isValidObjectId(value)
}

function headerValue(req: Request, name: string): string | null {
  const raw = req.headers[name]
  return Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null)
}

function runResponse(run: IDevAgentRun, replayed = false) {
  return {
    executionId: String(run._id),
    status: run.status,
    bridgeExecutionId: run.bridgeExecutionId,
    target: run.target,
    replayed,
  }
}

async function traceRun(input: {
  run: IDevAgentRun
  actor: string | null
  event: 'agent_started' | 'agent_blocked' | 'agent_done'
  summary: string
  comment: string
}): Promise<void> {
  await DevIssueComment.create({
    issue: input.run.issue,
    project: input.run.project,
    author: input.actor,
    body: input.comment.slice(0, 10_000),
  })
  await recordIssueEvent({
    issue: input.run.issue,
    project: input.run.project,
    actor: input.actor,
    type: input.event,
    summary: input.summary,
    metadata: {
      executionId: String(input.run._id),
      status: input.run.status,
      target: input.run.target,
      recommendationId: input.run.recommendationId,
    },
  })
}

/**
 * Shared status writer for a future authenticated bridge callback/queue worker.
 * There is intentionally no browser-facing status endpoint: only a trusted
 * server-side adapter may call this function.
 */
export async function recordDevAgentRunStatus(
  runId: string,
  status: Extract<DevAgentRunStatus, 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'DISPATCH_FAILED'>,
  detail?: string,
): Promise<void> {
  const run = await DevAgentRun.findById(runId)
  if (!run || run.status === status) return
  run.status = status
  run.failureCode = status === 'FAILED' || status === 'DISPATCH_FAILED' ? 'BRIDGE_DISPATCH_FAILED' : null
  await run.save()
  const succeeded = status === 'SUCCEEDED'
  await traceRun({
    run,
    // DevIssueComment requires a concrete author. Until a dedicated service
    // actor exists, retain the initiating super-admin as the audit author.
    actor: String(run.requestedBy),
    event: succeeded ? 'agent_done' : status === 'RUNNING' ? 'agent_started' : 'agent_blocked',
    summary: `Exécution agent ${String(run._id)} : ${status}`,
    comment: `Exécution agent ${String(run._id)} · état ${status}.${detail ? ` ${detail.slice(0, 800)}` : ''}`,
  })
}

function dispatchInBackground(run: IDevAgentRun, context: DevAgentRunContext): void {
  void getDevAgentBridge()
    .dispatch({ runId: String(run._id), target: run.target!, context })
    .then(async ({ bridgeExecutionId }) => {
      await DevAgentRun.updateOne(
        { _id: run._id, status: 'QUEUED' },
        { $set: { status: 'DISPATCHED', bridgeExecutionId } },
      )
    })
    .catch(async () => {
      await recordDevAgentRunStatus(String(run._id), 'DISPATCH_FAILED', 'Le bridge n’a pas accepté la tâche.')
    })
}

router.get(
  '/projects/:id/agent-launch/availability',
  requireSuperAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validId(req.params.id)) return res.status(400).json({ error: 'ID projet invalide' })
      const project = await DevProject.findById(req.params.id).select('_id github status').lean()
      if (!project) return res.status(404).json({ error: 'Projet introuvable' })
      const availability = projectLaunchAvailability(project)
      const github = project.github
      res.json({
        ...availability,
        scope:
          availability.available && github?.owner && github.repo && github.defaultBranch
            ? { repository: `${github.owner}/${github.repo}`, baseBranch: github.defaultBranch }
            : null,
      })
    } catch (error) {
      next(error)
    }
  },
)

router.post('/projects/:id/agent-runs', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id) || !validId(req.body?.issueId)) {
      return res.status(400).json({ error: 'project et issueId valides sont requis' })
    }
    const idempotencyKey = headerValue(req, 'idempotency-key')
    if (!isValidDevAgentIdempotencyKey(idempotencyKey)) {
      return res.status(400).json({ error: 'Header Idempotency-Key invalide ou manquant' })
    }
    const recommendationId =
      typeof req.body?.recommendationId === 'string' ? req.body.recommendationId.slice(0, 160) : null
    const fingerprint = launchFingerprint(req.body.issueId, recommendationId)
    const requestedBy = req.user!.id

    const existing = await DevAgentRun.findOne({ requestedBy, idempotencyKey })
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        return res.status(409).json({ error: 'Cette clé d’idempotence correspond à une autre demande.' })
      }
      return res.status(existing.status === 'BRIDGE_UNAVAILABLE' ? 503 : 202).json(runResponse(existing, true))
    }

    const [project, issue] = await Promise.all([
      DevProject.findById(req.params.id),
      DevIssue.findOne({ _id: req.body.issueId, project: req.params.id, archivedAt: null }),
    ])
    if (!project) return res.status(404).json({ error: 'Projet introuvable' })
    if (!issue) return res.status(404).json({ error: 'Issue introuvable pour ce projet' })
    if (CLOSED_STATUSES.has(issue.status))
      return res.status(409).json({ error: 'Une issue clôturée ne peut pas être lancée.' })

    const availability = projectLaunchAvailability(project)
    let recommendation: { id: string; title: string; description: string; source: string } | null = null
    if (recommendationId) {
      const payload = await computeProjectRecommendations(String(project._id))
      const item =
        payload &&
        Object.values(payload.sections)
          .flat()
          .find((candidate) => candidate.id === recommendationId)
      const linkedToIssue = item?.actions.some(
        (action) => action.kind === 'open_issue' && action.issueId === String(issue._id),
      )
      if (!item || !linkedToIssue) {
        return res.status(409).json({ error: 'La recommandation ne correspond plus à cette issue.' })
      }
      recommendation = { id: item.id, title: item.title, description: item.description, source: item.source }
    }

    const context = buildDevAgentRunContext({ project, issue, recommendation })
    const run = await DevAgentRun.create({
      project: project._id,
      issue: issue._id,
      recommendationId,
      requestedBy,
      idempotencyKey,
      requestFingerprint: fingerprint,
      target: availability.target,
      status: availability.available ? 'QUEUED' : 'BRIDGE_UNAVAILABLE',
      failureCode: availability.available ? null : 'BRIDGE_UNAVAILABLE',
      context,
    })

    if (!availability.available) {
      await traceRun({
        run,
        actor: requestedBy,
        event: 'agent_blocked',
        summary: `${issue.identifier} · lancement agent indisponible`,
        comment: `Lancement agent non effectué (${String(run._id)}) : ${availability.reason ?? 'bridge indisponible'}`,
      })
      return res.status(503).json(runResponse(run))
    }

    await traceRun({
      run,
      actor: requestedBy,
      event: 'agent_started',
      summary: `${issue.identifier} · agent ${run.target!.agent}/${run.target!.model} lancé`,
      comment: `Agent ${run.target!.agent} (${run.target!.model}) lancé · exécution ${String(run._id)} · dépôt ${context.repository.fullName} · branche ${context.repository.baseBranch}.`,
    })
    dispatchInBackground(run, context)
    return res.status(202).json(runResponse(run))
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 11000) {
      const idempotencyKey = headerValue(req, 'idempotency-key')
      const existing = idempotencyKey ? await DevAgentRun.findOne({ requestedBy: req.user!.id, idempotencyKey }) : null
      if (existing) return res.status(202).json(runResponse(existing, true))
    }
    next(error)
  }
})

export default router
