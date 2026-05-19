import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { computeStats, computeOverview, computeProjectCockpit } from '../../../lib/dev/stats.js'

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

export default router
