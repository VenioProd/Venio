import type { QualiopiStatus, QualiopiIndicator, QualiopiSubElement } from '@/types/qualiopi.types'

export type { QualiopiCriterion, QualiopiIndicator, QualiopiSubElement, QualiopiStatus, QualiopiFile } from '@/types/qualiopi.types'

export const STATUS_CONFIG: Record<QualiopiStatus, { label: string; color: string; bg: string }> = {
  A_FAIRE: { label: 'A faire', color: '#94a3b8', bg: '#010104' },
  EN_COURS: { label: 'En cours', color: '#f59e0b', bg: '#010104' },
  FAIT: { label: 'Fait', color: '#22c55e', bg: '#010104' },
  BLOQUE: { label: 'Bloque', color: '#ef4444', bg: '#010104' },
  NON_CONCERNE: { label: 'Non concerne', color: '#64748b', bg: '#010104' },
}

export const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([value, { label }]) => ({ value, label }))

export const CRITERIA_COLORS = ['#ff0080', '#8b5cf6', '#0ea5e9', '#f59e0b', '#22c55e', '#ef4444', '#6366f1']

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
