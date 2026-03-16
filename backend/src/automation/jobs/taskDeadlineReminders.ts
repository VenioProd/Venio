// ─────────────────────────────────────────────────────────────
// Phase 1: task.deadline_reminders
// Rappel automatique des taches dont la deadline approche (J-3, J-1, J)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { dispatch, resolveRecipients } from '../dispatcher.js'
import { sendTaskReminderEmail } from '../../lib/email.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'task.deadline_reminders',
  title: 'Rappel automatique avant deadline tache',
  domain: 'tasks',
  triggerType: 'cron',
  schedule: '08:00',
  channels: ['in_app', 'email'],
  recipientStrategy: ['assigned_user'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `task.deadline_reminders:${ctx.dateKey}`,

  evaluate: async () => true, // always run, filter inside execute

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Task = mongoose.model('Task')
    const User = mongoose.model('User')

    const now = ctx.now
    const in3days = new Date(now.getTime() + 3 * 24 * 3600_000)

    // Tasks with deadline between now and +3 days, not completed
    const tasks = await Task.find({
      dueDate: { $gte: now, $lte: in3days },
      status: { $nin: ['TERMINE', 'VALIDE'] },
      assignedTo: { $ne: null },
    }).populate('assignedTo', 'email name').populate('project', 'name')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    for (const task of tasks) {
      const assignee = task.assignedTo as { _id: unknown; email?: string; name?: string } | null
      if (!assignee?.email) continue

      const projectName = (task.project as { name?: string })?.name || ''
      const dueDate = new Date(task.dueDate).toLocaleDateString('fr-FR')

      // In-app notification
      await createNotification({
        recipient: (assignee._id as object).toString(),
        type: 'TASK_REMINDER' as never,
        title: `Deadline proche : ${task.title}`,
        message: `La tache "${task.title}" (${projectName}) est due le ${dueDate}`,
        link: `/admin/projets/${(task.project as { _id?: unknown })?._id}?tab=tasks`,
      })

      // Email
      await sendTaskReminderEmail({
        to: assignee.email,
        name: assignee.name || 'Collaborateur',
        taskTitle: task.title,
        projectName,
        dueDate,
      })

      actionsExecuted.push(`reminder:task:${task._id}`)
      if (!recipientsNotified.includes((assignee._id as object).toString())) {
        recipientsNotified.push((assignee._id as object).toString())
      }
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { tasksProcessed: tasks.length },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
