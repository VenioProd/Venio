import type { ICallAnalysisSettings, IHeatCriterion } from '../../types/models/index.js'
import type { HeatCriterionOutput, HeatLevel, ModelOutput } from './schema.js'
import { isQuoteInTranscript, type TranscriptIndex } from './quotes.js'

/** Grille de départ de l'étude du 12 nov. 2026 : à ajuster dans les réglages du CRM, sans redéploiement. */
export const DEFAULT_HEAT_CRITERIA: IHeatCriterion[] = [
  {
    key: 'need',
    label: 'Besoin exprimé',
    max: 25,
    description: 'Le prospect décrit lui-même un problème ou un projet',
  },
  {
    key: 'commitment',
    label: 'Engagement pris',
    max: 20,
    description: 'Rendez-vous, demande de devis, envoi de documents accepté',
  },
  { key: 'timeline', label: 'Échéance', max: 20, description: 'Une date ou un horizon cité' },
  { key: 'budget', label: 'Budget', max: 15, description: 'Un montant, une fourchette ou une enveloppe confirmée' },
  { key: 'decisionMaker', label: 'Décideur', max: 15, description: "L'interlocuteur décide, ou nomme qui décide" },
  {
    key: 'blockingObjection',
    label: 'Objection bloquante',
    max: -20,
    description: 'Refus net, prestataire en place sous contrat, hors cible',
  },
]

export const DEFAULT_HEAT_THRESHOLDS = { tiede: 25, chaud: 50, tresChaud: 75 }

export const DEFAULT_CALL_ANALYSIS_SETTINGS: ICallAnalysisSettings = {
  enabled: true,
  heatGrid: { criteria: DEFAULT_HEAT_CRITERIA, thresholds: DEFAULT_HEAT_THRESHOLDS },
  retentionMonths: 12,
}

const CRITERION_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/

/** Contrôle d'une grille saisie dans les réglages ; renvoie le premier défaut, ou `null`. */
export function heatGridError(grid: ICallAnalysisSettings['heatGrid'] | undefined | null): string | null {
  if (!grid || !Array.isArray(grid.criteria) || grid.criteria.length === 0 || grid.criteria.length > 12)
    return 'La grille compte de 1 à 12 critères'
  const keys = new Set<string>()
  for (const criterion of grid.criteria) {
    if (!CRITERION_KEY.test(String(criterion?.key ?? ''))) return `Clé de critère invalide : ${criterion?.key}`
    if (keys.has(criterion.key)) return `Clé de critère en double : ${criterion.key}`
    keys.add(criterion.key)
    if (!Number.isInteger(criterion.max) || criterion.max === 0 || Math.abs(criterion.max) > 100)
      return `Maximum invalide pour ${criterion.key} : entier non nul entre -100 et 100`
    if (!String(criterion.label ?? '').trim()) return `Libellé manquant pour ${criterion.key}`
  }
  const t = grid.thresholds
  if (
    !t ||
    ![t.tiede, t.chaud, t.tresChaud].every((value) => Number.isInteger(value) && value > 0 && value <= 100) ||
    !(t.tiede < t.chaud && t.chaud < t.tresChaud)
  )
    return 'Seuils attendus : entiers croissants entre 1 et 100 (tiède < chaud < très chaud)'
  return null
}

/** Grille appliquée : celle des réglages si elle est valide, sinon celle de départ. */
export function effectiveHeatGrid(settings: { callAnalysis?: ICallAnalysisSettings | null }) {
  const grid = settings.callAnalysis?.heatGrid
  if (grid && !heatGridError(grid)) {
    return {
      criteria: grid.criteria.map(({ key, label, max, description }) => ({ key, label, max, description })),
      thresholds: { tiede: grid.thresholds.tiede, chaud: grid.thresholds.chaud, tresChaud: grid.thresholds.tresChaud },
    }
  }
  return { criteria: DEFAULT_HEAT_CRITERIA, thresholds: DEFAULT_HEAT_THRESHOLDS }
}

export function heatLevel(score: number, thresholds: ICallAnalysisSettings['heatGrid']['thresholds']): HeatLevel {
  if (score >= thresholds.tresChaud) return 'TRES_CHAUD'
  if (score >= thresholds.chaud) return 'CHAUD'
  if (score >= thresholds.tiede) return 'TIEDE'
  return 'FROID'
}

/**
 * Chaleur recalculée par le serveur. Le modèle ne fournit que des points par
 * critère et leur citation : un critère inconnu est écarté, un critère absent
 * vaut 0, les points sont bornés par la grille, et des points sans citation
 * retrouvée dans le transcript valent 0. Une opposition détectée force « froid ».
 */
export function computeHeat(
  modelHeat: ModelOutput['heat'],
  grid: ReturnType<typeof effectiveHeatGrid>,
  transcript: TranscriptIndex,
  optOutDetected: boolean,
) {
  const criteria: HeatCriterionOutput[] = grid.criteria.map((criterion) => {
    const proposed = modelHeat.criteria.find((item) => item.key === criterion.key)
    const quote = proposed?.quote?.trim() || null
    const quoteVerified = quote !== null && isQuoteInTranscript(quote, transcript)
    const raw = Number.isFinite(proposed?.points) ? Math.round(proposed!.points) : 0
    const bounded =
      criterion.max > 0 ? Math.min(Math.max(raw, 0), criterion.max) : Math.max(Math.min(raw, 0), criterion.max)
    return {
      key: criterion.key,
      label: criterion.label,
      max: criterion.max,
      points: quoteVerified ? bounded : 0,
      quote,
      quoteVerified,
    }
  })
  const score = Math.min(
    100,
    Math.max(
      0,
      criteria.reduce((sum, criterion) => sum + criterion.points, 0),
    ),
  )
  return { score, level: optOutDetected ? ('FROID' as const) : heatLevel(score, grid.thresholds), criteria }
}
