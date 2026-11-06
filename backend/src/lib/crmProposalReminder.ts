import CrmSettings from '../models/CrmSettings.js'

/**
 * Seuil unique de la relance de proposition : nombre de jours passés en
 * PROPOSAL avant de relancer le responsable. Lu dans `CrmSettings`
 * (`proposalReminderDays`), il sert aux deux sources possibles de cette
 * relance, qui ne tournent jamais ensemble (voir `crmJobAbstention`) :
 *   - le planificateur CRM (`processProposalReminders`, e-mail) ;
 *   - le job `crm.proposal_followup` (notification), jusqu'ici figé à 5 jours.
 * La règle `proposition-sans-reponse` garde son propre délai (ses conditions).
 */
export const DEFAULT_PROPOSAL_REMINDER_DAYS = 7

/** Valeur effective : un réglage absent, nul ou invalide retombe sur la valeur par défaut. */
export function proposalReminderDaysOf(settings: { proposalReminderDays?: unknown } | null | undefined): number {
  const days = Number(settings?.proposalReminderDays)
  return Number.isFinite(days) && days >= 1 ? Math.floor(days) : DEFAULT_PROPOSAL_REMINDER_DAYS
}

/** Une proposition dont `statusChangedAt` est antérieur à cette date est à relancer. */
export function proposalReminderCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 3600_000)
}

export async function getProposalReminderDays(): Promise<number> {
  return proposalReminderDaysOf(await CrmSettings.getSettings())
}
