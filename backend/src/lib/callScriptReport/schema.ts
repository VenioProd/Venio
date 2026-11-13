import { z } from 'zod'

/**
 * Sortie demandée au modèle pour le rapport hebdomadaire des scripts. Les
 * appels sont désignés par un repère (`C1`, `C2`…) : le modèle ne voit ni nom,
 * ni numéro, ni entreprise.
 */
export const scriptReportModelSchema = z.object({
  summary: z.string(),
  conversionReading: z.string(),
  objections: z.array(
    z.object({
      label: z.string(),
      occurrences: z.number(),
      quotes: z.array(z.object({ call: z.string(), text: z.string() })),
      response: z.string(),
    }),
  ),
  advancing: z.array(z.object({ label: z.string(), call: z.string(), quote: z.string() })),
  losing: z.array(z.object({ label: z.string(), call: z.string(), quote: z.string() })),
  scriptChanges: z.array(z.object({ current: z.string().nullable(), proposed: z.string(), why: z.string() })),
})
export type ScriptReportModelOutput = z.infer<typeof scriptReportModelSchema>

/** Forme rangée : citations vérifiées dans le transcript de l'appel cité, données personnelles masquées. */
export interface ScriptReportOutput {
  summary: string
  conversionReading: string
  objections: Array<{ label: string; occurrences: number; quotes: string[]; response: string }>
  advancing: Array<{ label: string; quote: string | null }>
  losing: Array<{ label: string; quote: string | null }>
  scriptChanges: Array<{ current: string | null; proposed: string; why: string }>
  /** Citations écartées : absentes du transcript de l'appel cité, ou trop longues. */
  droppedQuotes: number
}
