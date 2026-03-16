// ─────────────────────────────────────────────────────────────
// Phase 1: task.overdue_escalation
// Escalade automatique des taches en retard
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import { sendTaskReminderEmail } from '../../lib/email.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const ESCALATION_THRESHOLD_DAYS = 3

const definition: AutomationDefinition = {
  key: 'task.overdue_escalation',
  title: 'Escalade automatique des taches en retard',
  domain: 'tasks',
  triggerType: 'cron',
  schedule: '08:15',
  channels: ['in_app', 'email'],
  recipientStrategy: ['assigned_user', 'project_manager', 'admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `task.overdue_escalation:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Task = mongoose.model('Task')
    const User = mongoose.model('User')
    const Project = mongoose.model('Project')

    const now = ctx.now
    const escalationDate = new Date(now.getTime() - ESCALATION_THRESHOLD_DAYS * 24 * 3600_000)

    // Tasks overdue
    const overdueTasks = await Task.find({
      dueDate: { $lt: now },
      status: { $nin: ['TERMINE', 'VALIDE'] },
    }).populate('assignedTo', 'email name').populate('project', 'name assignedTo')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    for (const task of overdueTasks) {
      const assignee = task.assignedTo as { _id: unknown; email?: string; name?: string } | null
      const project = task.project as { _id?: unknown; name?: string; assignedTo?: unknown } | null
      const daysOverdue = Math.floor((now.getTime() - new Date(task.dueDate).getTime()) / 86400_000)

      // Notify assignee
      if (assignee?.email) {
        await createNotification({
          recipient: (assignee._id as object).toString(),
          type: 'TASK_OVERDUE' as never,
          title: `Tache en retard (${daysOverdue}j) : ${task.title}`,
          message: `La tache "${task.title}" est en retard de ${daysOverdue} jour(s)`,
          link: `/admin/projets/${project?._id}?tab=tasks`,
        })

        if (!recipientsNotified.includes((assignee._id as object).toString())) {
          recipientsNotified.push((assignee._id as object).toString())
        }
        actionsExecuted.push(`notify_assignee:task:${task._id}`)
      }

      // Escalation: if overdue > threshold, notify project manager / admins
      if (daysOverdue >= ESCALATION_THRESHOLD_DAYS && project?.assignedTo) {
        const managerId = project.assignedTo.toString()
        if (managerId !== assignee?._id?.toString()) {
          const manager = await User.findById(managerId).select('email name')
          if (manager) {
            await createNotification({
              recipient: managerId,
              type: 'ESCALATION' as never,
              title: `Escalade : "${task.title}" en retard de ${daysOverdue}j`,
              message: `La tache "${task.title}" assignee a ${assignee?.name || 'non assigne'} est en retard de ${daysOverdue} jours`,
              link: `/admin/projets/${project?._id}?tab=tasks`,
            })

            if (manager.email) {
              await sendTaskReminderEmail({
                to: manager.email,
                name: manager.name || 'Manager',
                taskTitle: task.title,
                projectName: project?.name || '',
                dueDate: new Date(task.dueDate).toLocaleDateString('fr-FR'),
              })
            }

            if (!recipientsNotified.includes(managerId)) {
              recipientsNotified.push(managerId)
            }
            actionsExecuted.push(`escalate:task:${task._id}:manager:${managerId}`)
          }
        }
      }
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { overdueCount: overdueTasks.length },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
