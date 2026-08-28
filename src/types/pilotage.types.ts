export const FUNNEL_STAGES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON'] as const
export type FunnelStage = (typeof FUNNEL_STAGES)[number]

export type PilotagePeriod = '30d' | '90d' | '12m' | 'ytd'

/** Étiquette servie par le serveur pour toute valeur manquante. */
export const UNSPECIFIED = 'NON_RENSEIGNE'

export interface FunnelStageResult {
  stage: FunnelStage
  count: number
  rateFromPrevious: number | null
}

export interface VelocityStageResult {
  stage: FunnelStage
  medianDays: number | null
  averageDays: number | null
  samples: number
}

export interface PerformanceRow {
  key: string
  total: number
  won: number
  lost: number
  active: number
  winRate: number | null
  wonBudget: number
}

export interface PilotageResponse {
  period: PilotagePeriod
  since: string
  funnel: { stages: FunnelStageResult[]; total: number }
  velocity: {
    stages: VelocityStageResult[]
    cycle: { medianDays: number | null; averageDays: number | null; samples: number }
  }
  losses: {
    total: number
    unspecified: number
    byReason: { reason: string; count: number; share: number }[]
    byStage: { stage: string; count: number }[]
  }
  bySource: PerformanceRow[]
  /** `null` pour un utilisateur qui ne voit qu'un périmètre restreint. */
  byOwner: PerformanceRow[] | null
  coverage: { total: number; withHistory: number; withoutHistory: number; ratio: number }
}
