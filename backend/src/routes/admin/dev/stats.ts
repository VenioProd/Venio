import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { computeStats, computeOverview, computeProjectCockpit } from '../../../lib/dev/stats.js'
import { computeDailyPriorities } from '../../../lib/dev/dailyPriorities.js'
import DevIssue from '../../../models/DevIssue.js'
import DevIssueComment from '../../../models/DevIssueComment.js'
import DevProject from '../../../models/DevProject.js'
import { getCachedProjectCodeMetrics, refreshProjectCodeMetrics } from '../../../lib/dev/codeMetrics.js'
import { computeProjectGithubSummary } from '../../../lib/dev/githubSummary.js'
import { computeProjectDeploymentSummary } from '../../../lib/dev/deploymentSummary.js'
import { computeProjectTokensSnapshot } from '../../../lib/dev/tokens.js'
import { computeProjectRecommendations, invalidateRecommendationsCache } from '../../../lib/dev/recommendations.js'

const router = express.Router()

router.get(
  '/stats',
  requirePermission(PERMISSIONS.VIEW_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const match: Record<string, unknown> = {}
      const { project } = req.query
      if (typeof project === 'string' && mongoose.isValidObjectId(project)) {
        match.project = new mongoose.Types.ObjectId(project)
      }
      const stats = await computeStats(match)
      res.json(stats)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/overview',
  requirePermission(PERMISSIONS.VIEW_DEV),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const overview = await computeOverview()
      res.json(overview)
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/priorities',
  requirePermission(PERMISSIONS.VIEW_DEV),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await computeDailyPriorities())
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/projects/:id/dashboard',
  requirePermission(PERMISSIONS.VIEW_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id
      if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
        return res.status(400).json({ error: 'ID invalide' })
      }
      const payload = await computeProjectCockpit(id)
      if (!payload) return res.status(404).json({ error: 'Projet introuvable' })
      res.json(payload)
    } catch (err) {
      next(err)
    }
  },
)

/**
 * Project intelligence — aggregates the supplementary panels the cockpit needs
 * but that are too expensive (or unrelated) to compute on every dashboard load:
 *
 *   - github summary (links + PR list from issues)
 *   - tokens usage snapshot (placeholder until LLM telemetry lands)
 *   - code metrics (LoC by extension + large-files refactor candidates)
 *
 * Frontend may pass ?refresh=1 to queue a new periodic snapshot. This route
 * always serves the last cache value and never runs a filesystem/git scan.
 */
