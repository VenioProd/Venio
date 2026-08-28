/**
 * Calculs du pilotage commercial.
 *
 * Toutes les fonctions de ce module sont **pures** : elles prennent des leads et
 * des transitions déjà chargés et ne touchent jamais la base. C'est ce qui rend
 * la méthodologie vérifiable — et c'est elle qui compte ici, bien plus que les
 * requêtes qui l'alimentent.
 */

/** Étapes de l'entonnoir, dans l'ordre. LOST n'en fait pas partie : c'est une sortie. */
export const FUNNEL_STAGES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON'] as const

export type FunnelStage = (typeof FUNNEL_STAGES)[number]

/** Étiquette des valeurs manquantes : visible dans les résultats, jamais silencieuse. */
export const UNSPECIFIED = 'NON_RENSEIGNE'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface PilotageLead {
  _id: string
  status: string
  createdAt: Date | string
  source?: string | null
  budget?: number | null
  assignedTo?: string | null
  lostReason?: string | null
}

export interface StatusTransition {
  leadId: string
  from: string
  to: string
  at: Date | string
}

// ─── Outils ──────────────────────────────────────────────────────────────────

function time(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

function stageIndex(status: string): number {
  return (FUNNEL_STAGES as readonly string[]).indexOf(status)
}

/**
 * Médiane, en jours. Sur un nombre pair de mesures, moyenne des deux valeurs
 * centrales. Préférée à la moyenne partout où un lead oublié plusieurs mois
 * dans une étape suffirait à rendre le chiffre inutilisable.
 */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round(value: number | null, digits = 1): number | null {
  if (value === null) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function groupTransitionsByLead(transitions: StatusTransition[]): Map<string, StatusTransition[]> {
  const byLead = new Map<string, StatusTransition[]>()
  for (const transition of transitions) {
    const list = byLead.get(transition.leadId)
    if (list) list.push(transition)
    else byLead.set(transition.leadId, [transition])
  }
  for (const list of byLead.values()) list.sort((a, b) => time(a.at) - time(b.at))
  return byLead
}

/**
 * Étape la plus avancée qu'un lead ait atteinte, en tenant compte des retours en
 * arrière et des étapes sautées. Un lead sans transition est situé à son statut
 * courant : c'est tout ce qu'on sait de lui, et c'est déjà exploitable.
 */
function maxStageIndex(lead: PilotageLead, transitions: StatusTransition[]): number {
  let best = stageIndex(lead.status)
  for (const transition of transitions) {
    best = Math.max(best, stageIndex(transition.from), stageIndex(transition.to))
  }
  return best
}

// ─── Entonnoir ───────────────────────────────────────────────────────────────

export interface FunnelStageResult {
  stage: FunnelStage
  count: number
  /** Part des leads de l'étape précédente qui ont atteint celle-ci. `null` à la première étape. */
  rateFromPrevious: number | null
}

export interface FunnelResult {
  stages: FunnelStageResult[]
  total: number
}

/**
 * Entonnoir par cohorte : combien de leads sont arrivés **au moins** jusqu'à
 * chaque étape.
 *
 * Le « au moins » est délibéré. Compter les étapes strictement traversées
 * produirait un entonnoir non monotone — moins de CONTACTED que de DEMO dès
 * qu'un lead saute une étape — impossible à lire. Un lead qui a dépassé une
 * étape l'a bien franchie.
 */
export function buildFunnel(leads: PilotageLead[], transitions: StatusTransition[]): FunnelResult {
  const byLead = groupTransitionsByLead(transitions)
  const counts = new Array(FUNNEL_STAGES.length).fill(0)

  for (const lead of leads) {
    const reached = maxStageIndex(lead, byLead.get(lead._id) ?? [])
    for (let index = 0; index <= reached; index += 1) counts[index] += 1
  }

  return {
    total: leads.length,
    stages: FUNNEL_STAGES.map((stage, index) => ({
      stage,
      count: counts[index]!,
      rateFromPrevious: index === 0 || counts[index - 1] === 0 ? null : counts[index]! / counts[index - 1]!,
    })),
  }
}

// ─── Vélocité ────────────────────────────────────────────────────────────────

export interface VelocityStageResult {
  stage: FunnelStage
  medianDays: number | null
  averageDays: number | null
  /** Nombre de passages effectivement mesurés — une étape non quittée n'en fournit aucun. */
  samples: number
}

export interface VelocityResult {
  stages: VelocityStageResult[]
  cycle: { medianDays: number | null; averageDays: number | null; samples: number }
}

/**
 * Durées observées : temps passé dans chaque étape, et cycle complet de la
 * création à la signature.
 *
 * Une étape encore occupée ne fournit aucune mesure : sa durée n'est pas
 * connue, seulement minorée. La compter fausserait le chiffre vers le bas.
 */
export function computeVelocity(leads: PilotageLead[], transitions: StatusTransition[]): VelocityResult {
  const byLead = groupTransitionsByLead(transitions)
  const durations = new Map<string, number[]>(FUNNEL_STAGES.map((stage) => [stage, []]))
  const cycles: number[] = []

  for (const lead of leads) {
    const moves = byLead.get(lead._id) ?? []
    if (moves.length === 0) continue

    // Le lead entre dans son statut d'origine à sa création.
    let currentStage: string = moves[0]!.from
    let enteredAt = time(lead.createdAt)

    for (const move of moves) {
      const movedAt = time(move.at)
      const bucket = durations.get(currentStage)
      if (bucket) bucket.push((movedAt - enteredAt) / MS_PER_DAY)
      currentStage = move.to
      enteredAt = movedAt

      if (move.to === 'WON') cycles.push((movedAt - time(lead.createdAt)) / MS_PER_DAY)
    }
  }

  return {
    stages: FUNNEL_STAGES.map((stage) => {
      const values = durations.get(stage) ?? []
      return {
        stage,
        medianDays: round(median(values)),
        averageDays: round(average(values)),
        samples: values.length,
      }
    }),
    cycle: {
      medianDays: round(median(cycles)),
      averageDays: round(average(cycles)),
      samples: cycles.length,
    },
  }
}

// ─── Motifs de perte ─────────────────────────────────────────────────────────

export interface LossReasonResult {
  reason: string
  count: number
  share: number
}

export interface LossStageResult {
  stage: string
  count: number
}

export interface LossBreakdown {
  total: number
  unspecified: number
  byReason: LossReasonResult[]
  byStage: LossStageResult[]
}

/** Répartition des affaires perdues, par motif et par étape de sortie. */
export function buildLossBreakdown(leads: PilotageLead[], transitions: StatusTransition[]): LossBreakdown {
  const byLead = groupTransitionsByLead(transitions)
  const lost = leads.filter((lead) => lead.status === 'LOST')

  const reasons = new Map<string, number>()
  const stages = new Map<string, number>()

  for (const lead of lost) {
    const reason = lead.lostReason?.trim() || UNSPECIFIED
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1)

    // L'étape de sortie est celle qu'occupait le lead au moment de le perdre.
    const moves = byLead.get(lead._id) ?? []
    const exit = [...moves].reverse().find((move) => move.to === 'LOST')
    const stage = exit?.from ?? UNSPECIFIED
    stages.set(stage, (stages.get(stage) ?? 0) + 1)
  }

  const total = lost.length
  return {
    total,
    unspecified: reasons.get(UNSPECIFIED) ?? 0,
    byReason: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count, share: total === 0 ? 0 : count / total }))
      .sort((a, b) => b.count - a.count),
    byStage: [...stages.entries()].map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count),
  }
}

