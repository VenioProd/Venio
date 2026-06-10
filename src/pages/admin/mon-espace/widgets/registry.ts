import type { WidgetConfig } from '../../../../types/workspace.types'

export const WIDGET_KEYS = [
  'todo',
  'doing',
  'overdue',
  'week',
  'notes',
  'postit',
  'notebook',
  'ideas',
  'kpis',
  'pinned',
  'activity',
  'shortcuts',
  'clock',
  'pomodoro',
  'goal',
  'devReview',
  'nextSession',
] as const

export type WidgetKey = (typeof WIDGET_KEYS)[number]

export const WIDGET_LABELS: Record<WidgetKey, string> = {
  todo: 'Tâches à faire',
  doing: 'Tâches en cours',
  overdue: 'En retard',
  week: 'Cette semaine',
  notes: 'Notes',
  postit: 'Post-it',
  notebook: 'Notebook',
  ideas: 'Idées',
  kpis: 'Mes chiffres',
  pinned: 'Épinglés',
  activity: 'Activité',
  shortcuts: 'Raccourcis',
  clock: 'Horloge',
  pomodoro: 'Focus',
  goal: 'Objectif du jour',
  devReview: 'Dev — à valider',
  nextSession: 'Prochaine séance',
}

export const DEFAULT_SIZE: Record<WidgetKey, { w: number; h: number }> = {
  todo: { w: 4, h: 5 },
  doing: { w: 4, h: 5 },
  overdue: { w: 4, h: 4 },
  week: { w: 6, h: 4 },
  notes: { w: 4, h: 5 },
  postit: { w: 6, h: 4 },
  notebook: { w: 6, h: 5 },
  ideas: { w: 4, h: 4 },
  kpis: { w: 6, h: 3 },
  pinned: { w: 3, h: 4 },
  activity: { w: 4, h: 4 },
  shortcuts: { w: 3, h: 3 },
  clock: { w: 3, h: 3 },
  pomodoro: { w: 3, h: 3 },
  goal: { w: 6, h: 3 },
  devReview: { w: 4, h: 4 },
  nextSession: { w: 3, h: 3 },
}

export function defaultLayoutWidgets(): WidgetConfig[] {
  return WIDGET_KEYS.map((key, i) => ({
    key,
    enabled: true,
    x: (i * 4) % 12,
    y: Math.floor(i / 3) * 4,
    ...DEFAULT_SIZE[key],
  }))
}

/** Complète un layout persisté avec les clés du registry absentes (ajoutées en fin, taille par défaut). */
export function mergeLayoutWidgets(saved: WidgetConfig[]): WidgetConfig[] {
  const known = new Set(saved.map((w) => w.key))
  const missing = WIDGET_KEYS.filter((k) => !known.has(k)).map((key) => ({
    key,
    enabled: true,
    x: 0,
    y: 0,
    ...DEFAULT_SIZE[key],
  }))
  return missing.length ? [...saved, ...missing] : saved
}
