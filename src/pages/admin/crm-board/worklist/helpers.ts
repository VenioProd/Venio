import { translate, type MessageKey } from '../../../../i18n'
import { formatDate, formatMoney } from '../../../../i18n/format'
import type { Lead, WorklistFollowUp, WorklistGroupKey, WorklistThresholds } from '../../../../types/crm.types'

export type { WorklistFollowUp }

export const DEFAULT_FOLLOW_UP: WorklistFollowUp = { demoDays: 1, proposalDays: 3, defaultDays: 3 }

export function followUpDaysFor(status: string, followUp: WorklistFollowUp): number {
  if (status === 'DEMO') return followUp.demoDays
  if (status === 'PROPOSAL') return followUp.proposalDays
  return followUp.defaultDays
}

export const WORKLIST_GROUPS: { key: WorklistGroupKey; labelKey: MessageKey; hintKey: MessageKey }[] = [
  { key: 'overdue', labelKey: 'crm.worklist.overdue', hintKey: 'crm.worklist.overdueHint' },
  { key: 'today', labelKey: 'crm.worklist.today', hintKey: 'crm.worklist.todayHint' },
  { key: 'upcoming', labelKey: 'crm.worklist.upcoming', hintKey: 'crm.worklist.upcomingHint' },
  { key: 'drifting', labelKey: 'crm.worklist.drifting', hintKey: 'crm.worklist.driftingHint' },
]

const MS_PER_DAY = 1000 * 60 * 60 * 24

function daysBetween(value: string): number {
  return Math.floor((Date.now() - new Date(value).getTime()) / MS_PER_DAY)
}

/**
 * Pourquoi cette ligne est dans la file, en une formule courte. On préfère la
 * raison la plus actionnable : une échéance datée avant un signal de dérive.
 */
export function describeDue(lead: Lead, thresholds: WorklistThresholds): string {
  if (lead.nextActionAt) {
    const date = new Date(lead.nextActionAt)
    if (!Number.isNaN(date.getTime()))
      return translate('crm.worklist.followUpOn', { date: formatDate(date, { day: '2-digit', month: 'short' }) })
  }
  if (thresholds.coldEnabled && lead.lastContactAt) {
    const days = daysBetween(lead.lastContactAt)
    if (days >= thresholds.coldDays) return translate('crm.worklist.noContactSince', { days })
  }
  if (thresholds.staleEnabled && lead.statusChangedAt) {
    const days = daysBetween(lead.statusChangedAt)
    if (days >= thresholds.staleDays) return translate('crm.worklist.sameStatusSince', { days })
  }
  return translate('crm.worklist.toHandle')
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

/** Jours civils écoulés entre `value` et `now` (négatif dans le futur). */
export function calendarDaysAgo(value: string | Date, now: Date = new Date()): number {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / MS_PER_DAY)
}

/** Heure à la française (« 10 h 30 ») ou à l'anglaise (« 10:30 »), selon la langue. */
export function clockLabel(value: string | Date): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return translate('crmToday.clock', {
    hour: String(date.getHours()),
    minute: String(date.getMinutes()).padStart(2, '0'),
  })
}

/**
 * Colonne de gauche d'une ligne de la file : retard (« −2 j »), heure du jour,
 * jour à venir (« Demain », « lun. 16 »), montant d'une fiche qui refroidit.
 * Vide quand la donnée manque : aucun chiffre n'est inventé.
 */
export function leadCellLabel(lead: Lead, group: WorklistGroupKey, now: Date = new Date()): string {
  if (group === 'drifting') return lead.budget ? formatMoney(lead.budget, 'EUR', { maximumFractionDigits: 0 }) : ''
  if (!lead.nextActionAt) return ''
  if (group === 'overdue')
    return translate('crmToday.daysLate', { days: Math.max(1, calendarDaysAgo(lead.nextActionAt, now)) })
  if (group === 'today') return clockLabel(lead.nextActionAt)
  if (calendarDaysAgo(lead.nextActionAt, now) === -1) return translate('crmToday.tomorrow')
  return formatDate(lead.nextActionAt, { weekday: 'short', day: 'numeric' })
}
