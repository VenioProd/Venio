import { intlLocale } from './index'

type DateInput = Date | string | number | null | undefined

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Date in the active UI language. Returns '' for an empty/invalid input. */
export function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions = {}): string {
  const date = toDate(value)
  if (!date) return ''
  const withDefaults: Intl.DateTimeFormatOptions = Object.keys(options).length
    ? options
    : { day: '2-digit', month: '2-digit', year: 'numeric' }
  return new Intl.DateTimeFormat(intlLocale(), withDefaults).format(date)
}

/** Date + time in the active UI language. */
export function formatDateTime(value: DateInput, options: Intl.DateTimeFormatOptions = {}): string {
  const date = toDate(value)
  if (!date) return ''
  const withDefaults: Intl.DateTimeFormatOptions = Object.keys(options).length
    ? options
    : { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
  return new Intl.DateTimeFormat(intlLocale(), withDefaults).format(date)
}

export function formatTime(value: DateInput, options: Intl.DateTimeFormatOptions = {}): string {
  const date = toDate(value)
  if (!date) return ''
  const withDefaults: Intl.DateTimeFormatOptions = Object.keys(options).length
    ? options
    : { hour: '2-digit', minute: '2-digit' }
  return new Intl.DateTimeFormat(intlLocale(), withDefaults).format(date)
}

export function formatNumber(value: number | null | undefined, options: Intl.NumberFormatOptions = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return new Intl.NumberFormat(intlLocale(), options).format(value)
}

/** Money amount with a currency symbol, e.g. `1 234,56 €` (fr) / `€1,234.56` (en). */
export function formatMoney(
  value: number | null | undefined,
  currency = 'EUR',
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return new Intl.NumberFormat(intlLocale(), { style: 'currency', currency, ...options }).format(value)
}

export function formatPercent(value: number | null | undefined, options: Intl.NumberFormatOptions = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return new Intl.NumberFormat(intlLocale(), { style: 'percent', ...options }).format(value)
}

/** Month/weekday names etc. — thin wrapper so callers never hard-code 'fr-FR'. */
export function formatWith(value: DateInput, options: Intl.DateTimeFormatOptions): string {
  return formatDate(value, options)
}
