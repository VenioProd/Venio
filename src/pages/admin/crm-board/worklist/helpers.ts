import { translate, type MessageKey } from '../../../../i18n'
import { formatDate } from '../../../../i18n/format'
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
