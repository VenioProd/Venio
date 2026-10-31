/**
 * Formatage localisé (langue active) des tailles de fichier et des dates de l'espace éducation.
 * Même rendu que `formatFileSize` / `formatDate` / `formatRelative` du service en français.
 */
import { translate } from '../../../i18n'
import { formatDate, formatDateTime } from '../../../i18n/format'

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return translate('eduA.fileSize.bytes', { n: bytes })
  if (bytes < 1024 * 1024)
    return translate('eduA.fileSize.kb', { n: (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) })
  return translate('eduA.fileSize.mb', { n: (bytes / (1024 * 1024)).toFixed(1) })
}

export function formatShortDate(date: string | null | undefined, withTime = false): string {
  if (!date) return '—'
  if (withTime) return formatDateTime(date, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  return formatDate(date, { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatRelativeDate(date: string | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  const min = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (min < 1) return translate('eduA.relative.now')
  if (min < 60) return translate('eduA.relative.minutes', { n: min })
  const h = Math.floor(min / 60)
  if (h < 24) return translate('eduA.relative.hours', { n: h })
  const days = Math.floor(h / 24)
  if (days < 7) return translate('eduA.relative.days', { n: days })
  return formatDate(d)
}
