// ─────────────────────────────────────────────────────────────
// qualiopi.overdue_indicators
// Alerte indicateurs Qualiopi en retard
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

interface OverdueItem {
  criterionNumber: number
  indicatorNumber?: number
  title: string
  status: string
  dueDate: Date
  assigneeId?: string
}

const definition: AutomationDefinition = {
  key: 'qualiopi.overdue_indicators',
  title: 'Indicateurs Qualiopi en retard',
  domain: 'qualiopi',
  triggerType: 'cron',
  schedule: '08:00',
  channels: ['in_app'],
  recipientStrategy: ['admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `qualiopi.overdue:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const QualiopiCriterion = mongoose.model('QualiopiCriterion')
    const User = mongoose.model('User')

    const criteria = await QualiopiCriterion.find({})
    const overdueItems: OverdueItem[] = []
    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    for (const criterion of criteria) {
      const indicators = criterion.indicators || []

      for (const indicator of indicators) {
        // Check indicator itself
        if (
          ['A_FAIRE', 'EN_COURS'].includes(indicator.status) &&
          indicator.endDate &&
          new Date(indicator.endDate) < ctx.now
        ) {
          overdueItems.push({
            criterionNumber: criterion.number,
            indicatorNumber: indicator.number,
            title: indicator.title,
            status: indicator.status,
            dueDate: new Date(indicator.endDate),
            assigneeId: indicator.assignee ? (indicator.assignee as object).toString() : undefined,
          })
        }

        // Check sub-elements
        const subElements = indicator.subElements || []
        for (const sub of subElements) {
          if (
            ['A_FAIRE', 'EN_COURS'].includes(sub.status) &&
            sub.dueDate &&
            new Date(sub.dueDate) < ctx.now
          ) {
            overdueItems.push({
              criterionNumber: criterion.number,
              indicatorNumber: indicator.number,
              title: sub.title,
              status: sub.status,
              dueDate: new Date(sub.dueDate),
              assigneeId: sub.assignee ? (sub.assignee as object).toString() : undefined,
            })
          }
        }
      }
    }

    if (overdueItems.length === 0) {
      return {
        actionsExecuted: ['qualiopi_check:no_overdue'],
        recipientsNotified: [],
        details: { overdueCount: 0 },
      }
    }

    actionsExecuted.push(`qualiopi_check:${overdueItems.length}_overdue`)

    // Notify individual assignees
    const assigneeGroups = new Map<string, OverdueItem[]>()
    for (const item of overdueItems) {
      if (item.assigneeId) {
        const existing = assigneeGroups.get(item.assigneeId) || []
        existing.push(item)
        assigneeGroups.set(item.assigneeId, existing)
      }
    }

    for (const [assigneeId, items] of assigneeGroups) {
      const summary = items
        .slice(0, 5)
        .map((i) => `• Critère ${i.criterionNumber}, Ind. ${i.indicatorNumber} : ${i.title}`)
        .join('\n')

      await createNotification({
        recipient: assigneeId,
        type: 'QUALIOPI_OVERDUE' as never,
        title: `${items.length} élément(s) Qualiopi en retard`,
        message: summary + (items.length > 5 ? `\n... et ${items.length - 5} autre(s)` : ''),
        link: '/admin/qualiopi',
      })
      recipientsNotified.push(assigneeId)
    }

    // Notify admins with full summary
    const admins = await User.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN'] },
      isActive: { $ne: false },
    }).select('_id')

    const globalSummary = overdueItems
      .slice(0, 8)
      .map(
        (i) =>
          `• Critère ${i.criterionNumber}, Ind. ${i.indicatorNumber} : ${i.title} (${i.status})`
      )
      .join('\n')

    for (const admin of admins) {
      const adminId = (admin._id as object).toString()
      if (!recipientsNotified.includes(adminId)) {
        await createNotification({
          recipient: adminId,
          type: 'QUALIOPI_OVERDUE' as never,
          title: `Qualiopi : ${overdueItems.length} élément(s) en retard`,
          message: globalSummary + (overdueItems.length > 8 ? `\n... et ${overdueItems.length - 8} autre(s)` : ''),
          link: '/admin/qualiopi',
        })
      }
      recipientsNotified.push(adminId)
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: {
        overdueCount: overdueItems.length,
        assigneesNotified: assigneeGroups.size,
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
