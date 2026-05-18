import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import DevIssue, { DEV_ISSUE_STATUSES, DEV_ISSUE_PRIORITIES } from '../../../models/DevIssue.js'
import DevProject from '../../../models/DevProject.js'

const router = express.Router()

// GET /api/admin/dev/stats — vue d'ensemble (filtrable par projet)
router.get('/stats', requirePermission(PERMISSIONS.VIEW_DEV), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const match: Record<string, unknown> = {}
    const { project } = req.query
    if (typeof project === 'string' && mongoose.isValidObjectId(project)) {
      match.project = new mongoose.Types.ObjectId(project)
    }

    const [byStatus, byPriority, total, openCount, totalProjects] = await Promise.all([
      DevIssue.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      DevIssue.aggregate([{ $match: match }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
      DevIssue.countDocuments(match),
      DevIssue.countDocuments({ ...match, status: { $nin: ['DONE', 'CANCELLED'] } }),
      DevProject.countDocuments({ status: { $ne: 'ARCHIVED' } }),
    ])

    // Issues complétées sur les 14 derniers jours pour un mini-trend
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    const completedRecent = await DevIssue.countDocuments({
      ...match,
      status: 'DONE',
      completedAt: { $gte: since },
    })

    const statusMap: Record<string, number> = {}
    for (const s of DEV_ISSUE_STATUSES) statusMap[s] = 0
    for (const row of byStatus) statusMap[row._id] = row.count

    const priorityMap: Record<string, number> = {}
    for (const p of DEV_ISSUE_PRIORITIES) priorityMap[p] = 0
    for (const row of byPriority) priorityMap[row._id] = row.count

    res.json({
      total,
      open: openCount,
      completedRecent,
      totalProjects,
      byStatus: statusMap,
      byPriority: priorityMap,
    })
  } catch (err) {
    next(err)
  }
})

export default router
