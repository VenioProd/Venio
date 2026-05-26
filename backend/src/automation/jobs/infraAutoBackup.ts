// ─────────────────────────────────────────────────────────────
// infra.auto_backup
// Sauvegarde automatique quotidienne MongoDB
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import { createBackup } from '../../lib/backup.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'
import logger from '../../lib/logger.js'

const definition: AutomationDefinition = {
  key: 'infra.auto_backup',
  title: 'Sauvegarde automatique MongoDB',
  domain: 'infra',
  triggerType: 'cron',
  schedule: '01:00',
  channels: ['system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 3,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `infra.backup:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const User = mongoose.model('User')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    const result = createBackup()

    if (result.success) {
      logger.info(`[INFRA BACKUP] Backup created successfully: ${result.path}`)
      actionsExecuted.push(`backup_success:${result.path}`)
    } else {
      logger.error(`[INFRA BACKUP] Backup failed: ${result.error}`)
      actionsExecuted.push(`backup_failed:${result.error}`)

      // Notify SUPER_ADMINs on failure
      const admins = await User.find({
        role: 'SUPER_ADMIN',
        isActive: { $ne: false },
      }).select('_id')

      for (const admin of admins) {
        await createNotification({
          recipient: (admin._id as object).toString(),
          type: 'SYSTEM_ALERT' as never,
          title: 'Echec de la sauvegarde automatique',
          message: `La sauvegarde automatique a échoué : ${result.error || 'Erreur inconnue'}`,
          link: '/admin/settings',
        })
        recipientsNotified.push((admin._id as object).toString())
      }
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: {
        success: result.success,
        path: result.path,
        error: result.error,
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
