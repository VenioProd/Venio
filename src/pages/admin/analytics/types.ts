export interface AnalyticsData {
  projectsByStatus: Record<string, number>
  projectsByPriority: Record<string, number>
  tasksByStatus: Record<string, number>
  tasksByPriority: Record<string, number>
  totalRevenue: number
  monthlyRevenue: number
  lastMonthRevenue: number
  totalBudget: number
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

export const STATUS_LABELS: Record<string, string> = {
  EN_COURS: 'En cours',
  EN_ATTENTE: 'En attente',
  TERMINE: 'Termine',
  A_FAIRE: 'A faire',
  EN_REVIEW: 'En review',
}

export const PRIORITY_LABELS: Record<string, string> = {
  BASSE: 'Basse',
  NORMALE: 'Normale',
  HAUTE: 'Haute',
  URGENTE: 'Urgente',
}

export const PRIORITY_COLORS: Record<string, string> = {
  BASSE: '#22c55e',
  NORMALE: '#0ea5e9',
  HAUTE: '#f59e0b',
  URGENTE: '#ef4444',
}

export const STATUS_COLORS: Record<string, string> = {
  EN_COURS: '#0ea5e9',
  EN_ATTENTE: '#f59e0b',
  TERMINE: '#22c55e',
  A_FAIRE: '#94a3b8',
  EN_REVIEW: '#0284c7',
}

export const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
