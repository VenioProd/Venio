import type { FunnelStage, PilotagePeriod } from '../../../../types/pilotage.types'
import { formatMoney } from '../../../../i18n/format'
import { translate, type MessageKey } from '../../../../i18n'

export const STAGE_LABEL_KEYS = {
  LEAD: 'adminTech.pilotage.stage.lead',
  QUALIFIED: 'adminTech.pilotage.stage.qualified',
  CONTACTED: 'adminTech.pilotage.stage.contacted',
  DEMO: 'adminTech.pilotage.stage.demo',
  PROPOSAL: 'adminTech.pilotage.stage.proposal',
  WON: 'adminTech.pilotage.stage.won',
} as const satisfies Record<FunnelStage, MessageKey>

export const PILOTAGE_PERIODS: { key: PilotagePeriod; labelKey: MessageKey }[] = [
  { key: '30d', labelKey: 'adminTech.pilotage.period.d30' },
  { key: '90d', labelKey: 'adminTech.pilotage.period.d90' },
  { key: 'ytd', labelKey: 'adminTech.pilotage.period.ytd' },
  { key: '12m', labelKey: 'adminTech.pilotage.period.m12' },
]

/** Libellé lisible des valeurs que le serveur remonte comme non renseignées. */
export function displayKey(key: string): string {
  return key === 'NON_RENSEIGNE' ? translate('adminTech.pilotage.notSpecified') : key
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : translate('adminTech.pilotage.percent', { value: Math.round(value * 100) })
}

export function formatDays(value: number | null): string {
  if (value === null) return '—'
  return value < 1 ? translate('adminTech.pilotage.daysUnderOne') : translate('adminTech.pilotage.days', { value })
}

export function formatEuro(value: number): string {
  return formatMoney(value, 'EUR', { maximumFractionDigits: 0 })
}
