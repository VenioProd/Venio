/**
 * Chiffre d'affaires, valeur pondérée et prévisions rattachés aux leads.
 *
 * Comme pour le pilotage, le cœur est un ensemble de fonctions pures : c'est là
 * que se joue la justesse des montants, et c'est là qu'elle doit se vérifier.
 *
 * ── Définitions (uniques : tout le CRM s'y réfère) ───────────────────────────
 *
 * VALEUR PONDÉRÉE d'un lead = budget × probabilité / 100, pour un lead OUVERT
 * seulement (ni WON, ni LOST, ni archivé) et doté d'un budget > 0. Sinon 0.
 *   - La probabilité est celle du lead (`Lead.probability`, 0–100). À défaut,
 *     celle de son étape (`STATUS_PROBABILITY`, que le modèle pose déjà à la
 *     création et à chaque changement d'étape), à défaut 10.
 *   - Arrondi au centime. Les totaux additionnent des valeurs déjà arrondies.
 *   - Utilisée par le pilotage (pipeline), la prévision mensuelle et l'export
 *     CSV (colonne « Pondéré »). L'écran liste de l'interface applique la même
 *     formule (`weightedOf`, crm-board/rich/columns.tsx).
 *   - Les taux de passage OBSERVÉS dans l'entonnoir restent affichés à titre
 *     indicatif (`observedRate`) mais ne servent plus au calcul : deux
 *     définitions du « pondéré » donnaient deux chiffres pour la même chose.
 *
 * DEVISES : un lead n'a pas de devise, son budget est en EUR (DEFAULT_CURRENCY).
 * Les documents de facturation portent la leur. On n'additionne JAMAIS deux
 * devises : les totaux issus de documents sont rendus par devise.
 *
 * CATÉGORIES DE PRÉVISION, dérivées de la probabilité : engagé ≥ 70,
 * probable 40–69, pipeline < 40.
 *
 * FUSEAU : les mois de prévision sont ceux d'Europe/Paris.
 */
import { FUNNEL_STAGES, type FunnelResult, type FunnelStage, type PilotageLead } from './crmPilotage.js'
import { STATUS_PROBABILITY } from '../models/Lead.js'
import { computeQuoteTotals } from './quoteTotals.js'

/**
 * Seuil indicatif sur la taille de la cohorte de référence : en dessous, les
 * taux observés (`observedRate`) sont trop instables pour être commentés.
 */
export const MIN_COHORT_FOR_PIPELINE = 20

export const DEFAULT_CURRENCY = 'EUR'
const FALLBACK_PROBABILITY = 10

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

/** Devise normalisée : majuscules, EUR si absente. */
export function normalizeCurrency(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : DEFAULT_CURRENCY
}

// ─── Chiffre d'affaires signé / encaissé ─────────────────────────────────────

