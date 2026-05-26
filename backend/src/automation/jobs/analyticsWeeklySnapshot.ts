// ─────────────────────────────────────────────────────────────
// analytics.weekly_snapshot
// Snapshot hebdomadaire des KPIs (pour analyse de tendance)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'
import logger from '../../lib/logger.js'

const definition: AutomationDefinition = {
  key: 'analytics.weekly_snapshot',
  title: 'Snapshot hebdomadaire des KPIs',
  domain: 'analytics',
  triggerType: 'cron',
  schedule: 'monday:01:00',
  channels: ['system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 1,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `analytics.snapshot:${ctx.weekKey}`,

  evaluate: async (ctx) => ctx.now.getDay() === 1,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Project = mongoose.model('Project')
    const Task = mongoose.model('Task')
    const Lead = mongoose.model('Lead')
    const BillingDocument = mongoose.model('BillingDocument')
    const User = mongoose.model('User')

    const oneWeekAgo = new Date(ctx.now.getTime() - 7 * 24 * 3600_000)

    // Active projects
    const activeProjects = await Project.countDocuments({
      status: 'EN_COURS',
      isArchived: { $ne: true },
    })

    // Completed tasks this week
    const completedTasksThisWeek = await Task.countDocuments({
      status: { $in: ['TERMINE', 'VALIDE'] },
      updatedAt: { $gte: oneWeekAgo },
    })

    // New leads this week
    const newLeads = await Lead.countDocuments({
      createdAt: { $gte: oneWeekAgo },
    })

    // Won leads this week
    const wonLeads = await Lead.countDocuments({
      status: 'WON',
      updatedAt: { $gte: oneWeekAgo },
    })

    // Open invoices total amount
    const openInvoicesAgg = await BillingDocument.aggregate([
      {
        $match: {
          type: 'FACTURE',
          status: { $in: ['ENVOYEE', 'EN_ATTENTE'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalTTC' } } },
    ])
    const openInvoicesTotal = openInvoicesAgg[0]?.total || 0

    // New clients this week
    const newClients = await User.countDocuments({
      role: 'CLIENT',
      createdAt: { $gte: oneWeekAgo },
    })

    const metrics = {
      activeProjects,
      completedTasksThisWeek,
      newLeads,
      wonLeads,
      openInvoicesTotal,
      newClients,
      snapshotDate: ctx.dateKey,
      weekKey: ctx.weekKey,
    }

    logger.info({ data: JSON.stringify(metrics, null, 2) }, `[ANALYTICS SNAPSHOT] Weekly KPIs:`)

    return {
      actionsExecuted: ['weekly_snapshot_collected'],
      recipientsNotified: [],
      details: metrics,
    }
  },
}

export function register() {
  registerAutomation(definition)
}
