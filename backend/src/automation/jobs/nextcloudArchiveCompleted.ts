// ─────────────────────────────────────────────────────────────
// nextcloud.archive_completed_projects
// Archive les dossiers Nextcloud des projets terminés
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import { isNextcloudEnabled, createFolder } from '../../lib/nextcloud.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'
import logger from '../../lib/logger.js'

const ARCHIVE_AFTER_DAYS = 30

function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/[/\\<>:"|?*]/g, '-')
    .replace(/\.\./g, '')
    .replace(/--+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildWebDavUrl(path: string): string {
  const url = process.env.NEXTCLOUD_URL || ''
  const user = process.env.NEXTCLOUD_USER || ''
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  const encodedPath = cleanPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${url}/remote.php/dav/files/${user}/${encodedPath}`
}

function buildAuthHeader(): string {
  const user = process.env.NEXTCLOUD_USER || ''
  const password = process.env.NEXTCLOUD_APP_PASSWORD || ''
  const credentials = Buffer.from(`${user}:${password}`).toString('base64')
  return `Basic ${credentials}`
}

const definition: AutomationDefinition = {
  key: 'nextcloud.archive_completed_projects',
  title: 'Archivage Nextcloud des projets terminés',
  domain: 'nextcloud',
  triggerType: 'cron',
  schedule: '04:00',
  channels: ['in_app', 'system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `nextcloud.archive:${ctx.dateKey}`,

  evaluate: async () => isNextcloudEnabled(),

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Project = mongoose.model('Project')
    const User = mongoose.model('User')

    const cutoffDate = new Date(ctx.now.getTime() - ARCHIVE_AFTER_DAYS * 24 * 3600_000)

    // Find projects that are completed and either archived or delivered > 30 days ago
    const projects = await Project.find({
      status: 'TERMINE',
      $or: [
        { isArchived: true },
        { deliveredAt: { $lt: cutoffDate } },
      ],
    }).populate('client', 'name companyName')

    const basePath = process.env.NEXTCLOUD_BASE_PATH || '/Venio/Clients'
    const archiveYear = ctx.now.getFullYear().toString()
    const archiveBase = `/Venio/Archive/${archiveYear}`

    // Ensure Archive/{year} folder exists
    await createFolder('/Venio/Archive')
    await createFolder(archiveBase)

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []
    const movedProjects: string[] = []
    const errors: string[] = []

    for (const project of projects) {
      const client = project.client as { name?: string; companyName?: string } | null
      const clientName = sanitizeName(client?.companyName || client?.name || 'Sans-Client')
      const projectName = sanitizeName(project.name)

      const sourcePath = `${basePath}/${clientName}/Projets/${projectName}`
      const destPath = `${archiveBase}/${clientName}-${projectName}`

      // Check if source folder exists (PROPFIND)
      try {
        const checkResponse = await fetch(buildWebDavUrl(sourcePath), {
          method: 'PROPFIND',
          headers: {
            Authorization: buildAuthHeader(),
            Depth: '0',
          },
        })

        if (checkResponse.status !== 207) {
          // Folder doesn't exist, skip
          continue
        }

        // Move folder to archive (WebDAV MOVE)
        const moveResponse = await fetch(buildWebDavUrl(sourcePath), {
          method: 'MOVE',
          headers: {
            Authorization: buildAuthHeader(),
            Destination: buildWebDavUrl(destPath),
            Overwrite: 'F',
          },
        })

        if (moveResponse.status === 201 || moveResponse.status === 204) {
          movedProjects.push(`${projectName} (${clientName})`)
          actionsExecuted.push(`archive_moved:project:${(project._id as object).toString()}`)
        } else {
          const errText = await moveResponse.text().catch(() => '')
          errors.push(`${projectName}: HTTP ${moveResponse.status} ${errText.slice(0, 100)}`)
        }
      } catch (err) {
        errors.push(`${projectName}: ${(err as Error).message}`)
      }
    }

    logger.info(`[NEXTCLOUD ARCHIVE] ${movedProjects.length} projet(s) archivé(s)`)
    if (errors.length > 0) {
      logger.warn({ data: errors }, `[NEXTCLOUD ARCHIVE] ${errors.length} erreur(s):`)
    }

    // Notify SUPER_ADMINs if projects were moved
    if (movedProjects.length > 0) {
      const admins = await User.find({
        role: 'SUPER_ADMIN',
        isActive: { $ne: false },
      }).select('_id')

      const summary = movedProjects
        .slice(0, 10)
        .map((p) => `• ${p}`)
        .join('\n')

      for (const admin of admins) {
        await createNotification({
          recipient: (admin._id as object).toString(),
          type: 'NEXTCLOUD_ARCHIVE' as never,
          title: `${movedProjects.length} projet(s) archivé(s) sur Nextcloud`,
          message: summary + (movedProjects.length > 10 ? `\n... et ${movedProjects.length - 10} autre(s)` : ''),
          link: '/admin/projets',
        })
        recipientsNotified.push((admin._id as object).toString())
      }
    }

    return {
      actionsExecuted: actionsExecuted.length > 0 ? actionsExecuted : ['nextcloud_archive_check:none_to_move'],
      recipientsNotified,
      details: {
        projectsChecked: projects.length,
        projectsMoved: movedProjects.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
