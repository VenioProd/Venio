import express, { Request, Response, NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import Task from '../../models/Task.js'
import Project from '../../models/Project.js'
import User from '../../models/User.js'
import Lead from '../../models/Lead.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET /api/admin/dashboard — aggregated stats for the dashboard
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const now = new Date()

    // My tasks (assigned to me, not done)
    const myTasks = await Task.find({ assignee: userId, status: { $ne: 'TERMINE' } })
      .sort({ priority: -1, dueDate: 1 })
      .limit(10)
      .populate('project', 'name')

    // Overdue tasks (all, with dueDate in the past and not done)
    const overdueTasks = await Task.find({
      status: { $ne: 'TERMINE' },
      dueDate: { $lt: now, $ne: null },
    })
      .sort({ dueDate: 1 })
      .limit(10)
      .populate('assignee', 'name')
      .populate('project', 'name')

    // Task counts by status (all tasks)
    const taskCounts = await Task.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ])
    const tasksByStatus = Object.fromEntries(taskCounts.map((t) => [t._id, t.count]))

    // Active projects count
    const activeProjectCount = await Project.countDocuments({
      $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
    })

    // Revenue this month (sum of budget.amount for projects created this month)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthlyRevenue = await Project.aggregate([
      {
        $match: {
          'billing.billingStatus': { $in: ['PARTIEL', 'FACTURE'] },
          'billing.amountInvoiced': { $gt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: '$billing.amountInvoiced' } } },
    ])

    // Hot leads (CHAUD or TRES_CHAUD, not WON/LOST)
    let hotLeads: any[] = []
    try {
      hotLeads = await Lead.find({
        leadTemperature: { $in: ['CHAUD', 'TRES_CHAUD'] },
        status: { $nin: ['WON', 'LOST'] },
      })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('company contactName status leadTemperature budget')
    } catch {
      // Lead model may not exist in all setups
    }

    // Recent projects (last 5 updated)
    const recentProjects = await Project.find({
      $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
    })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate('client', 'name')
      .select('name status priority client updatedAt')

    return res.json({
      myTasks,
      overdueTasks,
      tasksByStatus,
      activeProjectCount,
      totalRevenue: monthlyRevenue[0]?.total || 0,
      hotLeads,
      recentProjects,
    })
  } catch (err) {
    return next(err)
  }
})

export default router
