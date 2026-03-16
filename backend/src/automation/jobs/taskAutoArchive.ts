// ─────────────────────────────────────────────────────────────
// task.auto_archive
// Archive automatiquement les tâches terminées depuis 60+ jours
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'task.auto_archive',
  title: 'Archivage automatique des tâches terminées',
  domain: 'tasks',
  triggerType: 'cron',
  schedule: '03:00',
  channels: ['system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 1,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `task.auto_archive:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Task = mongoose.model('Task')

    const threshold = new Date(ctx.now.getTime() - 60 * 24 * 3600_000)

    const result = await Task.updateMany(
      {
        status: { $in: ['TERMINE', 'VALIDE'] },
        updatedAt: { $lt: threshold },
        isArchived: { $ne: true },
      },
      { $set: { isArchived: true } },
    )

    const archivedCount = result.modifiedCount || 0

    console.log(`[TASK AUTO ARCHIVE] ${archivedCount} tâche(s) archivée(s) (terminées depuis 60j+)`)

    return {
      actionsExecuted: [`auto_archive:${archivedCount}_tasks`],
      recipientsNotified: [],
      details: { archivedCount },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
