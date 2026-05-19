import express, { Request, Response, NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin, requireSuperAdmin } from '../../middleware/role.js'
import Task from '../../models/Task.js'
import Project from '../../models/Project.js'
import User from '../../models/User.js'
import Lead from '../../models/Lead.js'
import MissionBrief from '../../models/MissionBrief.js'
import Decision from '../../models/Decision.js'
import BillingDocument from '../../models/BillingDocument.js'
import InternalConversation from '../../models/InternalConversation.js'
import InternalConversationMember from '../../models/InternalConversationMember.js'

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

    // My briefs (assigned to me, not done)
    const myBriefs = await MissionBrief.find({
      destinataire: userId,
      statut: { $nin: ['VALIDE', 'LIVRE'] },
    })
      .sort({ briefPriority: 1, deadline: 1 })
      .limit(10)
      .populate('project', 'name')

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
      myBriefs,
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

// GET /api/admin/dashboard/super — agrégation pour le super admin
// Inclut alertes, business KPIs, ops, équipe, messages/décisions en attente,
// trends CA sur les 6 derniers mois.
router.get('/super', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

    const [
      overdueTasksCount,
      coldLeadsCount,
      overdueLeadsCount,
      staleProjectsCount,
      overdueBriefsP1Count,
      pendingDecisions,
      pendingDecisionsCount,
      myTasksCount,
      myBriefsCount,
      activeProjectCount,
      archivedProjectCount,
      projectsByStatus,
      tasksByStatus,
      briefsByPriority,
      monthlyInvoiced,
      pipelineSum,
      clientCount,
      adminCount,
      internCount,
      hotLeadsCount,
      revenueTrendRaw,
      adminLoadRaw,
      myConversationMembers,
    ] = await Promise.all([
      Task.countDocuments({ status: { $ne: 'TERMINE' }, dueDate: { $lt: now, $ne: null } }),
      Lead.countDocuments({ leadTemperature: 'FROID', status: { $nin: ['WON', 'LOST'] } }).catch(() => 0),
      Lead.countDocuments({
        nextActionAt: { $lt: now, $ne: null },
        status: { $nin: ['WON', 'LOST'] },
      }).catch(() => 0),
      Project.countDocuments({
        $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
        updatedAt: { $lt: fourteenDaysAgo },
      }),
      MissionBrief.countDocuments({
        briefPriority: 'P1',
        deadline: { $lt: now, $ne: null },
        statut: { $nin: ['VALIDE', 'LIVRE'] },
      }),
      Decision.find({ status: 'PENDING' })
        .sort({ priority: -1, createdAt: -1 })
        .limit(5)
        .populate('submittedBy', 'name email avatarUrl')
        .lean(),
      Decision.countDocuments({ status: 'PENDING' }),
      Task.countDocuments({ assignee: userId, status: { $ne: 'TERMINE' } }),
      MissionBrief.countDocuments({ destinataire: userId, statut: { $nin: ['VALIDE', 'LIVRE'] } }),
      Project.countDocuments({
        $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
      }),
      Project.countDocuments({ isArchived: true }),
      Project.aggregate([
        { $match: { $or: [{ isArchived: false }, { isArchived: { $exists: false } }] } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $match: { status: { $ne: 'TERMINE' } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      MissionBrief.aggregate([
        { $match: { statut: { $nin: ['VALIDE', 'LIVRE'] } } },
        { $group: { _id: '$briefPriority', count: { $sum: 1 } } },
      ]),
      BillingDocument.aggregate([
        {
          $match: {
            type: 'INVOICE',
            status: { $in: ['PAID', 'SENT', 'ACCEPTED'] },
            issuedAt: { $gte: startOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]).catch(() => []),
      Lead.aggregate([
        { $match: { status: { $nin: ['WON', 'LOST'] }, budget: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$budget' } } },
      ]).catch(() => []),
      User.countDocuments({ role: 'CLIENT' }).catch(() => 0),
      User.countDocuments({ role: { $in: ['SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER', 'STAGIAIRE'] } }).catch(() => 0),
      User.countDocuments({ role: 'INTERN' }).catch(() => 0),
      Lead.countDocuments({
        leadTemperature: { $in: ['CHAUD', 'TRES_CHAUD'] },
        status: { $nin: ['WON', 'LOST'] },
      }).catch(() => 0),
      BillingDocument.aggregate([
        {
          $match: {
            type: 'INVOICE',
            status: { $in: ['PAID', 'SENT', 'ACCEPTED'] },
            issuedAt: { $gte: sixMonthsAgo },
          },
        },
        {
          $group: {
            _id: { y: { $year: '$issuedAt' }, m: { $month: '$issuedAt' } },
            total: { $sum: '$total' },
          },
        },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
      ]).catch(() => []),
      Task.aggregate([
        { $match: { status: { $ne: 'TERMINE' }, assignee: { $ne: null } } },
        {
          $group: {
            _id: '$assignee',
            total: { $sum: 1 },
            overdue: {
              $sum: {
                $cond: [
                  { $and: [{ $ne: ['$dueDate', null] }, { $lt: ['$dueDate', now] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { total: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        {
          $project: {
            _id: 1,
            total: 1,
            overdue: 1,
            name: '$user.name',
            email: '$user.email',
            avatarUrl: '$user.avatarUrl',
            role: '$user.role',
          },
        },
      ]),
      InternalConversationMember.find({ user: userId }).select('conversation lastReadAt').lean(),
    ])

    // Messages en attente : conversations dont lastMessageAt > lastReadAt
    const conversationIds = myConversationMembers.map((m) => m.conversation)
    const conversations = await InternalConversation.find({
      _id: { $in: conversationIds },
      isArchived: false,
      lastMessageAt: { $ne: null },
    })
      .select('_id type name lastMessageAt')
      .lean()
    const lastReadMap = new Map(myConversationMembers.map((m) => [String(m.conversation), m.lastReadAt]))
    const unreadConversations = conversations.filter((c) => {
      const lastRead = lastReadMap.get(String(c._id))
      return !lastRead || (c.lastMessageAt && c.lastMessageAt > lastRead)
    })
    const pendingMessagesCount = unreadConversations.length

    // Format trends
    const revenueTrend = revenueTrendRaw.map((r: { _id: { y: number; m: number }; total: number }) => ({
      year: r._id.y,
      month: r._id.m,
      total: r.total,
    }))

    return res.json({
      generatedAt: now.toISOString(),

      alerts: {
        overdueTasks: overdueTasksCount,
        coldLeads: coldLeadsCount,
        overdueLeads: overdueLeadsCount,
        staleProjects: staleProjectsCount,
        overdueBriefsP1: overdueBriefsP1Count,
      },

      mine: {
        tasks: myTasksCount,
        briefs: myBriefsCount,
        pendingMessages: pendingMessagesCount,
      },

      messages: {
        unreadCount: pendingMessagesCount,
        unreadConversations: unreadConversations.slice(0, 5),
      },

      decisions: {
        pendingCount: pendingDecisionsCount,
        pending: pendingDecisions,
      },

      business: {
        monthlyInvoiced: monthlyInvoiced[0]?.total || 0,
        pipelineTotal: pipelineSum[0]?.total || 0,
        hotLeads: hotLeadsCount,
        revenueTrend,
      },

      operations: {
        activeProjects: activeProjectCount,
        archivedProjects: archivedProjectCount,
        projectsByStatus: Object.fromEntries(
          projectsByStatus.map((p: { _id: string; count: number }) => [p._id, p.count])
        ),
        tasksByStatus: Object.fromEntries(
          tasksByStatus.map((t: { _id: string; count: number }) => [t._id, t.count])
        ),
        briefsByPriority: Object.fromEntries(
          briefsByPriority.map((b: { _id: string; count: number }) => [b._id, b.count])
        ),
      },

      team: {
        clients: clientCount,
        admins: adminCount,
        interns: internCount,
        load: adminLoadRaw,
      },
    })
  } catch (err) {
    return next(err)
  }
})

export default router