export interface RevenueDocument {
  type: 'QUOTE' | 'INVOICE'
  status: string
  total: number
  /** Devise du document (EUR si absente). */
  currency?: string | null
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
 * Sépare l'engagé de l'encaissé, **dans une seule devise** (EUR par défaut) :
 * les documents d'une autre devise sont ignorés, jamais convertis ni ajoutés.
 * Pour tout voir, `summariseRevenueByCurrency`.
 *
 * Aucun double comptage possible : la signature d'un devis produit un document
 * de type QUOTE, la facturation un document de type INVOICE. Les deux montants
 * ne s'égalisent pas et n'ont pas à le faire — une facture d'acompte ne couvre
 * qu'une part du devis, et une facture peut exister sans devis.
 */
export function summariseRevenue(documents: RevenueDocument[], currency: string = DEFAULT_CURRENCY): RevenueSummary {
  let signed = 0
  let collected = 0
  let counted = 0

  for (const document of documents) {
    if (normalizeCurrency(document.currency) !== currency) continue
    if (document.type === 'QUOTE' && SIGNED_STATUSES.has(document.status)) {
      signed += document.total || 0
      counted += 1
    } else if (document.type === 'INVOICE' && document.status === 'PAID') {
      collected += document.total || 0
      counted += 1
    }
  }

  return { signed: roundCents(signed), collected: roundCents(collected), documents: counted }
}

/** Un résumé par devise présente. Toujours une entrée EUR, même vide. */
export function summariseRevenueByCurrency(documents: RevenueDocument[]): Record<string, RevenueSummary> {
  const currencies = new Set<string>([DEFAULT_CURRENCY])
  for (const document of documents) currencies.add(normalizeCurrency(document.currency))
  return Object.fromEntries([...currencies].sort().map((currency) => [currency, summariseRevenue(documents, currency)]))
}

/** Devis rattaché directement à un lead (`QuoteProposal.leadId`), tel que lu en base. */
export interface DirectProposal {
  _id: unknown
  leadId: unknown
  status: string
  project?: unknown
  billingDocument?: unknown
  lines?: Parameters<typeof computeQuoteTotals>[0]
  selectedOptionalLineIds?: Parameters<typeof computeQuoteTotals>[1]
  currency?: string | null
}

export interface LeadRevenueEntry {
  leadId: string
  document: RevenueDocument
}

export interface LeadRevenueInput {
  /** Documents des projets rattachés (`Project.sourceLead`). */
  documents: Array<RevenueDocument & { _id?: unknown; project: unknown }>
  /** Projet → lead (via `Project.sourceLead`). */
  leadByProject: Map<string, string>
  /** Devis portant un `leadId`, tous statuts confondus. */
  proposals: DirectProposal[]
}

/**
 * Entrées de chiffre d'affaires par lead : les documents des projets rattachés
 * ET les devis signés rattachés directement au lead.
 *
 * Un devis `leadId` n'est ajouté que s'il n'est pas déjà couvert :
 *  - son document de facturation (`billingDocument`) fait partie des documents
 *    comptés ; ou
 *  - son projet est un projet rattaché au lead (il passe alors par ses documents).
 * Un devis signé sans projet n'a pas de document de facturation (il en est
 * créé un au rattachement) : son montant vient de ses lignes
 * (`computeQuoteTotals`, TTC comme `BillingDocument.total`).
 */
export function leadRevenueEntries(input: LeadRevenueInput): LeadRevenueEntry[] {
  const entries: LeadRevenueEntry[] = []
  const countedDocuments = new Set<string>()

  for (const document of input.documents) {
    const leadId = input.leadByProject.get(String(document.project))
    if (!leadId) continue
    entries.push({ leadId, document })
    if (document._id != null) countedDocuments.add(String(document._id))
  }

  for (const proposal of input.proposals) {
    if (proposal.status !== 'SIGNED' || proposal.leadId == null) continue
    if (proposal.billingDocument != null && countedDocuments.has(String(proposal.billingDocument))) continue
    if (proposal.project != null && input.leadByProject.has(String(proposal.project))) continue

    const { total } = computeQuoteTotals(proposal.lines ?? [], proposal.selectedOptionalLineIds ?? [])
    entries.push({
      leadId: String(proposal.leadId),
      document: { type: 'QUOTE', status: 'ACCEPTED', total, currency: proposal.currency ?? DEFAULT_CURRENCY },
    })
  }

  return entries
}

/** Montant signé par lead, dans une devise (EUR par défaut). */
export function signedByLeadFromEntries(
  entries: LeadRevenueEntry[],
  currency: string = DEFAULT_CURRENCY,
): Map<string, number> {
  const signed = new Map<string, number>()
  for (const entry of entries) {
    const { signed: amount } = summariseRevenue([entry.document], currency)
    if (amount > 0) signed.set(entry.leadId, roundCents((signed.get(entry.leadId) ?? 0) + amount))
  }
  return signed
}

// ─── Valeur pondérée (définition unique) ─────────────────────────────────────

export interface WeightableLead {
  status: string
  budget?: number | null
  probability?: number | null
  archivedAt?: Date | string | null
}

const CLOSED = new Set(['WON', 'LOST'])

/** Un lead est ouvert tant qu'il n'est ni gagné, ni perdu, ni archivé. */
export function isOpenLead(lead: Pick<WeightableLead, 'status' | 'archivedAt'>): boolean {
  return !CLOSED.has(lead.status) && !lead.archivedAt
}

/** Probabilité effective, de 0 à 100 : celle du lead, sinon celle de son étape, sinon 10. */
export function leadProbability(lead: Pick<WeightableLead, 'status' | 'probability'>): number {
  const raw = lead.probability ?? STATUS_PROBABILITY[lead.status] ?? FALLBACK_PROBABILITY
  return Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : FALLBACK_PROBABILITY
}

function positiveBudget(lead: Pick<WeightableLead, 'budget'>): number {
  return lead.budget && lead.budget > 0 ? lead.budget : 0
}

/** Valeur pondérée d'un lead (voir l'en-tête du fichier). 0 pour un lead fermé ou sans budget. */
export function weightedValue(lead: WeightableLead): number {
  if (!isOpenLead(lead)) return 0
  const budget = positiveBudget(lead)
  return budget === 0 ? 0 : roundCents((budget * leadProbability(lead)) / 100)
}

export type ForecastCategory = 'committed' | 'probable' | 'pipeline'

export const FORECAST_CATEGORIES: readonly ForecastCategory[] = ['committed', 'probable', 'pipeline']

/** Engagé ≥ 70, probable 40–69, pipeline < 40. */
export function forecastCategory(probability: number): ForecastCategory {
  if (probability >= 70) return 'committed'
  if (probability >= 40) return 'probable'
  return 'pipeline'
}

// ─── Pipeline pondéré ────────────────────────────────────────────────────────

export interface PipelineStageResult {
  stage: FunnelStage
  count: number
  /** Probabilité moyenne des leads de l'étape (0–1), telle qu'utilisée pour la pondération. */
  probability: number
  /** Taux observé dans la cohorte d'aller de cette étape à la signature (indicatif, non utilisé dans le calcul). */
  observedRate: number
  /** Somme des valeurs pondérées de l'étape (voir `weightedValue`). */
  weighted: number
}

export interface PipelineResult {
  /** Devise du total et des budgets : celle des leads (EUR). */
  currency: string
  total: number
  stages: PipelineStageResult[]
  /** Leads sans budget saisi : ils pèsent zéro et faussent la projection à la baisse. */
  withoutBudget: number
  cohortSize: number
  /** Fiabilité des taux observés (`observedRate`) : faux sur une cohorte trop petite. */
  reliable: boolean
}

/**
 * Valeur pondérée du pipeline en cours, par étape, selon la définition unique
 * de `weightedValue`. L'entonnoir ne sert plus qu'à fournir les taux observés,
 * affichés en regard.
 */
export function weightedPipeline(leads: PilotageLead[], funnel: FunnelResult): PipelineResult {
  const counts = new Map(funnel.stages.map((stage) => [stage.stage, stage.count]))
  const won = counts.get('WON') ?? 0

  const buckets = new Map<FunnelStage, { count: number; probabilities: number; weighted: number }>(
    FUNNEL_STAGES.map((stage) => [stage, { count: 0, probabilities: 0, weighted: 0 }]),
  )
  let withoutBudget = 0

  for (const lead of leads) {
    if (!isOpenLead(lead)) continue
    const bucket = buckets.get(lead.status as FunnelStage)
    if (!bucket) continue

    bucket.count += 1
    bucket.probabilities += leadProbability(lead)
    bucket.weighted = roundCents(bucket.weighted + weightedValue(lead))
    if (positiveBudget(lead) === 0) withoutBudget += 1
  }

  const stages: PipelineStageResult[] = FUNNEL_STAGES.map((stage) => {
    const bucket = buckets.get(stage)!
    const reached = counts.get(stage) ?? 0
    return {
      stage,
      count: bucket.count,
      probability: bucket.count === 0 ? 0 : bucket.probabilities / bucket.count / 100,
      observedRate: reached === 0 ? 0 : won / reached,
      weighted: bucket.weighted,
    }
  })

  return {
    currency: DEFAULT_CURRENCY,
    total: roundCents(stages.reduce((sum, stage) => sum + stage.weighted, 0)),
    stages,
    withoutBudget,
    cohortSize: funnel.total,
    reliable: funnel.total >= MIN_COHORT_FOR_PIPELINE,
  }
}

// ─── Mois d'Europe/Paris ─────────────────────────────────────────────────────

export const FORECAST_TIME_ZONE = 'Europe/Paris'
export const MAX_FORECAST_MONTHS = 24
export const DEFAULT_FORECAST_MONTHS = 6

const PARIS_MONTH = new Intl.DateTimeFormat('en-CA', {
  timeZone: FORECAST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
})

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/** Mois civil 'YYYY-MM' d'un instant, en heure de Paris. */
export function parisMonth(date: Date | string): string {
  const parts = PARIS_MONTH.formatToParts(date instanceof Date ? date : new Date(date))
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return year + '-' + month
}

/** Décale un mois 'YYYY-MM' de `delta` mois (négatif accepté). */
export function addMonths(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number) as [number, number]
  const index = year * 12 + (mon - 1) + delta
  return Math.floor(index / 12) + '-' + String((index % 12) + 1).padStart(2, '0')
}

