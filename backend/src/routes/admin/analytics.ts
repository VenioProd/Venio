import express, { Request, Response, NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission, userHasPermission } from '../../middleware/role.js'
import Project from '../../models/Project.js'
import Task from '../../models/Task.js'
import User from '../../models/User.js'
import Lead from '../../models/Lead.js'
import DailyPublicMetric from '../../models/DailyPublicMetric.js'
import { PERMISSIONS } from '../../lib/permissions.js'

const router = express.Router()

const PUBLIC_SITE_GOALS = {
  pageViews: Number(process.env.PUBLIC_ANALYTICS_GOAL_PAGE_VIEWS || 500),
  ctaClicks: Number(process.env.PUBLIC_ANALYTICS_GOAL_CTA_CLICKS || 30),
  contactForms: Number(process.env.PUBLIC_ANALYTICS_GOAL_CONTACT_FORMS || 5),
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function lastMonths(now: Date, count = 6): { key: string; label: string }[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - index), 1))
    return {
      key: monthKey(date),
      label: new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date),
    }
  })
}

router.use(auth)
router.use(requireAdmin)

// Daily counters are deliberately aggregate-only. Rates below compare events,
// not people: privacy-first analytics has no visitor identifier or cookie.
router.get(
  '/public-site',
  requirePermission(PERMISSIONS.VIEW_PROJECTS),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date()
      const months = lastMonths(now)
      const firstMonth = new Date(`${months[0]!.key}-01T00:00:00.000Z`)
      const metrics = await DailyPublicMetric.find({ day: { $gte: firstMonth } }).lean()
      const byMonth = new Map(months.map(({ key }) => [key, { pageViews: 0, ctaClicks: 0, contactForms: 0 }]))

      for (const metric of metrics) {
        const bucket = byMonth.get(monthKey(metric.day))
        if (!bucket) continue
        if (metric.event === 'page_view') bucket.pageViews += metric.count
        if (metric.event === 'cta_click') bucket.ctaClicks += metric.count
        if (metric.event === 'contact_form_succeeded') bucket.contactForms += metric.count
      }

      res.json({
        privacy: 'Compteurs agrégés quotidiens, sans cookie ni identifiant visiteur.',
        goals: PUBLIC_SITE_GOALS,
        months: months.map(({ key, label }) => {
          const metric = byMonth.get(key)!
          return {
            key,
            label,
            ...metric,
            ctaRate: metric.pageViews ? Math.round((metric.ctaClicks / metric.pageViews) * 1000) / 10 : 0,
            formRate: metric.pageViews ? Math.round((metric.contactForms / metric.pageViews) * 1000) / 10 : 0,
          }
        }),
      })
    } catch (error) {
      next(error)
    }
  },
)

// GET /api/admin/analytics
router.get(
  '/',
  requirePermission(PERMISSIONS.VIEW_PROJECTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

      // Projects by status
      const projectsByStatus = await Project.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])

      // Projects by priority
      const projectsByPriority = await Project.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }])

      // Tasks by status
      const tasksByStatus = await Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])

      // Tasks by priority
      const tasksByPriority = await Task.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }])

      // Revenue: total invoiced
      const revenueAgg = await Project.aggregate([
        { $match: { 'billing.amountInvoiced': { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$billing.amountInvoiced' } } },
      ])
      const totalRevenue = revenueAgg[0]?.total || 0

      // Revenue this month
      const monthlyRevenueAgg = await Project.aggregate([
        {
          $match: {
            'billing.amountInvoiced': { $gt: 0 },
            'billing.billingStatus': { $in: ['PARTIEL', 'FACTURE'] },
            createdAt: { $gte: startOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$billing.amountInvoiced' } } },
      ])
      const monthlyRevenue = monthlyRevenueAgg[0]?.total || 0

      // Revenue last month
      const lastMonthRevenueAgg = await Project.aggregate([
        {
          $match: {
            'billing.amountInvoiced': { $gt: 0 },
            'billing.billingStatus': { $in: ['PARTIEL', 'FACTURE'] },
            createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
          },
        },
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

      // L'écran analytics s'ouvre sur view_projects, mais son bloc financier
      // relève de la facturation : masqué pour un admin sans view_billing.
      const canSeeAmounts = await userHasPermission(req, PERMISSIONS.VIEW_BILLING)

      return res.json({
        projectsByStatus: Object.fromEntries(projectsByStatus.map((p) => [p._id, p.count])),
        projectsByPriority: Object.fromEntries(projectsByPriority.map((p) => [p._id, p.count])),
        tasksByStatus: Object.fromEntries(tasksByStatus.map((t) => [t._id, t.count])),
        tasksByPriority: Object.fromEntries(tasksByPriority.map((t) => [t._id, t.count])),
        totalRevenue: canSeeAmounts ? totalRevenue : null,
        monthlyRevenue: canSeeAmounts ? monthlyRevenue : null,
        lastMonthRevenue: canSeeAmounts ? lastMonthRevenue : null,
        totalBudget: canSeeAmounts ? totalBudget : null,
        clientCount,
        activeClientCount,
        projectsPerMonth,
        overdueTaskCount,
        leadStats,
      })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
