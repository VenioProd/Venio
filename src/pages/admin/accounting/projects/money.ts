import { translate } from '../../../../i18n'
import { formatMoney as formatCurrency, formatNumber } from '../../../../i18n/format'

export function formatMoney(cents: number): string {
  return formatCurrency(cents / 100)
}

export function parseMoney(value: string, allowZero = false): number {
  const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(value.trim())
  if (!match) throw new Error(translate('accProjects.common.parseAmount'))
  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents < 0 || (!allowZero && cents === 0)) {
    throw new Error(translate('accProjects.common.parseRange'))
  }
  return cents
}

export function formatPercent(bp: number): string {
  return translate('accProjects.common.percent', { value: formatNumber(bp / 100, { maximumFractionDigits: 2 }) })
}
