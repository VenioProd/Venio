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
  /** Montant réellement signé. L'écart avec wonBudget est l'intérêt. `null` sans droit financier. */
  wonSigned: number | null
}

export interface PipelineStageResult {
  stage: FunnelStage
  count: number
  /** Probabilité moyenne des leads de l'étape (0–1), celle utilisée pour la pondération. */
  probability: number
  /** Taux observé dans la cohorte (indicatif, hors calcul). */
  observedRate?: number
  weighted: number
}

export interface PipelineResult {
  /** Devise des montants (EUR). */
  currency?: string
  total: number
  stages: PipelineStageResult[]
  withoutBudget: number
  cohortSize: number
  /** Faux quand la cohorte de référence est trop petite pour porter une projection. */
  reliable: boolean
}

export interface RevenueSummary {
  signed: number
  collected: number
  documents: number
}

export interface RevenueBlock {
  /** Devise de signed / collected (EUR) : les autres devises sont dans byCurrency, jamais additionnées. */
  currency?: string
  declaredBudget: number
  linkedProjects: number
  /** signed, collected, documents et byCurrency valent `null` sans droit financier. */
  signed: number | null
  collected: number | null
  documents: number | null
  byCurrency?: Record<string, RevenueSummary> | null
}

export interface PilotageResponse {
  period: PilotagePeriod
  since: string
  /** Entité du groupe filtrée (?entity=), `null` : tout le périmètre. */
  entity?: string | null
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
  /** Absent : devis rattaché au lead seul, sans projet. */
  project: string | null
  billingDocument: string | null
  createdAt: string
}

export interface LeadRevenueResponse {
  lead: { _id: string; company: string; budget: number | null }
  projects: LeadProject[]
  proposals: LeadProposal[]
  documents: LeadBillingDocument[]
  summary: { signed: number; collected: number; documents: number }
  byCurrency?: Record<string, RevenueSummary>
}

// ─── Prévisions et objectifs ─────────────────────────────────────────────────

export type ForecastCategory = 'committed' | 'probable' | 'pipeline'

export interface ForecastBucket {
  count: number
  gross: number
  weighted: number
}

export interface GoalProgress {
  _id: string | null
  entity: string | null
  userId: string | null
  amountTarget: number
  wonCountTarget: number
  amountProgress: number | null
  countProgress: number | null
  projectedAmount: number
  projectedProgress: number | null
}

export interface ForecastMonth {
  /** 'YYYY-MM', mois d'Europe/Paris. */
  month: string
  openCount: number
  gross: number
  weighted: number
  categories: Record<ForecastCategory, ForecastBucket>
  wonCount: number
  wonAmount: number
  goal: GoalProgress | null
}

export interface ForecastResponse {
  currency: string
  timeZone: string
  from: string
  months: ForecastMonth[]
  overdue: ForecastBucket
  unscheduled: ForecastBucket
  totals: { openCount: number; gross: number; weighted: number; wonCount: number; wonAmount: number }
  entity: string | null
  userId: string | null
}

export interface CrmGoal {
  _id: string
  period: string
  entity: string | null
  userId: string | null
  amountTarget: number
  wonCountTarget: number
}

export interface CrmGoalInput {
  period: string
  entity: string | null
  userId: string | null
  amountTarget: number
  wonCountTarget: number
}
