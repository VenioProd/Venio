/**
 * Palette de graphiques Venio — source unique de vérité des couleurs de charts.
 *
 * Remplace les hex en dur éparpillés dans les dashboards. La palette catégorielle
 * a été validée par le validateur dataviz (6/6 checks sur fond sombre, dont la
 * séparation daltonisme des paires adjacentes). Miroir CSS des couleurs de statut :
 * les tokens `--good/--warning/--serious/--critical` dans src/styles/theme.css.
 *
 * Règles :
 * - Catégoriel (CHART_CATEGORICAL) : assigner dans l'ordre fixe, ne jamais cycler.
 *   La couleur suit l'entité, pas son rang.
 * - Statut (STATUS) : réservé à l'état (good/warning/serious/critical). Jamais une
 *   « série 5 ». Toujours accompagné d'une icône/label, jamais couleur seule.
 * - Accent (ACCENT) : identité de la marque + série unique mise en avant.
 */

/** Palette catégorielle validée — ordre fixe. */
export const CHART_CATEGORICAL = ['#0284c7', '#d97706', '#e11d48', '#7c3aed', '#059669'] as const

/** Couleurs de statut réservées (état). Miroir des tokens CSS de theme.css. */
export const STATUS = {
  good: '#22c55e',
  warning: '#f59e0b',
  serious: '#f97316',
  critical: '#ef4444',
  neutral: '#3a4250',
} as const

/** Accent primaire (cyan monolithe) pour l'identité et les séries uniques. */
export const ACCENT = '#0ea5e9'
export const ACCENT_BRIGHT = '#38bdf8'
export const ACCENT_DEEP = '#0284c7'

/** Encres (texte/grille) alignées sur le thème sombre. */
export const INK_MUTED = '#5c636d'
export const GRID_LINE = 'rgba(255,255,255,0.08)'

/** Statuts d'issue dev → couleur (ordinal backlog→done ; bloqué/fini = statut réservé). */
export const DEV_STATUS_COLORS: Record<string, string> = {
  BACKLOG: STATUS.neutral,
  TODO: '#7c3aed',
  IN_PROGRESS: ACCENT,
  IN_REVIEW: '#d97706',
  BLOCKED: STATUS.critical,
  DONE: STATUS.good,
  DUPLICATE: '#5c636d',
  CANCELLED: '#5c636d',
}

/** Priorités d'issue dev → couleur de sévérité. */
export const DEV_PRIORITY_COLORS: Record<string, string> = {
  URGENT: STATUS.critical,
  HIGH: STATUS.serious,
  MEDIUM: STATUS.warning,
  LOW: ACCENT_DEEP,
  NO_PRIORITY: STATUS.neutral,
}

/** Statuts de projet (dashboard) → couleur. */
/**
 * Répartition des projets par statut. C'est une série catégorielle : chaque
 * segment est une catégorie, pas un niveau d'alerte. Une seule exception,
 * `BLOQUE`, qui est réellement un état à traiter et garde le rouge de statut.
 *
 * `TERMINE` n'emploie plus `STATUS.good` : « terminé » n'est pas « en bonne
 * santé ». Le vert de statut au milieu d'une série de teintes arbitraires
 * laissait croire à un jugement là où il n'y avait qu'une catégorie.
 */
export const PROJECT_STATUS_COLORS: Record<string, string> = {
  CADRAGE: '#7c3aed',
  EN_COURS: ACCENT,
  EN_REVUE: '#d97706',
  LIVRAISON: '#14b8a6', // teal — distinct du vert "Terminé" et du cyan "En cours"
  BLOQUE: STATUS.critical, // seul véritable état d'alerte de la série
  TERMINE: '#059669', // émeraude catégorielle, pas le vert « bon » de STATUS
  EN_PAUSE: STATUS.neutral,
}

/** Couleur catégorielle par index (ordre fixe, sans cyclage au-delà de la palette). */
export function categoricalAt(index: number): string {
  return CHART_CATEGORICAL[index] ?? STATUS.neutral
}

/** hex (#rrggbb) → rgba(r,g,b,a) — pour les remplissages/dégradés recharts. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
