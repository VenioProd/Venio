export type KpiPeriod = 'week' | 'month' | 'year' | 'all'

export interface PersonPerformance {
  userId: string
  name: string
  total: number
  completed: number
  inProgress: number
  overdue: number
  complianceRate: number | null
  avgTreatmentHours: number | null
}

export interface BriefCreatorStats {
  userId: string
  name: string
  total: number
  byStatus: Record<string, number>
}

export interface BriefDestinataireStats {
  userId: string
  name: string
  received: number
  completed: number
}

export interface BriefStats {
  totalBriefs: number
  byCreator: BriefCreatorStats[]
  byDestinataire: BriefDestinataireStats[]
}

export interface GestionKpi {
  totalTasks: number
  completedTasks: number
  overdueTasks: number
  tasksByStatus: Record<string, number>
  tasksByPriority: Record<string, number>
  tasksByPerson: PersonPerformance[]
  admins: { _id: string; name: string; email: string }[]
  briefStats: BriefStats
}
