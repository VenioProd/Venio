import express, { Request, Response, NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import Project from '../../models/Project.js'
import Task from '../../models/Task.js'
import User from '../../models/User.js'
import Lead from '../../models/Lead.js'
import { PERMISSIONS } from '../../lib/permissions.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET /api/admin/analytics
router.get('/', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

    // Projects by status
    const projectsByStatus = await Project.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ])

    // Projects by priority
    const projectsByPriority = await Project.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ])

    // Tasks by status
    const tasksByStatus = await Task.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ])

    // Tasks by priority
    const tasksByPriority = await Task.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ])

    // Revenue: total invoiced
    const revenueAgg = await Project.aggregate([
      { $match: { 'billing.amountInvoiced': { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$billing.amountInvoiced' } } },
    ])
    const totalRevenue = revenueAgg[0]?.total || 0

    // Revenue this month
    const monthlyRevenueAgg = await Project.aggregate([
      { $match: { 'billing.amountInvoiced': { $gt: 0 }, 'billing.billingStatus': { $in: ['PARTIEL', 'FACTURE'] }, createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$billing.amountInvoiced' } } },
    ])
    const monthlyRevenue = monthlyRevenueAgg[0]?.total || 0

    // Revenue last month
    const lastMonthRevenueAgg = await Project.aggregate([
      { $match: { 'billing.amountInvoiced': { $gt: 0 }, 'billing.billingStatus': { $in: ['PARTIEL', 'FACTURE'] }, createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
      { $group: { _id: null, total: { $sum: '$billing.amountInvoiced' } } },
    ])
    const lastMonthRevenue = lastMonthRevenueAgg[0]?.total || 0

    // Budget total (all projects)
    const budgetAgg = await Project.aggregate([
      { $match: { 'budget.amount': { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$budget.amount' } } },
    ])
    const totalBudget = budgetAgg[0]?.total || 0

    // Client count
    const clientCount = await User.countDocuments({ role: 'CLIENT' })
    const activeClientCount = await User.countDocuments({ role: 'CLIENT', status: 'ACTIF' })

    // Projects created per month (last 6 months)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const projectsPerMonth = await Project.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ])

    // Overdue tasks count
    const overdueTaskCount = await Task.countDocuments({
      status: { $ne: 'TERMINE' },
      dueDate: { $lt: now, $ne: null },
    })

    // Lead stats
    let leadStats = { total: 0, won: 0, lost: 0, active: 0, pipelineValue: 0 }
    try {
      const [total, won, lost, active, pipelineAgg] = await Promise.all([
        Lead.countDocuments(),
        Lead.countDocuments({ status: 'WON' }),
        Lead.countDocuments({ status: 'LOST' }),
        Lead.countDocuments({ status: { $nin: ['WON', 'LOST'] } }),
        Lead.aggregate([
          { $match: { status: { $nin: ['WON', 'LOST'] }, budget: { $gt: 0 } } },
          { $group: { _id: null, total: { $sum: '$budget' } } },
        ]),
      ])
      leadStats = { total, won, lost, active, pipelineValue: pipelineAgg[0]?.total || 0 }
    } catch {
      // Lead model may not exist
    }

    return res.json({
      projectsByStatus: Object.fromEntries(projectsByStatus.map((p) => [p._id, p.count])),
      projectsByPriority: Object.fromEntries(projectsByPriority.map((p) => [p._id, p.count])),
      tasksByStatus: Object.fromEntries(tasksByStatus.map((t) => [t._id, t.count])),
      tasksByPriority: Object.fromEntries(tasksByPriority.map((t) => [t._id, t.count])),
      totalRevenue,
      monthlyRevenue,
      lastMonthRevenue,
      totalBudget,
      clientCount,
      activeClientCount,
      projectsPerMonth,
      overdueTaskCount,
      leadStats,
    })
  } catch (err) {
    return next(err)
  }
})

export default router
