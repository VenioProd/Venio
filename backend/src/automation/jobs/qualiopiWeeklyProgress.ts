// ─────────────────────────────────────────────────────────────
// qualiopi.weekly_progress_report
// Rapport hebdomadaire de progression Qualiopi
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'qualiopi.weekly_progress_report',
  title: 'Rapport hebdomadaire progression Qualiopi',
  domain: 'qualiopi',
  triggerType: 'cron',
  schedule: 'monday:08:00',
  channels: ['in_app'],
  recipientStrategy: ['admins', 'super_admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `qualiopi.progress:${ctx.weekKey}`,

  evaluate: async (ctx) => ctx.now.getDay() === 1,

  execute: async (_ctx: AutomationContext): Promise<AutomationResult> => {
    const QualiopiCriterion = mongoose.model('QualiopiCriterion')
    const User = mongoose.model('User')

    const criteria = await QualiopiCriterion.find({}).sort({ number: 1 })

    const progressLines: string[] = []
    let totalIndicators = 0
    let totalCompleted = 0

    for (const criterion of criteria) {
      const indicators = criterion.indicators || []
      const total = indicators.length
      const completed = indicators.filter(
        (ind: { status: string }) => ind.status === 'FAIT'
      ).length

      totalIndicators += total
      totalCompleted += completed

      const pct = total > 0 ? Math.round((completed / total) * 100) : 0
      const barLength = 10
      const filled = Math.round((pct / 100) * barLength)
      const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled)

      progressLines.push(
        `Critère ${criterion.number} : ${bar} ${completed}/${total} (${pct}%)`
      )
    }

    const globalPct =
      totalIndicators > 0 ? Math.round((totalCompleted / totalIndicators) * 100) : 0

    const message = [
      `Progression globale : ${totalCompleted}/${totalIndicators} (${globalPct}%)`,
      '',
      ...progressLines,
    ].join('\n')

    const actionsExecuted: string[] = ['qualiopi_progress_report']
    const recipientsNotified: string[] = []

    const admins = await User.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN'] },
      isActive: { $ne: false },
    }).select('_id')

    for (const admin of admins) {
      await createNotification({
        recipient: (admin._id as object).toString(),
        type: 'QUALIOPI_PROGRESS' as never,
        title: `Qualiopi : ${globalPct}% complété (${totalCompleted}/${totalIndicators})`,
        message,
        link: '/admin/qualiopi',
      })
      recipientsNotified.push((admin._id as object).toString())
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: {
        totalIndicators,
        totalCompleted,
        globalPercentage: globalPct,
        criteriaCount: criteria.length,
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
