import type { Lead, WorklistFollowUp, WorklistGroupKey, WorklistThresholds } from '../../../../types/crm.types'

export type { WorklistFollowUp }

export const DEFAULT_FOLLOW_UP: WorklistFollowUp = { demoDays: 1, proposalDays: 3, defaultDays: 3 }

export function followUpDaysFor(status: string, followUp: WorklistFollowUp): number {
  if (status === 'DEMO') return followUp.demoDays
  if (status === 'PROPOSAL') return followUp.proposalDays
  return followUp.defaultDays
}

export const WORKLIST_GROUPS: { key: WorklistGroupKey; label: string; hint: string }[] = [
  { key: 'overdue', label: 'En retard', hint: 'La relance était due' },
  { key: 'today', label: "Aujourd'hui", hint: 'À traiter dans la journée' },
  { key: 'upcoming', label: 'Cette semaine', hint: 'Les 7 prochains jours' },
  { key: 'drifting', label: 'À ne pas laisser filer', hint: 'Sans échéance, mais en train de refroidir' },
]

const MS_PER_DAY = 1000 * 60 * 60 * 24

function daysBetween(value: string): number {
  return Math.floor((Date.now() - new Date(value).getTime()) / MS_PER_DAY)
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' })

/**
 * Pourquoi cette ligne est dans la file, en une formule courte. On préfère la
 * raison la plus actionnable : une échéance datée avant un signal de dérive.
 */
export function describeDue(lead: Lead, thresholds: WorklistThresholds): string {
  if (lead.nextActionAt) {
    const date = new Date(lead.nextActionAt)
    if (!Number.isNaN(date.getTime())) return `Relance ${dateFormat.format(date)}`
  }
  if (thresholds.coldEnabled && lead.lastContactAt) {
    const days = daysBetween(lead.lastContactAt)
    if (days >= thresholds.coldDays) return `Sans contact depuis ${days} j`
  }
  if (thresholds.staleEnabled && lead.statusChangedAt) {
    const days = daysBetween(lead.statusChangedAt)
    if (days >= thresholds.staleDays) return `Même statut depuis ${days} j`
  }
  return 'À traiter'
}