// ─── Performance par source ou par commercial ────────────────────────────────

export interface PerformanceRow {
  key: string
  total: number
  won: number
  lost: number
  active: number
  /** Gagnés rapportés aux affaires **conclues**. `null` si aucune ne l'est encore. */
  winRate: number | null
  wonBudget: number
}

/**
 * Ventilation par canal d'acquisition ou par commercial.
 *
 * Le taux se calcule sur les affaires conclues et non sur le total : rapporter
 * les gains à un total gonflé d'affaires encore ouvertes ferait passer une
 * bonne performance pour un échec.
 */
export function groupPerformance(leads: PilotageLead[], key: 'source' | 'assignedTo'): PerformanceRow[] {
  const rows = new Map<string, PerformanceRow>()

  for (const lead of leads) {
    const raw = key === 'source' ? lead.source : lead.assignedTo
    const bucket = (typeof raw === 'string' ? raw.trim() : '') || UNSPECIFIED

    const row = rows.get(bucket) ?? { key: bucket, total: 0, won: 0, lost: 0, active: 0, winRate: null, wonBudget: 0 }

    row.total += 1
    if (lead.status === 'WON') {
      row.won += 1
      row.wonBudget += lead.budget ?? 0
    } else if (lead.status === 'LOST') {
      row.lost += 1
    } else {
      row.active += 1
    }
    rows.set(bucket, row)
  }

  return [...rows.values()]
    .map((row) => ({ ...row, winRate: row.won + row.lost === 0 ? null : row.won / (row.won + row.lost) }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))
}

// ─── Couverture ──────────────────────────────────────────────────────────────

export interface CoverageResult {
  total: number
  withHistory: number
  withoutHistory: number
  ratio: number
}

/**
 * Part de la cohorte dont le parcours est réellement journalisé.
 *
 * Un lead encore à la première étape n'a rien à journaliser : son absence de
 * transition est normale et ne compte pas comme un trou. Le cas signalé est
 * celui d'un lead déjà avancé dont aucun passage n'a été enregistré — parcours
 * antérieur à la journalisation, ou `activityLogging` désactivé. Ces leads
 * restent comptés dans l'entonnoir, à leur statut courant ; ce sont les durées
 * qu'ils ne peuvent pas alimenter.
 */
export function assessCoverage(leads: PilotageLead[], transitions: StatusTransition[]): CoverageResult {
  const byLead = groupTransitionsByLead(transitions)
  let withHistory = 0
  let withoutHistory = 0

  for (const lead of leads) {
    const hasMoves = (byLead.get(lead._id)?.length ?? 0) > 0
    if (hasMoves) withHistory += 1
    else if (stageIndex(lead.status) > 0 || lead.status === 'LOST') withoutHistory += 1
  }

  const relevant = withHistory + withoutHistory
  return {
    total: leads.length,
    withHistory,
    withoutHistory,
    ratio: relevant === 0 ? 1 : withHistory / relevant,
  }
}
