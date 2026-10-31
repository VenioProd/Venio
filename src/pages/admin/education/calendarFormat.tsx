/**
 * Formatage partagé du calendrier pédagogique et des fiches séance (langue active).
 */
import { Fragment, type ReactNode } from 'react'
import { translate, type MessageKey, type MessageParams } from '../../../i18n'
import { formatDate, formatTime } from '../../../i18n/format'

const SENTINEL = '\u0000'

/** Majuscule initiale (les mois et jours Intl sont en minuscules en français). */
function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

/** Nom du jour court (« Lun » / « Mon »), `index` 0 = lundi. */
export function weekdayShort(index: number): string {
  return capitalize(formatDate(new Date(2024, 0, 1 + index), { weekday: 'short' }).replace(/\.$/, ''))
}

export function weekdayLong(date: Date): string {
  return capitalize(formatDate(date, { weekday: 'long' }))
}

export function monthName(date: Date): string {
  return capitalize(formatDate(date, { month: 'long' }))
}

export function formatClock(iso: string): string {
  return formatTime(iso, { hour: '2-digit', minute: '2-digit' })
}

export function formatRange(start: string, end: string, allDay: boolean): string {
  if (allDay) return translate('eduB.shared.allDay')
  return `${formatClock(start)} – ${formatClock(end)}`
}

export function durationLabel(min: number): string {
  if (min < 60) return translate('eduB.duration.min', { n: min })
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0
    ? translate('eduB.duration.hours', { h })
    : translate('eduB.duration.hoursMin', { h, m: String(m).padStart(2, '0') })
}

/**
 * Traduit une phrase dont un morceau est un élément React (gras, code…) :
 * la clé contient `{name}` à l'endroit où l'élément doit apparaître.
 */
export function messageWithNode(key: MessageKey, name: string, node: ReactNode, params: MessageParams = {}): ReactNode {
  const parts = translate(key, { ...params, [name]: SENTINEL }).split(SENTINEL)
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && node}
      {part}
    </Fragment>
  ))
}
