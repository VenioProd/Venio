// ─────────────────────────────────────────────────────────────
// Phase 3: nextcloud.auto_create_project_structure
// Crée la structure de dossiers Nextcloud pour un nouveau projet
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import { createFolder, isNextcloudEnabled } from '../../lib/nextcloud.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'
import logger from '../../lib/logger.js'

const PROJECT_SUBFOLDERS = [
  'Livrables',
  'Contrats',
  'Factures',
  'Briefs',
  'Assets',
  'Communication',
  'Exports',
]

function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/[/\\<>:"|?*]/g, '-')
    .replace(/\.\./g, '')
    .replace(/--+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const definition: AutomationDefinition = {
  key: 'nextcloud.auto_create_project_structure',
  title: 'Création structure Nextcloud projet',
  domain: 'nextcloud',
  triggerType: 'event',
  channels: ['in_app', 'system_log'],
  recipientStrategy: ['project_manager', 'admins'],
  retryable: true,
  maxRetries: 3,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `nextcloud.project_structure:${ctx.meta?.projectId}`,

  evaluate: async () => isNextcloudEnabled(),

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Project = mongoose.model('Project')
    const User = mongoose.model('User')

    const projectId = ctx.meta!.projectId as string
    const project = await Project.findById(projectId)
      .populate('client', 'name companyName')
      .populate('assignedTo', '_id name')

    if (!project) {
      return { actionsExecuted: ['skipped:project_not_found'], recipientsNotified: [] }
    }

    const client = project.client as { name?: string; companyName?: string } | null
    const clientName = sanitizeName(client?.companyName || client?.name || 'Sans-Client')
    const projectName = sanitizeName(project.name)

    const basePath = process.env.NEXTCLOUD_BASE_PATH || '/Venio/Clients'
    const projectPath = `${basePath}/${clientName}/Projets/${projectName}`

    const created: string[] = []
    const errors: string[] = []

    // Create project root
    const rootResult = await createFolder(projectPath)
    if (rootResult.success) {
      created.push(projectPath)
    } else if (!rootResult.alreadyExists) {
      errors.push(`${projectPath}: ${rootResult.error}`)
    }

    // Create subfolders
    for (const sub of PROJECT_SUBFOLDERS) {
      const subPath = `${projectPath}/${sub}`
      const result = await createFolder(subPath)
      if (result.success) created.push(subPath)
      else if (!result.alreadyExists) errors.push(`${subPath}: ${result.error}`)
    }

    // Create separate admin space
    const adminPath = `${projectPath}/_Admin`
    const adminResult = await createFolder(adminPath)
    if (adminResult.success) created.push(adminPath)

    // Create separate client space
    const clientSpacePath = `${projectPath}/_Client`
    const clientSpaceResult = await createFolder(clientSpacePath)
    if (clientSpaceResult.success) created.push(clientSpacePath)

    const actionsExecuted = [`nextcloud_structure:project:${projectId}:${created.length}_folders`]
    const recipientsNotified: string[] = []

    if (errors.length > 0) {
      logger.warn(`[NEXTCLOUD] Structure creation had ${errors.length} error(s) for project ${project.name}`)
    }

    // Notify manager
    const manager = project.assignedTo as { _id?: unknown; name?: string } | null
    if (manager?._id) {
      await createNotification({
        recipient: (manager._id as object).toString(),
        type: 'PROJECT_UPDATE' as never,
        title: `Dossiers Nextcloud créés : ${project.name}`,
        message: `${created.length} dossier(s) créé(s) sur Nextcloud pour le projet "${project.name}"`,
        link: `/admin/projets/${projectId}`,
      })
      recipientsNotified.push((manager._id as object).toString())
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { created, errors, projectPath },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
