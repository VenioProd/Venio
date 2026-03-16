// ─────────────────────────────────────────────────────────────
// project.missing_documents_reminder
// Rappel quotidien pour les projets EN_COURS sans devis ou brief
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'project.missing_documents_reminder',
  title: 'Rappel documents manquants projet',
  domain: 'projects',
  triggerType: 'cron',
  schedule: '09:30',
  channels: ['in_app'],
  recipientStrategy: ['project_manager', 'admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `project.missing_docs:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Project = mongoose.model('Project')
    const BillingDocument = mongoose.model('BillingDocument')
    const MissionBrief = mongoose.model('MissionBrief')
    const User = mongoose.model('User')

    const sevenDaysAgo = new Date(ctx.now.getTime() - 7 * 24 * 3600_000)

    // Projects EN_COURS, not archived, created more than 7 days ago
    const projects = await Project.find({
      status: 'EN_COURS',
      isArchived: { $ne: true },
      createdAt: { $lt: sevenDaysAgo },
    }).populate('assignedTo', '_id name')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    for (const project of projects) {
      const missing: string[] = []

      const quoteCount = await BillingDocument.countDocuments({ project: project._id, type: 'DEVIS' })
      if (quoteCount === 0) missing.push('Devis')

      const briefCount = await MissionBrief.countDocuments({ project: project._id })
      if (briefCount === 0) missing.push('Brief de mission')

      if (missing.length === 0) continue

      const message = `Le projet "${project.name}" (créé il y a plus de 7 jours) n'a pas : ${missing.join(', ')}`

      // Notify assignedTo if present
      const manager = project.assignedTo as { _id: unknown; name?: string } | null
      if (manager) {
        const managerId = (manager._id as object).toString()
        await createNotification({
          recipient: managerId,
          type: 'PROJECT_ALERT' as never,
          title: `Documents manquants : ${project.name}`,
          message,
          link: `/admin/projets/${(project._id as object).toString()}`,
        })
        if (!recipientsNotified.includes(managerId)) {
          recipientsNotified.push(managerId)
        }
      } else {
        // No assignee — notify all admins
        const admins = await User.find({ role: { $in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: { $ne: false } }).select('_id')
        for (const admin of admins) {
          const adminId = (admin._id as object).toString()
          await createNotification({
            recipient: adminId,
            type: 'PROJECT_ALERT' as never,
            title: `Documents manquants : ${project.name}`,
            message,
            link: `/admin/projets/${(project._id as object).toString()}`,
          })
          if (!recipientsNotified.includes(adminId)) {
            recipientsNotified.push(adminId)
          }
        }
      }

      actionsExecuted.push(`missing_docs:project:${(project._id as object).toString()}:${missing.join(',')}`)
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { projectsChecked: projects.length },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