/** Liste de `count` mois consécutifs à partir de `from`. */
export function monthRange(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addMonths(from, index))
}

// ─── Objectifs ───────────────────────────────────────────────────────────────

export interface GoalLike {
  _id?: unknown
  period: string
  entity?: string | null
  userId?: unknown
  amountTarget: number
  wonCountTarget: number
}

export interface GoalProgress {
  _id: string | null
  entity: string | null
  userId: string | null
  amountTarget: number
  wonCountTarget: number
  /** Réalisé / objectif (1 = atteint). `null` si l'objectif correspondant est 0. */
  amountProgress: number | null
  countProgress: number | null
  /** Réalisé + pondéré du mois : ce que le mois donnerait si le pipeline se concrétisait. */
  projectedAmount: number
  projectedProgress: number | null
}

/**
 * Objectif applicable à un périmètre : celui qui porte exactement la même
 * entité (ou aucune) et le même commercial (ou aucun). Les objectifs ne
 * s'additionnent ni ne se déduisent les uns des autres.
 */
export function pickGoal(
  goals: GoalLike[],
  period: string,
  scope: { entity?: string | null; userId?: string | null },
): GoalLike | null {
  const entity = scope.entity ?? null
  const userId = scope.userId ?? null
  return (
    goals.find(
      (goal) =>
        goal.period === period &&
        (goal.entity ?? null) === entity &&
        (goal.userId == null ? null : String(goal.userId)) === userId,
    ) ?? null
  )
}

