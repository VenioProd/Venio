import { z } from 'zod'

/**
 * Formes de l'analyse d'appel (contrat « Analyse (lot D) »).
 *
 * `modelOutputSchema` est ce que l'on demande au modèle : pas de `quoteVerified`,
 * pas d'identifiant d'action, pas de total ni de niveau de chaleur. Le serveur
 * les calcule et produit `CallAnalysisOutput`, la forme rangée et exposée.
 * Aucun champ ne porte sur le commercial (ni émotion, ni sentiment, ni note) :
 * un champ en trop dans la réponse est écarté par la validation.
 */

export const FIELD_KEYS = [
  'budget',
  'expectedCloseAt',
  'serviceType',
  'sector',
  'companySize',
  'contactName',
  'contactEmail',
  'qualification.need',
  'qualification.timeline',
  'qualification.decisionMaker',
  'qualification.objections',
  'qualification.competitors',
] as const
export type FieldKey = (typeof FIELD_KEYS)[number]

export const ACTION_TYPES = ['CALL', 'EMAIL', 'MEETING', 'TASK', 'SEQUENCE', 'HANDOFF'] as const
export const HEAT_LEVELS = ['FROID', 'TIEDE', 'CHAUD', 'TRES_CHAUD'] as const
export const CONFIDENCES = ['LOW', 'MEDIUM', 'HIGH'] as const
export type HeatLevel = (typeof HEAT_LEVELS)[number]

const fieldValue = z.union([z.string(), z.number(), z.array(z.string()), z.null()])

export const modelOutputSchema = z.object({
  summary: z.string(),
  suggestedOutcome: z.string().nullable(),
  optOut: z.object({ detected: z.boolean(), quote: z.string().nullable() }),
  fields: z.array(
    z.object({
      key: z.enum(FIELD_KEYS),
      value: fieldValue,
      confidence: z.enum(CONFIDENCES),
      quote: z.string(),
    }),
  ),
  heat: z.object({
    criteria: z.array(z.object({ key: z.string(), points: z.number(), quote: z.string().nullable() })),
  }),
  actions: z.array(
    z.object({
      type: z.enum(ACTION_TYPES),
      label: z.string(),
      dueAt: z.string().nullable(),
      reason: z.string(),
    }),
  ),
})
export type ModelOutput = z.infer<typeof modelOutputSchema>

const heatCriterionOutput = z.object({
  key: z.string(),
  label: z.string(),
  points: z.number(),
  max: z.number(),
  quote: z.string().nullable(),
  /** Extension du contrat : la citation du critère a été retrouvée dans le transcript. */
  quoteVerified: z.boolean(),
})
export type HeatCriterionOutput = z.infer<typeof heatCriterionOutput>

export const callAnalysisOutputSchema = z.object({
  summary: z.string(),
  suggestedOutcome: z.string().nullable(),
  optOut: z.object({ detected: z.boolean(), quote: z.string().nullable(), quoteVerified: z.boolean() }),
  fields: z.array(
    z.object({
      key: z.enum(FIELD_KEYS),
      value: fieldValue,
      confidence: z.enum(CONFIDENCES),
      quote: z.string(),
      quoteVerified: z.boolean(),
    }),
  ),
  heat: z.object({
    score: z.number(),
    level: z.enum(HEAT_LEVELS),
    criteria: z.array(heatCriterionOutput),
  }),
  actions: z.array(
    z.object({
      id: z.string(),
      type: z.enum(ACTION_TYPES),
      label: z.string(),
      dueAt: z.string().nullable(),
      reason: z.string(),
    }),
  ),
})
export type CallAnalysisOutput = z.infer<typeof callAnalysisOutputSchema>

export interface TranscriptSegment {
  speaker: 'REP' | 'PROSPECT'
  startMs: number
  endMs: number
  text: string
}
