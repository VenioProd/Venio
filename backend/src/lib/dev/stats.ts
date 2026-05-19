import type { DevIssueStatus } from '../../models/DevIssue.js'

export const STATUS_WEIGHT: Record<DevIssueStatus, number> = {
  BACKLOG: 0,
  TODO: 10,
  IN_PROGRESS: 50,
  IN_REVIEW: 80,
  DONE: 100,
  CANCELLED: 0,
}

/**
 * Calcule un pourcentage 0-100 (arrondi entier) à partir d'un compte par
 * statut. CANCELLED est ignoré au numérateur ET au dénominateur.
 */
export function computeProgress(byStatus: Record<DevIssueStatus, number>): number {
  let weighted = 0
  let nonCancelled = 0
  for (const [status, count] of Object.entries(byStatus) as [DevIssueStatus, number][]) {
    if (status === 'CANCELLED') continue
    weighted += STATUS_WEIGHT[status] * count
    nonCancelled += count
  }
  if (nonCancelled === 0) return 0
  return Math.round(weighted / nonCancelled)
}

export type ProjectHealth = 'on_track' | 'at_risk' | 'blocked'

export interface HealthSignals {
  blocked: number
  urgent: number
}

/**
 * Heuristique provisoire :
 *   blocked > 0             → 'blocked'
 *   urgent > 0 && progress < 50 → 'at_risk'
 *   sinon                   → 'on_track'
 */
export function computeHealth(signals: HealthSignals, progress: number): ProjectHealth {
  if (signals.blocked > 0) return 'blocked'
  if (signals.urgent > 0 && progress < 50) return 'at_risk'
  return 'on_track'
}