function ratio(value: number, target: number): number | null {
  return target > 0 ? Math.round((value / target) * 1000) / 1000 : null
}

export function goalProgress(goal: GoalLike, wonAmount: number, wonCount: number, weighted: number): GoalProgress {
  const projectedAmount = roundCents(wonAmount + weighted)
  return {
    _id: goal._id == null ? null : String(goal._id),
    entity: goal.entity ?? null,
    userId: goal.userId == null ? null : String(goal.userId),
    amountTarget: goal.amountTarget,
    wonCountTarget: goal.wonCountTarget,
    amountProgress: ratio(wonAmount, goal.amountTarget),
    countProgress: ratio(wonCount, goal.wonCountTarget),
    projectedAmount,
    projectedProgress: ratio(projectedAmount, goal.amountTarget),
  }
}

// ─── Prévision mensuelle ─────────────────────────────────────────────────────

export interface ForecastLead extends WeightableLead {
  expectedCloseAt?: Date | string | null
  statusChangedAt?: Date | string | null
}

export interface ForecastBucket {
  count: number
  gross: number
  weighted: number
}

export interface ForecastMonth {
  /** 'YYYY-MM', mois d'Europe/Paris. */
  month: string
  /** Leads ouverts dont la clôture prévue tombe ce mois-là. */
  openCount: number
  /** Somme brute de leurs budgets. */
  gross: number
  /** Somme de leurs valeurs pondérées (`weightedValue`). */
  weighted: number
  categories: Record<ForecastCategory, ForecastBucket>
  /** Leads passés à WON ce mois-là (par `statusChangedAt`). */
  wonCount: number
  wonAmount: number
  goal: GoalProgress | null
}

