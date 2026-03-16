// ─────────────────────────────────────────────────────────────
// Phase 3: nextcloud.repair_missing_structures
// Répare les structures Nextcloud manquantes (recrée les dossiers)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import { createFolder, createClientFolders, isNextcloudEnabled } from '../../lib/nextcloud.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/[/\\<>:"|?*]/g, '-')
    .replace(/\.\./g, '')
    .replace(/--+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const PROJECT_SUBFOLDERS = [
  'Livrables', 'Contrats', 'Factures', 'Briefs', 'Assets', 'Communication', 'Exports',
]

const definition: AutomationDefinition = {
  key: 'nextcloud.repair_missing_structures',
  title: 'Réparation structures Nextcloud manquantes',
  domain: 'nextcloud',
  triggerType: 'cron',
  schedule: '04:30',
  channels: ['in_app', 'system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: false, // Manual activation for safety
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `nextcloud.repair:${ctx.dateKey}`,

  evaluate: async () => isNextcloudEnabled(),

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const User = mongoose.model('User')
    const Project = mongoose.model('Project')

    const basePath = process.env.NEXTCLOUD_BASE_PATH || '/Venio/Clients'
    const nextcloudUrl = process.env.NEXTCLOUD_URL || ''
    const nextcloudUser = process.env.NEXTCLOUD_USER || ''
    const nextcloudPassword = process.env.NEXTCLOUD_APP_PASSWORD || ''

    if (!nextcloudUrl || !nextcloudUser || !nextcloudPassword) {
      return {
        actionsExecuted: ['skipped:not_configured'],
        recipientsNotified: [],
      }
    }

    const authHeader = `Basic ${Buffer.from(`${nextcloudUser}:${nextcloudPassword}`).toString('base64')}`

    async function folderExists(path: string): Promise<boolean> {
      const cleanPath = path.startsWith('/') ? path.slice(1) : path
      const encodedPath = cleanPath.split('/').map((s) => encodeURIComponent(s)).join('/')
      const url = `${nextcloudUrl}/remote.php/dav/files/${nextcloudUser}/${encodedPath}`
      try {
        const res = await fetch(url, {
          method: 'PROPFIND',
          headers: { Authorization: authHeader, Depth: '0' },
        })
        return res.status === 207
      } catch {
        return false
      }
    }

    const repairedClients: string[] = []
    const repairedProjects: string[] = []
    const errors: string[] = []

    // Repair client folders
    const clients = await User.find({
      role: 'CLIENT',
      isActive: { $ne: false },
    }).select('name companyName _id')

    for (const client of clients) {
      const name = sanitizeName(client.companyName || client.name || '')
      if (!name) continue

      const clientPath = `${basePath}/${name}`
      const exists = await folderExists(clientPath)

      if (!exists) {
        const result = await createClientFolders(name, client._id.toString())
        if (result.success) {
          repairedClients.push(name)
        } else {
          errors.push(`Client ${name}: ${result.error}`)
        }
      }
    }

    // Repair project folders
    const projects = await Project.find({
      status: 'EN_COURS',
      isArchived: { $ne: true },
    }).populate('client', 'name companyName').select('name client')

    for (const project of projects) {
      const client = project.client as { name?: string; companyName?: string } | null
      const clientName = sanitizeName(client?.companyName || client?.name || '')
      const projectName = sanitizeName(project.name)
      if (!clientName || !projectName) continue

      const projectPath = `${basePath}/${clientName}/Projets/${projectName}`
      const exists = await folderExists(projectPath)

      if (!exists) {
        // Create project folder + subfolders
        const rootResult = await createFolder(projectPath)
        if (rootResult.success) {
          for (const sub of PROJECT_SUBFOLDERS) {
            await createFolder(`${projectPath}/${sub}`)
          }
          // Admin + Client spaces
          await createFolder(`${projectPath}/_Admin`)
          await createFolder(`${projectPath}/_Client`)
          repairedProjects.push(`${clientName}/${projectName}`)
        } else {
          errors.push(`Project ${projectName}: ${rootResult.error}`)
        }
      }
    }

    const totalRepaired = repairedClients.length + repairedProjects.length
    const actionsExecuted = [`repair:${totalRepaired}_fixed:${errors.length}_errors`]
    const recipientsNotified: string[] = []

    if (totalRepaired > 0 || errors.length > 0) {
      const admins = await User.find({
        role: 'SUPER_ADMIN',
        isActive: { $ne: false },
      }).select('_id')

      const lines: string[] = []
      if (repairedClients.length > 0) {
        lines.push(`Clients réparés: ${repairedClients.join(', ')}`)
      }
      if (repairedProjects.length > 0) {
        lines.push(`Projets réparés: ${repairedProjects.join(', ')}`)
      }
      if (errors.length > 0) {
        lines.push(`Erreurs: ${errors.length}`)
      }

      for (const admin of admins) {
        await createNotification({
          recipient: admin._id.toString(),
          type: 'SYSTEM_ALERT' as never,
          title: `Nextcloud : ${totalRepaired} structure(s) réparée(s)`,
          message: lines.join('\n'),
          link: '/admin/audit',
        })
        recipientsNotified.push(admin._id.toString())
      }
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: {
        repairedClients,
        repairedProjects,
        errors,
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
