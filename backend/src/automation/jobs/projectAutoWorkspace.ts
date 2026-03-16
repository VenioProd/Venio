// ─────────────────────────────────────────────────────────────
// Phase 2: project.auto_create_full_workspace
// Crée automatiquement les sections par défaut d'un projet
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const DEFAULT_SECTIONS = [
  { title: 'Livrables', description: 'Documents et fichiers livrés au client', order: 1 },
  { title: 'Contrats & Devis', description: 'Documents contractuels', order: 2 },
  { title: 'Factures', description: 'Documents de facturation', order: 3 },
  { title: 'Communication', description: 'Échanges et notes', order: 4 },
  { title: 'Briefs', description: 'Cahiers des charges et briefs', order: 5 },
]

const definition: AutomationDefinition = {
  key: 'project.auto_create_full_workspace',
  title: 'Création automatique de l\'espace projet',
  domain: 'projects',
  triggerType: 'event',
  channels: ['in_app', 'system_log'],
  recipientStrategy: ['project_manager', 'admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `project.auto_workspace:${ctx.meta?.projectId}`,

  evaluate: async (ctx) => {
    return !!ctx.meta?.projectId
  },

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const ProjectSection = mongoose.model('ProjectSection')
    const Project = mongoose.model('Project')

    const projectId = ctx.meta!.projectId as string

    // Check if sections already exist
    const existingCount = await ProjectSection.countDocuments({ project: projectId })
    if (existingCount > 0) {
      return {
        actionsExecuted: ['skipped:sections_already_exist'],
        recipientsNotified: [],
        details: { existingSections: existingCount },
      }
    }

    const project = await Project.findById(projectId).populate('assignedTo', '_id name')
    if (!project) {
      return {
        actionsExecuted: ['skipped:project_not_found'],
        recipientsNotified: [],
      }
    }

    // Create default sections
    const createdSections = await ProjectSection.insertMany(
      DEFAULT_SECTIONS.map((s) => ({
        project: projectId,
        title: s.title,
        description: s.description,
        order: s.order,
        isVisible: true,
        createdBy: ctx.meta?.actorId || null,
      }))
    )

    const actionsExecuted = [`workspace_created:project:${projectId}:${createdSections.length}_sections`]
    const recipientsNotified: string[] = []

    // Notify project manager
    const manager = project.assignedTo as { _id?: unknown; name?: string } | null
    if (manager?._id) {
      await createNotification({
        recipient: (manager._id as object).toString(),
        type: 'PROJECT_UPDATE' as never,
        title: `Espace projet créé : ${project.name}`,
        message: `${createdSections.length} sections ont été créées automatiquement pour le projet "${project.name}"`,
        link: `/admin/projets/${projectId}`,
      })
      recipientsNotified.push((manager._id as object).toString())
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { sectionsCreated: createdSections.length },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
