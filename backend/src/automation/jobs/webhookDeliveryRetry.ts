// ─────────────────────────────────────────────────────────────
// webhooks.delivery_retry
// Reprend les livraisons de webhooks en attente dont le backoff est échu.
// ─────────────────────────────────────────────────────────────

import { registerAutomation } from '../registry.js'
import { processDueDeliveries } from '../../lib/webhooks/deliver.js'
import type { AutomationContext, AutomationDefinition, AutomationResult } from '../types.js'

/** Lot maximum repris par exécution, pour borner la charge d'une minute. */
const BATCH_SIZE = 50

export const definition: AutomationDefinition = {
  key: 'webhooks.delivery_retry',
  title: 'Reprise des livraisons de webhooks',
  domain: 'webhooks',
  triggerType: 'cron',
  schedule: '* * * * *',
  channels: ['system_log'],
  recipientStrategy: [],
  retryable: false,
  maxRetries: 0,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  // Une exécution par minute : la clé porte la minute, sinon le verrou
  // d'idempotence bloquerait toutes les reprises de la journée.
  buildIdempotencyKey: (ctx) =>
    `webhooks.delivery_retry:${ctx.dateKey}:${String(ctx.now.getHours()).padStart(2, '0')}:${String(
      ctx.now.getMinutes(),
    ).padStart(2, '0')}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const result = await processDueDeliveries(ctx.now, BATCH_SIZE)
    return {
      actionsExecuted: [`webhooks:retry:${result.processed}`],
      recipientsNotified: [],
      details: result,
    }
  },
}

export function register() {
  registerAutomation(definition)
}
