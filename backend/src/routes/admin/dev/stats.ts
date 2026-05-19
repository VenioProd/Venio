import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { computeStats, computeOverview, computeProjectCockpit } from '../../../lib/dev/stats.js'
import DevProject from '../../../models/DevProject.js'
import {
  computeProjectCodeMetrics,
  invalidateCodeMetricsCache,
  resolveRepoPath,
} from '../../../lib/dev/codeMetrics.js'
import { computeProjectGithubSummary } from '../../../lib/dev/githubSummary.js'
import { computeProjectTokensSnapshot } from '../../../lib/dev/tokens.js'

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
  }
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
  }
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
  }
)

/**
 * Project intelligence — aggregates the supplementary panels the cockpit needs
 * but that are too expensive (or unrelated) to compute on every dashboard load:
 *
 *   - github summary (links + PR list from issues)
 *   - tokens usage snapshot (placeholder until LLM telemetry lands)
 *   - code metrics (LoC by extension + large-files refactor candidates)
 *
 * Frontend may pass ?refresh=1 to bypass the code-metrics cache.
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

      const force = req.query.refresh === '1' || req.query.refresh === 'true'
      if (force) invalidateCodeMetricsCache()

      const [github, code] = await Promise.all([
        computeProjectGithubSummary({ _id: project._id, github: project.github ?? null }),
        Promise.resolve(
          computeProjectCodeMetrics(project.github ?? null, { force })
        ),
      ])
      const tokens = computeProjectTokensSnapshot({
        _id: project._id,
        key: project.key,
        github: project.github ?? null,
      })

      res.json({
        projectId: String(project._id),
        github,
        tokens,
        code,
        generatedAt: new Date().toISOString(),
      })
    } catch (err) {
      next(err)
    }
  }
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

      const force = req.query.refresh === '1' || req.query.refresh === 'true'
      const { resolved } = resolveRepoPath(project.github ?? null)
      if (force && resolved) invalidateCodeMetricsCache(resolved)

      const code = computeProjectCodeMetrics(project.github ?? null, { force })
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
  }
)

export default router
