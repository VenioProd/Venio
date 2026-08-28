/**
 * Chiffre d'affaires rattaché aux leads.
 *
 * Comme pour le pilotage, le cœur est une paire de fonctions pures : c'est là
 * que se joue la justesse des montants, et c'est là qu'elle doit se vérifier.
 */
import { FUNNEL_STAGES, type FunnelResult, type FunnelStage, type PilotageLead } from './crmPilotage.js'

/**
 * En dessous de ce nombre de leads dans la cohorte de référence, les taux
 * observés sont trop instables pour porter une projection.
 */
export const MIN_COHORT_FOR_PIPELINE = 20

export interface RevenueDocument {
  type: 'QUOTE' | 'INVOICE'
  status: string
  total: number
}

export interface RevenueSummary {
  /** Montant engagé par le client : devis acceptés. */
  signed: number
  /** Argent réellement rentré : factures payées. */
  collected: number
  documents: number
}

const SIGNED_STATUSES = new Set(['ACCEPTED', 'PAID'])

/**
 * Sépare l'engagé de l'encaissé.
 *
 * Aucun double comptage possible : la signature d'un devis produit un document
 * de type QUOTE, la facturation un document de type INVOICE. Les deux montants
 * ne s'égalisent pas et n'ont pas à le faire — une facture d'acompte ne couvre
 * qu'une part du devis, et une facture peut exister sans devis.
 */
export function summariseRevenue(documents: RevenueDocument[]): RevenueSummary {
  let signed = 0
  let collected = 0
  let counted = 0

  for (const document of documents) {
    if (document.type === 'QUOTE' && SIGNED_STATUSES.has(document.status)) {
      signed += document.total || 0
      counted += 1
    } else if (document.type === 'INVOICE' && document.status === 'PAID') {
      collected += document.total || 0
      counted += 1
    }
  }

  return { signed, collected, documents: counted }
}

export interface PipelineStageResult {
  stage: FunnelStage
  count: number
  /** Probabilité observée de passer de cette étape à la signature. */
  probability: number
  /** Somme des budgets de l'étape, pondérée par cette probabilité. */
  weighted: number
}

export interface PipelineResult {
  total: number
  stages: PipelineStageResult[]
  /** Leads sans budget saisi : ils pèsent zéro et faussent la projection à la baisse. */
  withoutBudget: number
  cohortSize: number
  reliable: boolean
}

const CLOSED = new Set(['WON', 'LOST'])

/**
 * Valeur pondérée du pipeline en cours.
 *
 * Chaque lead actif vaut son budget multiplié par la probabilité **observée**
 * d'aller de son étape jusqu'à la signature — tirée du funnel, jamais saisie à
 * la main : une probabilité écrite une fois dans les réglages est une opinion
 * que la réalité dément sans que personne ne la corrige.
 *
 * À lire avec deux précautions, portées par la réponse elle-même :
 * les taux viennent de la cohorte historique et sont appliqués au pipeline
 * courant (deux populations distinctes) ; et en dessous de
 * MIN_COHORT_FOR_PIPELINE leads observés, `reliable` vaut false.
 */
export function weightedPipeline(leads: PilotageLead[], funnel: FunnelResult): PipelineResult {
  const counts = new Map(funnel.stages.map((stage) => [stage.stage, stage.count]))
  const won = counts.get('WON') ?? 0

  const buckets = new Map<FunnelStage, { count: number; budget: number }>(
    FUNNEL_STAGES.map((stage) => [stage, { count: 0, budget: 0 }]),
  )
  let withoutBudget = 0

  for (const lead of leads) {
    if (CLOSED.has(lead.status)) continue
    const bucket = buckets.get(lead.status as FunnelStage)
    if (!bucket) continue

    bucket.count += 1
    if (lead.budget && lead.budget > 0) bucket.budget += lead.budget
    else withoutBudget += 1
  }

  const stages: PipelineStageResult[] = FUNNEL_STAGES.map((stage) => {
    const bucket = buckets.get(stage)!
    const reached = counts.get(stage) ?? 0
    // Aucun lead observé à cette étape, ou aucune signature : pas de taux à
    // appliquer plutôt qu'une division par zéro.
    const probability = reached === 0 ? 0 : won / reached
    return {
      stage,
      count: bucket.count,
      probability,
      weighted: Math.round(bucket.budget * probability * 100) / 100,
    }
  })

  return {
    total: Math.round(stages.reduce((sum, stage) => sum + stage.weighted, 0) * 100) / 100,
    stages,
    withoutBudget,
    cohortSize: funnel.total,
    reliable: funnel.total >= MIN_COHORT_FOR_PIPELINE,
  }
}
