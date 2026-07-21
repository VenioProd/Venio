/**
 * Agrégations client pour le bandeau de visualisations du dev-tracker.
 *
 * Ces fonctions dérivent des séries honnêtes depuis la liste brute des issues —
 * aucune valeur inventée : si la donnée source manque (ex. `completedAt` absent),
 * le jour correspondant reste à 0 plutôt que d'être extrapolé.
 */
import type { DevIssue } from '../../../../services/dev'

export interface VelocityPoint {
  /** Clé ISO locale (YYYY-MM-DD), utile pour les tests / clés React. */
  date: string
  /** Étiquette courte affichée sur l'axe (JJ/MM). */
  label: string
  count: number
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Vélocité : nombre d'issues passées à DONE par jour, sur les `days` derniers jours,
 * dérivé de `completedAt`. Les jours sans complétion valent 0 (pas d'interpolation).
 */
export function buildVelocitySeries(issues: DevIssue[], days = 14): VelocityPoint[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const order: string[] = []
  const labels = new Map<string, string>()
  const counts = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = localDayKey(d)
    order.push(key)
    labels.set(key, d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }))
    counts.set(key, 0)
  }
  for (const issue of issues) {
    if (issue.status !== 'DONE' || !issue.completedAt) continue
    const key = localDayKey(new Date(issue.completedAt))
    if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1)
  }
  return order.map((key) => ({ date: key, label: labels.get(key) as string, count: counts.get(key) || 0 }))
}

export interface ModelBreakdownRow {
  key: string
  label: string
  value: number
}

/**
 * Répartition des issues par modèle créateur (`createdByModel`), triée par
 * volume décroissant. Regroupe la longue traîne dans une entrée "Autres".
 */
export function buildCreatorModelRows(issues: DevIssue[], topN = 6): ModelBreakdownRow[] {
  const counts = new Map<string, number>()
  for (const issue of issues) {
    const label = issue.createdByModel?.trim() || 'Non renseigné'
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, topN)
  const rest = sorted.slice(topN)
  const restTotal = rest.reduce((sum, [, v]) => sum + v, 0)
  const rows: ModelBreakdownRow[] = top.map(([label, value]) => ({ key: label, label, value }))
  if (restTotal > 0) rows.push({ key: '__others__', label: `Autres (${rest.length})`, value: restTotal })
  return rows
}
