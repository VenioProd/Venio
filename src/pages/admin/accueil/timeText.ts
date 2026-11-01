import type { MessageKey, MessageParams } from '../../../i18n'
import { formatDate, formatTime } from '../../../i18n/format'

type T = (key: MessageKey, params?: MessageParams) => string

const MINUTE = 60_000
const DAY = 86_400_000

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Écart en jours calendaires (positif = dans le futur). */
export function dayDiff(target: Date, now: Date): number {
  return Math.round((dayStart(target) - dayStart(now)) / DAY)
}

/** « 2 h 40 », « 35 min ». */
export function duration(t: T, ms: number): string {
  const total = Math.max(1, Math.round(Math.abs(ms) / MINUTE))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return t('home.time.minutes', { m })
  if (m === 0) return t('home.time.hours', { h })
  return t('home.time.hoursMinutes', { h, m: m < 10 ? `0${m}` : m })
}

/** Durée d'un créneau en minutes. */
export function slotDuration(t: T, minutes: number): string {
  return duration(t, minutes * MINUTE)
}

/** « il y a 3 j », « hier », « aujourd’hui ». */
export function ago(t: T, iso: string | null, now: Date): string {
  if (!iso) return ''
  const diff = -dayDiff(new Date(iso), now)
  if (diff <= 0) return t('home.time.today')
  if (diff === 1) return t('home.time.yesterday')
  return t('home.time.daysAgo', { count: diff })
}

/** Jour court relatif : « auj. », « demain », « mar. 3 nov. ». */
export function shortDay(t: T, date: Date, now: Date): string {
  const diff = dayDiff(date, now)
  if (diff === 0) return t('home.time.today')
  if (diff === 1) return t('home.time.tomorrow')
  if (diff === -1) return t('home.time.yesterday')
  return formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function timeOf(date: Date): string {
  return formatTime(date)
}

/** Horodatage d'une notification : heure si aujourd'hui, sinon jour court. */
export function stamp(t: T, iso: string, now: Date): string {
  const d = new Date(iso)
  return dayDiff(d, now) === 0 ? formatTime(d) : shortDay(t, d, now)
}