export interface ForecastResult {
  currency: string
  timeZone: string
  from: string
  months: ForecastMonth[]
  /** Leads ouverts dont la clôture prévue précède la fenêtre : à replanifier. */
  overdue: ForecastBucket
  /** Leads ouverts sans date de clôture prévue : absents des mois. */
  unscheduled: ForecastBucket
  totals: { openCount: number; gross: number; weighted: number; wonCount: number; wonAmount: number }
}

function emptyBucket(): ForecastBucket {
  return { count: 0, gross: 0, weighted: 0 }
}

function addToBucket(bucket: ForecastBucket, lead: WeightableLead): void {
  bucket.count += 1
  bucket.gross = roundCents(bucket.gross + positiveBudget(lead))
  bucket.weighted = roundCents(bucket.weighted + weightedValue(lead))
}

/**
 * Prévision par mois de clôture prévue (`expectedCloseAt`, mois de Paris) sur
 * `months` mois à partir de `from`. Le réalisé est le budget des leads WON dans
 * le mois, daté par `statusChangedAt`. Les leads ouverts hors fenêtre ne sont
 * pas perdus de vue : retard et sans date sont rendus à part.
 */
export function buildForecast(
  leads: ForecastLead[],
  options: {
    from: string
    months: number
    goals?: GoalLike[]
    scope?: { entity?: string | null; userId?: string | null }
  },
): ForecastResult {
  const rows = new Map<string, ForecastMonth>(
    monthRange(options.from, options.months).map((month) => [
      month,
      {
        month,
        openCount: 0,
        gross: 0,
        weighted: 0,
        categories: { committed: emptyBucket(), probable: emptyBucket(), pipeline: emptyBucket() },
        wonCount: 0,
        wonAmount: 0,
        goal: null,
      },
    ]),
  )
  const overdue = emptyBucket()
  const unscheduled = emptyBucket()

  for (const lead of leads) {
    if (lead.status === 'WON') {
      if (!lead.statusChangedAt) continue
      const row = rows.get(parisMonth(lead.statusChangedAt))
      if (!row) continue
      row.wonCount += 1
      row.wonAmount = roundCents(row.wonAmount + positiveBudget(lead))
      continue
    }

    if (!isOpenLead(lead)) continue

    if (!lead.expectedCloseAt) {
      addToBucket(unscheduled, lead)
      continue
    }
    const month = parisMonth(lead.expectedCloseAt)
    if (month < options.from) {
      addToBucket(overdue, lead)
      continue
    }
    const row = rows.get(month)
    if (!row) continue // au-delà de la fenêtre

    row.openCount += 1
    row.gross = roundCents(row.gross + positiveBudget(lead))
    row.weighted = roundCents(row.weighted + weightedValue(lead))
    addToBucket(row.categories[forecastCategory(leadProbability(lead))], lead)
  }

  const months = [...rows.values()]
  for (const row of months) {
    const goal = pickGoal(options.goals ?? [], row.month, options.scope ?? {})
    row.goal = goal ? goalProgress(goal, row.wonAmount, row.wonCount, row.weighted) : null
  }

  return {
    currency: DEFAULT_CURRENCY,
    timeZone: FORECAST_TIME_ZONE,
    from: options.from,
    months,
    overdue,
    unscheduled,
    totals: {
      openCount: months.reduce((sum, row) => sum + row.openCount, 0),
      gross: roundCents(months.reduce((sum, row) => sum + row.gross, 0)),
      weighted: roundCents(months.reduce((sum, row) => sum + row.weighted, 0)),
      wonCount: months.reduce((sum, row) => sum + row.wonCount, 0),
      wonAmount: roundCents(months.reduce((sum, row) => sum + row.wonAmount, 0)),
    },
  }
}
