// ─────────────────────────────────────────────────────────────
// project.startup_checklist
// Vérifie qu'un projet nouvellement créé a bien tous les éléments requis
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'project.startup_checklist',
  title: 'Checklist de démarrage projet',
  domain: 'projects',
  triggerType: 'event',
  channels: ['in_app'],
  recipientStrategy: ['project_manager', 'admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `project.startup_checklist:${ctx.meta?.projectId}`,

  evaluate: async (ctx: AutomationContext) => {
    return !!ctx.meta?.projectId
  },

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Project = mongoose.model('Project')
    const MissionBrief = mongoose.model('MissionBrief')
    const BillingDocument = mongoose.model('BillingDocument')
    const User = mongoose.model('User')

    const projectId = ctx.meta?.projectId as string
    const project = await Project.findById(projectId).populate('assignedTo', '_id name')

    if (!project) {
      return { actionsExecuted: [], recipientsNotified: [], details: { error: 'Project not found' } }
    }

    const missing: string[] = []
    const present: string[] = []

    // Check brief
    const briefCount = await MissionBrief.countDocuments({ project: projectId })
    if (briefCount === 0) {
      missing.push('Brief de mission')
    } else {
      present.push('Brief de mission')
    }

    // Check quote
    const quoteCount = await BillingDocument.countDocuments({ project: projectId, type: 'DEVIS' })
    if (quoteCount === 0) {
      missing.push('Devis')
    } else {
      present.push('Devis')
    }

    // Check assigned team member
    if (!project.assignedTo) {
      missing.push('Responsable assigné')
    } else {
      present.push('Responsable assigné')
    }

    const actionsExecuted: string[] = [`startup_checklist:project:${projectId}`]
    const recipientsNotified: string[] = []

    if (missing.length > 0) {
      const message = `Éléments manquants pour "${project.name}" :\n${missing.map(m => `• ${m}`).join('\n')}\n\nÉléments présents : ${present.length > 0 ? present.join(', ') : 'aucun'}`

      // Notify project manager if assigned
      const manager = project.assignedTo as { _id: unknown; name?: string } | null
      if (manager) {
        await createNotification({
          recipient: (manager._id as object).toString(),
          type: 'PROJECT_ALERT' as never,
          title: `Checklist démarrage : ${missing.length} élément(s) manquant(s)`,
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
            title: `Checklist démarrage "${project.name}" : ${missing.length} manquant(s)`,
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
      details: { missing, present },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
