import { ACCENT, STATUS, categoricalAt } from '../../../lib/chartColors'
import { formatMoney } from '../../../i18n/format'
import type { MessageKey } from '../../../i18n'

export interface AnalyticsData {
  projectsByStatus: Record<string, number>
  projectsByPriority: Record<string, number>
  tasksByStatus: Record<string, number>
  tasksByPriority: Record<string, number>
  // null quand l'utilisateur n'a pas view_billing : l'API retire les montants
  // plutôt que de renvoyer 0, qui se lirait comme un chiffre d'affaires nul.
  totalRevenue: number | null
  monthlyRevenue: number | null
  lastMonthRevenue: number | null
  totalBudget: number | null
  clientCount: number
  activeClientCount: number
  projectsPerMonth: { _id: { year: number; month: number }; count: number }[]
  overdueTaskCount: number
  leadStats: { total: number; won: number; lost: number; active: number; pipelineValue: number }
}

export interface PublicSiteAnalyticsData {
  privacy: string
  goals: { pageViews: number; ctaClicks: number; contactForms: number }
  months: {
    key: string
    label: string
    pageViews: number
    ctaClicks: number
    contactForms: number
    ctaRate: number
    formRate: number
  }[]
}

export const STATUS_LABEL_KEYS = {
  EN_COURS: 'adminTech.analytics.status.inProgress',
  EN_ATTENTE: 'adminTech.analytics.status.waiting',
  TERMINE: 'adminTech.analytics.status.done',
  A_FAIRE: 'adminTech.analytics.status.todo',
  EN_REVIEW: 'adminTech.analytics.status.review',
} as const satisfies Record<string, MessageKey>

export const PRIORITY_LABEL_KEYS = {
  BASSE: 'adminTech.analytics.priority.low',
  NORMALE: 'adminTech.analytics.priority.normal',
  HAUTE: 'adminTech.analytics.priority.high',
  URGENTE: 'adminTech.analytics.priority.urgent',
} as const satisfies Record<string, MessageKey>

/**
 * La priorité est une échelle de gravité : elle emploie donc les couleurs de
 * statut, dans l'ordre. « Basse » prend le neutre et non le vert : une tâche
 * peu prioritaire n'est pas une bonne nouvelle.
 */
export const PRIORITY_COLORS: Record<string, string> = {
  BASSE: STATUS.neutral,
  NORMALE: ACCENT,
  HAUTE: STATUS.warning,
  URGENTE: STATUS.critical,
}

/**
 * Le statut, lui, est une catégorie : cinq valeurs sans hiérarchie de gravité.
 * Il prend la palette catégorielle, dans son ordre fixe : la couleur suit
 * l'entité, pas son rang. Employer ici le vert et le rouge de statut
 * empêchait de distinguer « cette série est en alerte » de « cette série est
 * la troisième ».
 */
export const STATUS_COLORS: Record<string, string> = {
  A_FAIRE: categoricalAt(0),
  EN_COURS: categoricalAt(1),
  EN_REVIEW: categoricalAt(2),
  EN_ATTENTE: categoricalAt(3),
  TERMINE: categoricalAt(4),
}

export const MONTH_LABEL_KEYS = [
  'adminTech.analytics.month.jan',
  'adminTech.analytics.month.feb',
  'adminTech.analytics.month.mar',
  'adminTech.analytics.month.apr',
  'adminTech.analytics.month.may',
  'adminTech.analytics.month.jun',
  'adminTech.analytics.month.jul',
  'adminTech.analytics.month.aug',
  'adminTech.analytics.month.sep',
  'adminTech.analytics.month.oct',
  'adminTech.analytics.month.nov',
  'adminTech.analytics.month.dec',
] as const satisfies readonly MessageKey[]

export function formatEur(n: number): string {
  return formatMoney(n, 'EUR', { maximumFractionDigits: 0 })
}
