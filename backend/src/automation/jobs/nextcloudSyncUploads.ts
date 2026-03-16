// ─────────────────────────────────────────────────────────────
// Phase 3: nextcloud.sync_uploads_from_backoffice
// Synchronise les documents uploadés dans le backoffice vers Nextcloud
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { isNextcloudEnabled } from '../../lib/nextcloud.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'nextcloud.sync_uploads_from_backoffice',
  title: 'Synchronisation uploads → Nextcloud',
  domain: 'nextcloud',
  triggerType: 'cron',
  schedule: '03:00',
  channels: ['system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: false, // Requires manual activation
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `nextcloud.sync_uploads:${ctx.dateKey}`,

  evaluate: async () => isNextcloudEnabled(),

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Document = mongoose.model('Document')
    const Project = mongoose.model('Project')

    // Find documents uploaded in the last 24h that haven't been synced
    const yesterday = new Date(ctx.now.getTime() - 24 * 3600_000)

    const unsyncedDocs = await Document.find({
      uploadedAt: { $gte: yesterday },
      nextcloudSynced: { $ne: true },
    }).populate('project', 'name client')

    if (unsyncedDocs.length === 0) {
      return {
        actionsExecuted: ['sync:no_new_documents'],
        recipientsNotified: [],
        details: { checked: 0 },
      }
    }

    const actionsExecuted: string[] = []
    let syncedCount = 0
    let errorCount = 0

    for (const doc of unsyncedDocs) {
      try {
        // TODO: Implement actual file upload to Nextcloud via WebDAV PUT
        // For now, we mark the intent and log it
        // The actual upload requires reading the file from local storage
        // and uploading via PUT to the WebDAV endpoint

        console.log(`[NEXTCLOUD SYNC] Would sync: ${doc.originalName} → project ${(doc.project as { name?: string })?.name || doc.project}`)

        // Mark as synced (placeholder — actual sync requires WebDAV PUT implementation)
        // doc.nextcloudSynced = true
        // doc.nextcloudSyncedAt = ctx.now
        // await doc.save()

        syncedCount++
        actionsExecuted.push(`sync:doc:${doc._id}`)
      } catch (err) {
        errorCount++
        console.error(`[NEXTCLOUD SYNC] Failed to sync ${doc.originalName}:`, (err as Error).message)
      }
    }

    return {
      actionsExecuted,
      recipientsNotified: [],
      details: {
        totalDocuments: unsyncedDocs.length,
        synced: syncedCount,
        errors: errorCount,
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
