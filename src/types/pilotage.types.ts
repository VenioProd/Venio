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
  /** Budget déclaré à la saisie du lead. */
  wonBudget: number
  /** Montant réellement signé. L'écart avec wonBudget est l'intérêt. */
  wonSigned: number
}

export interface PipelineStageResult {
  stage: FunnelStage
  count: number
  probability: number
  weighted: number
}

export interface PipelineResult {
  total: number
  stages: PipelineStageResult[]
  withoutBudget: number
  cohortSize: number
  /** Faux quand la cohorte de référence est trop petite pour porter une projection. */
  reliable: boolean
}

export interface RevenueBlock {
  declaredBudget: number
  linkedProjects: number
  signed: number
  collected: number
  documents: number
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
  revenue: RevenueBlock
  pipeline: PipelineResult
  bySource: PerformanceRow[]
  /** `null` pour un utilisateur qui ne voit qu'un périmètre restreint. */
  byOwner: PerformanceRow[] | null
  coverage: { total: number; withHistory: number; withoutHistory: number; ratio: number }
}

// ─── Chaîne d'un lead ────────────────────────────────────────────────────────

export interface LeadProject {
  _id: string
  name: string
  status: string
  createdAt: string
}

export interface LeadBillingDocument {
  _id: string
  type: 'QUOTE' | 'INVOICE'
  number: string
  status: string
  total: number
  currency: string
  issuedAt: string | null
  paidAt: string | null
  project: string
}

export interface LeadProposal {
  _id: string
  title: string
  status: string
  project: string
  billingDocument: string | null
  createdAt: string
}

export interface LeadRevenueResponse {
  lead: { _id: string; company: string; budget: number | null }
  projects: LeadProject[]
  proposals: LeadProposal[]
  documents: LeadBillingDocument[]
  summary: { signed: number; collected: number; documents: number }
}
