import type { QualiopiStatus, QualiopiIndicator, QualiopiSubElement } from '../../../types/qualiopi.types'
import { translate } from '../../../i18n'
import { formatDate } from '../../../i18n/format'
import type { MessageKey } from '../../../i18n'

export type {
  QualiopiCriterion,
  QualiopiIndicator,
  QualiopiSubElement,
  QualiopiStatus,
  QualiopiFile,
} from '../../../types/qualiopi.types'

export const STATUS_CONFIG: Record<QualiopiStatus, { labelKey: MessageKey; color: string; bg: string }> = {
  A_FAIRE: { labelKey: 'orgs.qualiopi.status.todo', color: 'var(--text-secondary)', bg: 'var(--bg-secondary)' },
  EN_COURS: { labelKey: 'orgs.qualiopi.status.inProgress', color: 'var(--warning)', bg: 'var(--bg-secondary)' },
  FAIT: { labelKey: 'orgs.qualiopi.status.done', color: 'var(--good)', bg: 'var(--bg-secondary)' },
  BLOQUE: { labelKey: 'orgs.qualiopi.status.blocked', color: 'var(--critical)', bg: 'var(--bg-secondary)' },
  NON_CONCERNE: {
    labelKey: 'orgs.qualiopi.status.notApplicable',
    color: 'var(--text-muted)',
    bg: 'var(--bg-secondary)',
  },
}

/** Options de statut pour les listes déroulantes, libellés dans la langue active. */
export function statusOptions() {
  return Object.entries(STATUS_CONFIG).map(([value, { labelKey }]) => ({ value, label: translate(labelKey) }))
}

/** Taille de fichier lisible (Ko / Mo en français, KB / MB en anglais). */
export function formatFileSize(size: number): string {
  return size > 1024 * 1024
    ? translate('orgs.qualiopi.file.sizeMega', { value: (size / (1024 * 1024)).toFixed(1) })
    : translate('orgs.qualiopi.file.sizeKilo', { value: Math.round(size / 1024) })
}

export function formatFileDate(value: string): string {
  return formatDate(value, { day: '2-digit', month: 'short', year: 'numeric' })
}

export const CRITERIA_COLORS = [
  'var(--critical)',
  'var(--cat-2)',
  'var(--primary)',
  'var(--warning)',
  'var(--good)',
  'var(--critical)',
  'var(--cat-2)',
]

export function getProgress(indicators: QualiopiIndicator[]) {
  const total = indicators.length
  if (total === 0) return { done: 0, inProgress: 0, blocked: 0, total: 0, percent: 0 }
  const done = indicators.filter((i) => i.status === 'FAIT' || i.status === 'NON_CONCERNE').length
  const inProgress = indicators.filter((i) => i.status === 'EN_COURS').length
  const blocked = indicators.filter((i) => i.status === 'BLOQUE').length
  return { done, inProgress, blocked, total, percent: Math.round((done / total) * 100) }
}

export function getSubProgress(subs: QualiopiSubElement[]) {
  const total = subs.length
  if (total === 0) return { done: 0, total: 0 }
  const done = subs.filter((s) => s.status === 'FAIT' || s.status === 'NON_CONCERNE').length
  return { done, total }
}
