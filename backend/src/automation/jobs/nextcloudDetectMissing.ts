// ─────────────────────────────────────────────────────────────
// Phase 3: nextcloud.detect_missing_structures
// Détecte les clients/projets sans structure Nextcloud
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import { isNextcloudEnabled } from '../../lib/nextcloud.js'
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

const definition: AutomationDefinition = {
  key: 'nextcloud.detect_missing_structures',
  title: 'Détection structures Nextcloud manquantes',
  domain: 'nextcloud',
  triggerType: 'cron',
  schedule: '04:00',
  channels: ['in_app', 'system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 1,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `nextcloud.detect_missing:${ctx.dateKey}`,

  evaluate: async () => isNextcloudEnabled(),

  execute: async (_ctx: AutomationContext): Promise<AutomationResult> => {
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

    // Helper: check if a folder exists via PROPFIND
    async function folderExists(path: string): Promise<boolean> {
      const cleanPath = path.startsWith('/') ? path.slice(1) : path
      const encodedPath = cleanPath.split('/').map((s) => encodeURIComponent(s)).join('/')
      const url = `${nextcloudUrl}/remote.php/dav/files/${nextcloudUser}/${encodedPath}`

      try {
        const res = await fetch(url, {
          method: 'PROPFIND',
          headers: {
            Authorization: authHeader,
            Depth: '0',
          },
        })
        return res.status === 207 // Multi-Status = exists
      } catch {
        return false
      }
    }

    const missingClients: string[] = []
    const missingProjects: string[] = []

    // Check active clients
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
        missingClients.push(name)
      }
    }

    // Check active projects
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
        missingProjects.push(`${clientName}/${projectName}`)
      }
    }

    const totalMissing = missingClients.length + missingProjects.length
    const actionsExecuted = [`detect_missing:${totalMissing}_found`]
    const recipientsNotified: string[] = []

    if (totalMissing > 0) {
      const admins = await User.find({
        role: 'SUPER_ADMIN',
        isActive: { $ne: false },
      }).select('_id')

      const lines: string[] = []
      if (missingClients.length > 0) {
        lines.push(`Clients sans dossier: ${missingClients.slice(0, 5).join(', ')}${missingClients.length > 5 ? ` (+${missingClients.length - 5})` : ''}`)
      }
      if (missingProjects.length > 0) {
        lines.push(`Projets sans dossier: ${missingProjects.slice(0, 5).join(', ')}${missingProjects.length > 5 ? ` (+${missingProjects.length - 5})` : ''}`)
      }

      for (const admin of admins) {
        await createNotification({
          recipient: admin._id.toString(),
          type: 'SYSTEM_ALERT' as never,
          title: `Nextcloud : ${totalMissing} structure(s) manquante(s)`,
          message: lines.join('\n'),
          link: '/admin/audit',
        })
        recipientsNotified.push(admin._id.toString())
      }

      console.warn(`[NEXTCLOUD DETECT] ${totalMissing} missing structure(s):`)
      for (const c of missingClients) console.warn(`  Client: ${c}`)
      for (const p of missingProjects) console.warn(`  Project: ${p}`)
    } else {
      console.log('[NEXTCLOUD DETECT] All structures present ✓')
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: {
        clientsChecked: clients.length,
        projectsChecked: projects.length,
        missingClients,
        missingProjects,
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
