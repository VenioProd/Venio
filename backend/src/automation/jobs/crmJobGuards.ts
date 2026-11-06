// ─────────────────────────────────────────────────────────────
// Une seule source par comportement (voir la table en tête de
// lib/crmScheduler.ts) : un job CRM s'abstient quand une source prioritaire
// assure déjà le même comportement.
//   1. la règle CrmRule prédéfinie équivalente est ACTIVE ;
//   2. sinon, le planificateur CRM l'assure (son réglage est activé).
// ─────────────────────────────────────────────────────────────

import CrmSettings from '../../models/CrmSettings.js'
import { isCoveredByActiveRule, SYSTEM_RULE_FOR, type CoveredBehavior } from '../../lib/crmRules.js'
import type { ICrmSettings } from '../../types/models/index.js'

/** Réglages du planificateur CRM qui couvrent un comportement de job. */
export type SchedulerToggle = 'proposalReminderEnabled' | 'coldLeadEmailEnabled'

/**
 * Rend la raison de l'abstention (`rule:<systemKey>` ou `scheduler:<réglage>`),
 * ou `null` si le job doit agir.
 */
export async function crmJobAbstention(behavior: CoveredBehavior, schedulerToggle?: SchedulerToggle): Promise<string | null> {
  if (await isCoveredByActiveRule(behavior)) return `rule:${SYSTEM_RULE_FOR[behavior]}`
  if (schedulerToggle) {
    const settings = (await CrmSettings.getSettings()) as ICrmSettings
    if (settings?.[schedulerToggle]) return `scheduler:${schedulerToggle}`
  }
  return null
}
