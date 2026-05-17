import express, { type Request, type Response, type NextFunction } from 'express'
import User from '../../models/User.js'
import Project from '../../models/Project.js'
import Lead from '../../models/Lead.js'
import BillingDocument from '../../models/BillingDocument.js'
import Task from '../../models/Task.js'
import InternalTicket from '../../models/InternalTicket.js'
import { requireScope } from './_middleware/auth.js'

/**
 * Routes agent pour les Analytics — endpoints de lecture agrégés.
 *
 * Scope : read:analytics (lecture seule par nature).
 *
 * V1 :
 *   - GET /analytics/snapshot          → KPIs cross-domain (1 appel = vue d'ensemble)
 *   - GET /analytics/crm               → pipeline CRM par statut
 *   - GET /analytics/billing           → CA, factures par statut, montants
 *   - GET /analytics/projects          → projets par statut, par priorité
 */

const router = express.Router()

router.get(
  '/analytics/snapshot',
  requireScope('read:analytics'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [clientsCount, leadsCount, projectsCount, openTickets, pendingTasks, openInvoices] =
        await Promise.all([
          User.countDocuments({ role: 'CLIENT' }),
          Lead.countDocuments({}),
          Project.countDocuments({ $or: [{ isArchived: false }, { isArchived: { $exists: false } }] }),
          InternalTicket.countDocuments({ status: { $in: ['OUVERT', 'EN_COURS'] } }),
          Task.countDocuments({ status: { $in: ['A_FAIRE', 'EN_COURS'] } }),
          BillingDocument.countDocuments({ status: { $in: ['ISSUED', 'SENT', 'ACCEPTED'] } }),
        ])
      res.json({
        users: { clients: clientsCount },
        crm: { leads: leadsCount },
        projects: { active: projectsCount },
        tickets: { open: openTickets },
        tasks: { pending: pendingTasks },
        billing: { openInvoices },
        generatedAt: new Date().toISOString(),
      })
    } catch (err) {
      next(err)
    }
  }
)

router.get('/analytics/crm', requireScope('read:analytics'), async (_req, res, next) => {
  try {
    const pipeline = await Lead.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, totalBudget: { $sum: '$budget' } } },
      { $sort: { _id: 1 } },
    ])
    const byPriority = await Lead.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    res.json({ byStatus: pipeline, byPriority })
  } catch (err) {
    next(err)
  }
})

router.get('/analytics/billing', requireScope('read:analytics'), async (_req, res, next) => {
  try {
    const byStatus = await BillingDocument.aggregate([
      {
        $group: {
          _id: { type: '$type', status: '$status' },
          count: { $sum: 1 },
          totalAmount: { $sum: '$total' },
        },
      },
      { $sort: { '_id.type': 1, '_id.status': 1 } },
    ])
    const last30d = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    const recent = await BillingDocument.aggregate([
      { $match: { createdAt: { $gte: last30d } } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$total' },
        },
      },
    ])
    res.json({ byStatus, last30Days: recent })
  } catch (err) {
    next(err)
  }
})

router.get('/analytics/projects', requireScope('read:analytics'), async (_req, res, next) => {
  try {
    const byStatus = await Project.aggregate([
      { $match: { $or: [{ isArchived: false }, { isArchived: { $exists: false } }] } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    const byPriority = await Project.aggregate([
      { $match: { $or: [{ isArchived: false }, { isArchived: { $exists: false } }] } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    res.json({ byStatus, byPriority })
  } catch (err) {
    next(err)
  }
})

export default router
