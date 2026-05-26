// ─────────────────────────────────────────────────────────────
// infra.mongodb_health_check
// Vérification quotidienne de la santé MongoDB
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'infra.mongodb_health_check',
  title: 'Vérification santé MongoDB',
  domain: 'infra',
  triggerType: 'cron',
  schedule: '06:00',
  channels: ['in_app', 'system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `infra.mongo_health:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (_ctx: AutomationContext): Promise<AutomationResult> => {
    const User = mongoose.model('User')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    const readyState = mongoose.connection.readyState
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    const stateLabels: Record<number, string> = {
      0: 'Déconnecté',
      1: 'Connecté',
      2: 'En cours de connexion',
      3: 'En cours de déconnexion',
    }
    const stateLabel = stateLabels[readyState] || 'Inconnu'

    let dbStats: Record<string, unknown> = {}

    if (readyState === 1 && mongoose.connection.db) {
      try {
        const stats = await mongoose.connection.db.stats()
        dbStats = {
          dataSize: stats.dataSize,
          storageSize: stats.storageSize,
          collections: stats.collections,
          objects: stats.objects,
          indexes: stats.indexes,
        }
        console.log(`[MONGO HEALTH] Connected — ${stats.collections} collection(s), dataSize: ${Math.round((stats.dataSize || 0) / 1024 / 1024)}MB`)
      } catch (err) {
        console.warn(`[MONGO HEALTH] Connected but stats failed: ${(err as Error).message}`)
        dbStats = { error: (err as Error).message }
      }
    }

    actionsExecuted.push(`mongo_health:state_${readyState}`)

    if (readyState !== 1) {
      console.error(`[MONGO HEALTH] MongoDB is NOT connected (state: ${stateLabel})`)

      const admins = await User.find({
        role: 'SUPER_ADMIN',
        isActive: { $ne: false },
      }).select('_id')

      for (const admin of admins) {
        await createNotification({
          recipient: (admin._id as object).toString(),
          type: 'SYSTEM_ALERT' as never,
          title: 'ALERTE : MongoDB non connecté',
          message: `L'état de la connexion MongoDB est : ${stateLabel} (code: ${readyState}). Vérifiez immédiatement la base de données.`,
          link: '/admin/settings',
        })
        recipientsNotified.push((admin._id as object).toString())
      }
    } else {
      console.log(`[MONGO HEALTH] MongoDB health check passed — ${stateLabel}`)
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: {
        readyState,
        stateLabel,
        ...dbStats,
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
