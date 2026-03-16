// ─────────────────────────────────────────────────────────────
// task.unassigned_alert
// Alerte pour les tâches sans assignation ou sans deadline
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'task.unassigned_alert',
  title: 'Alerte tâches non assignées ou sans deadline',
  domain: 'tasks',
  triggerType: 'cron',
  schedule: '08:30',
  channels: ['in_app'],
  recipientStrategy: ['admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `task.unassigned:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Task = mongoose.model('Task')
    const User = mongoose.model('User')

    // Tasks not completed, with either no assignee or no due date
    const problemTasks = await Task.find({
      status: { $nin: ['TERMINE', 'VALIDE'] },
      $or: [
        { assignedTo: null },
        { dueDate: null },
      ],
    }).populate('project', 'name')

    if (problemTasks.length === 0) {
      return { actionsExecuted: [], recipientsNotified: [], details: { tasksFound: 0 } }
    }

    // Group by project
    const byProject = new Map<string, { projectName: string; tasks: Array<{ title: string; missingAssignee: boolean; missingDeadline: boolean }> }>()

    for (const task of problemTasks) {
      const projectRef = task.project as { _id: unknown; name?: string } | null
      const projectId = projectRef ? (projectRef._id as object).toString() : 'sans_projet'
      const projectName = projectRef?.name || 'Sans projet'

      if (!byProject.has(projectId)) {
        byProject.set(projectId, { projectName, tasks: [] })
      }
      byProject.get(projectId)!.tasks.push({
        title: task.title,
        missingAssignee: !task.assignedTo,
        missingDeadline: !task.dueDate,
      })
    }

    // Build summary
    const summaryLines: string[] = []
    for (const [, { projectName, tasks }] of byProject) {
      summaryLines.push(`${projectName} (${tasks.length} tâche(s)) :`)
      for (const t of tasks.slice(0, 5)) {
        const issues = []
        if (t.missingAssignee) issues.push('pas d\'assigné')
        if (t.missingDeadline) issues.push('pas de deadline')
        summaryLines.push(`  • "${t.title}" — ${issues.join(', ')}`)
      }
      if (tasks.length > 5) {
        summaryLines.push(`  … et ${tasks.length - 5} autre(s)`)
      }
    }

    const message = summaryLines.join('\n')

    // Notify admins
    const admins = await User.find({ role: { $in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: { $ne: false } }).select('_id')
    const actionsExecuted: string[] = [`unassigned_alert:${problemTasks.length}_tasks`]
    const recipientsNotified: string[] = []

    for (const admin of admins) {
      const adminId = (admin._id as object).toString()
      await createNotification({
        recipient: adminId,
        type: 'TASK_ALERT' as never,
        title: `${problemTasks.length} tâche(s) sans assigné ou deadline`,
        message,
        link: '/admin/taches',
      })
      recipientsNotified.push(adminId)
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { tasksFound: problemTasks.length, projectsAffected: byProject.size },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
