// ─────────────────────────────────────────────────────────────
// project.closure_checklist
// Vérifie qu'un projet marqué TERMINE a bien tous les éléments finalisés
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'project.closure_checklist',
  title: 'Checklist de clôture projet',
  domain: 'projects',
  triggerType: 'event',
  channels: ['in_app'],
  recipientStrategy: ['project_manager', 'admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `project.closure_checklist:${ctx.meta?.projectId}`,

  evaluate: async (ctx: AutomationContext) => {
    return !!ctx.meta?.projectId && ctx.meta?.newStatus === 'TERMINE'
  },

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Project = mongoose.model('Project')
    const Task = mongoose.model('Task')
    const BillingDocument = mongoose.model('BillingDocument')
    const ProjectItem = mongoose.model('ProjectItem')
    const User = mongoose.model('User')

    const projectId = ctx.meta?.projectId as string
    const project = await Project.findById(projectId).populate('assignedTo', '_id name')

    if (!project) {
      return { actionsExecuted: [], recipientsNotified: [], details: { error: 'Project not found' } }
    }

    const missing: string[] = []
    const present: string[] = []

    // Check all tasks completed
    const openTasks = await Task.countDocuments({
      project: projectId,
      status: { $nin: ['TERMINE', 'VALIDE'] },
    })
    if (openTasks > 0) {
      missing.push(`${openTasks} tâche(s) non terminée(s)`)
    } else {
      present.push('Toutes les tâches terminées')
    }

    // Check invoice sent (not DRAFT)
    const invoiceSent = await BillingDocument.countDocuments({
      project: projectId,
      type: 'FACTURE',
      status: { $ne: 'BROUILLON' },
    })
    if (invoiceSent === 0) {
      missing.push('Aucune facture envoyée')
    } else {
      present.push('Facture envoyée')
    }

    // Check all deliverables validated
    const totalDeliverables = await ProjectItem.countDocuments({
      project: projectId,
      type: 'LIVRABLE',
    })
    const validatedDeliverables = await ProjectItem.countDocuments({
      project: projectId,
      type: 'LIVRABLE',
      status: 'VALIDE',
    })
    if (totalDeliverables > 0 && validatedDeliverables < totalDeliverables) {
      missing.push(`${totalDeliverables - validatedDeliverables} livrable(s) non validé(s) sur ${totalDeliverables}`)
    } else if (totalDeliverables > 0) {
      present.push('Tous les livrables validés')
    }

    const actionsExecuted: string[] = [`closure_checklist:project:${projectId}`]
    const recipientsNotified: string[] = []

    if (missing.length > 0) {
      const message = `Éléments manquants pour clôturer "${project.name}" :\n${missing.map(m => `• ${m}`).join('\n')}\n\nÉléments OK : ${present.length > 0 ? present.join(', ') : 'aucun'}`

      // Notify project manager
      const manager = project.assignedTo as { _id: unknown; name?: string } | null
      if (manager) {
        await createNotification({
          recipient: (manager._id as object).toString(),
          type: 'PROJECT_ALERT' as never,
          title: `Clôture "${project.name}" : ${missing.length} point(s) à régler`,
          message,
          link: `/admin/projets/${projectId}`,
        })
        recipientsNotified.push((manager._id as object).toString())
      }

      // Notify admins
      const admins = await User.find({ role: { $in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: { $ne: false } }).select('_id')
      for (const admin of admins) {
        const adminId = (admin._id as object).toString()
        if (!recipientsNotified.includes(adminId)) {
          await createNotification({
            recipient: adminId,
            type: 'PROJECT_ALERT' as never,
            title: `Clôture "${project.name}" : ${missing.length} point(s) à régler`,
            message,
            link: `/admin/projets/${projectId}`,
          })
          recipientsNotified.push(adminId)
        }
      }
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { missing, present, openTasks, invoiceSent, totalDeliverables, validatedDeliverables },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
