// ─────────────────────────────────────────────────────────────
// crm.sequences
// Déroule les séquences d'e-mails du CRM : toutes les 5 minutes, exécute les
// étapes échues (e-mail, tâche, attente) des inscriptions actives.
// Toute la logique (jours ouvrés, heure de Paris, opposition, verrou par
// étape) vit dans lib/crmSequences.ts.
// ─────────────────────────────────────────────────────────────

import { registerAutomation } from '../registry.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const pad = (n: number) => String(n).padStart(2, '0')

export const definition: AutomationDefinition = {
  key: 'crm.sequences',
  title: 'Séquences d’e-mails du CRM',
  domain: 'crm',
  triggerType: 'cron',
  schedule: '*/5 * * * *',
  channels: ['system_log'],
  recipientStrategy: [],
  retryable: false,
  maxRetries: 0,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  // Une clé par tranche de 5 minutes : sinon le verrou d'idempotence bloquerait la journée.
  // Le verrou par étape (SchedulerLock) reste la vraie garantie d'unicité des envois.
  buildIdempotencyKey: (ctx) =>
    `crm.sequences:${ctx.dateKey}:${pad(ctx.now.getHours())}:${pad(Math.floor(ctx.now.getMinutes() / 5) * 5)}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const { runSequenceTick } = await import('../../lib/crmSequences.js')
    const summary = await runSequenceTick(ctx.now)
    return {
      actionsExecuted: Object.entries(summary.outcomes).map(([k, n]) => `sequences:${k.toLowerCase()}:${n}`),
      recipientsNotified: [],
      details: { ...summary },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