router.get(
  '/projects/:id/intelligence',
  requirePermission(PERMISSIONS.VIEW_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id
      if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
        return res.status(400).json({ error: 'ID invalide' })
      }
      const project = await DevProject.findById(id).lean()
      if (!project) return res.status(404).json({ error: 'Projet introuvable' })

      const refresh = req.query.refresh === '1' || req.query.refresh === 'true'
      if (refresh) void refreshProjectCodeMetrics(project.github ?? null)

      const [github, code, deployment] = await Promise.all([
        computeProjectGithubSummary({ _id: project._id, github: project.github ?? null }),
        Promise.resolve(getCachedProjectCodeMetrics(project.github ?? null)),
        computeProjectDeploymentSummary({ _id: project._id, github: project.github ?? null }),
      ])
      const tokens = computeProjectTokensSnapshot({
        _id: project._id,
        key: project.key,
        github: project.github ?? null,
      })

      res.json({
        projectId: String(project._id),
        github,
        deployment,
        tokens,
        code,
        generatedAt: new Date().toISOString(),
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * Lightweight endpoint dedicated to the auto-refreshing large-files panel.
 * Returns just the refactor candidates (sorted by criticality) and the scan
 * metadata so the UI can show "scanné il y a … s".
 */
router.get(
  '/projects/:id/large-files',
  requirePermission(PERMISSIONS.VIEW_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id
      if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
        return res.status(400).json({ error: 'ID invalide' })
      }
      const project = await DevProject.findById(id).lean()
      if (!project) return res.status(404).json({ error: 'Projet introuvable' })

      const refresh = req.query.refresh === '1' || req.query.refresh === 'true'
      if (refresh) void refreshProjectCodeMetrics(project.github ?? null)
      const code = getCachedProjectCodeMetrics(project.github ?? null)
      res.json({
        projectId: String(project._id),
        available: code.available,
        source: code.source,
        scannedAt: code.scannedAt,
        durationMs: code.durationMs,
        reason: code.reason,
        largeFiles: code.largeFiles,
        totals: code.totals,
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * Recommendations — heuristic module qui agrège dans une seule réponse les
 * éléments actionnables d'un projet : features à améliorer, features à ajouter,
 * optimisations, fichiers volumineux. Refresh automatique côté serveur via un
 * cache TTL ~6h (refresh=1 force un recalcul).
 */
router.get(
  '/projects/:id/recommendations',
  requirePermission(PERMISSIONS.VIEW_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id
      if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
        return res.status(400).json({ error: 'ID invalide' })
      }
      const force = req.query.refresh === '1' || req.query.refresh === 'true'
      if (force) invalidateRecommendationsCache(id)
      const payload = await computeProjectRecommendations(id, { force })
      if (!payload) return res.status(404).json({ error: 'Projet introuvable' })
      res.json(payload)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/admin/dev/activity?limit=30 — feed d'activité (issues créées/terminées + commentaires)
router.get(
  '/activity',
  requirePermission(PERMISSIONS.VIEW_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limitRaw = Number(req.query.limit)
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? Math.floor(limitRaw) : 30

      const projectFilter: Record<string, unknown> = {}
      if (typeof req.query.project === 'string' && mongoose.isValidObjectId(req.query.project)) {
        projectFilter.project = new mongoose.Types.ObjectId(req.query.project)
      }

      const [createdIssues, completedIssues, comments] = await Promise.all([
        DevIssue.find(projectFilter)
          .populate('reporter', 'name email avatarUrl')
          .populate('project', 'key name color')
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean(),
        DevIssue.find({ ...projectFilter, status: 'DONE', completedAt: { $ne: null } })
          .populate('assignee', 'name email avatarUrl')
          .populate('project', 'key name color')
          .sort({ completedAt: -1 })
          .limit(limit)
          .lean(),
        DevIssueComment.find(projectFilter)
          .populate('author', 'name email avatarUrl')
          .populate({
            path: 'issue',
            select: 'identifier title number project',
            populate: { path: 'project', select: 'key name color' },
          })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean(),
      ])

      type Entry = {
        kind: 'created' | 'completed' | 'comment'
        at: string
        user: { _id: string; name?: string; email?: string; avatarUrl?: string } | null
        issue: { _id: string; identifier: string; number: number; title: string }
        project: { _id: string; key: string; name: string; color?: string } | null
        body?: string
      }

      const entries: Entry[] = []

      for (const i of createdIssues) {
        entries.push({
          kind: 'created',
          at: (i.createdAt as Date).toISOString(),
          user: (i.reporter as any) || null,
          issue: { _id: String(i._id), identifier: i.identifier, number: i.number, title: i.title },
          project: (i.project as any) || null,
        })
      }
      for (const i of completedIssues) {
        if (!i.completedAt) continue
        entries.push({
          kind: 'completed',
          at: (i.completedAt as Date).toISOString(),
          user: (i.assignee as any) || null,
          issue: { _id: String(i._id), identifier: i.identifier, number: i.number, title: i.title },
          project: (i.project as any) || null,
        })
      }
      for (const c of comments) {
        const issue: any = c.issue
        if (!issue) continue
        entries.push({
          kind: 'comment',
          at: (c.createdAt as Date).toISOString(),
          user: (c.author as any) || null,
          issue: { _id: String(issue._id), identifier: issue.identifier, number: issue.number, title: issue.title },
          project: (issue.project as any) || null,
          body: c.body?.slice(0, 240),
        })
      }

      entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      res.json({ entries: entries.slice(0, limit) })
    } catch (err) {
      next(err)
    }
  },
)

export default router
