import Anthropic, { AnthropicError } from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { modelOutputSchema, type ModelOutput } from './schema.js'

/**
 * Appel à l'API Claude. Sans `ANTHROPIC_API_KEY`, aucun appel n'est tenté :
 * l'analyse est marquée en échec explicite (`DISABLED`).
 *
 * Pas de `fallbacks` côté serveur : un refus est relancé une fois sur le même
 * modèle puis l'analyse échoue (contrat), et le modèle consigné sur l'analyse
 * reste celui qui l'a produite.
 */
export const DEFAULT_MODEL = 'claude-opus-5-5'
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
type Effort = (typeof EFFORTS)[number]

export function analysisModel(): string {
  return process.env.CALL_ANALYSIS_MODEL?.trim() || DEFAULT_MODEL
}

function analysisEffort(): Effort {
  const value = process.env.CALL_ANALYSIS_EFFORT?.trim() as Effort | undefined
  return value && EFFORTS.includes(value) ? value : 'high'
}

export function isAnalysisConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

export function buildRequest(system: string, user: string) {
  return {
    model: analysisModel(),
    // Non diffusé en flux : la sortie (≈ 800 jetons) et la réflexion tiennent largement sous ce plafond.
    max_tokens: 16000,
    thinking: { type: 'adaptive' as const },
    output_config: { effort: analysisEffort(), format: zodOutputFormat(modelOutputSchema) },
    // Consignes et grille en tête, marquées pour le cache ; la fiche et la transcription viennent après.
    system: [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: user }],
  }
}

export type ModelResult =
  | {
      kind: 'ok'
      output: ModelOutput
      model: string
      usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheWriteInputTokens: number }
    }
  | { kind: 'refused'; detail: string }
  | { kind: 'invalid'; detail: string }
  | { kind: 'api_error'; detail: string; retryable: boolean }

let client: Anthropic | null = null

export async function callModel(system: string, user: string): Promise<ModelResult> {
  client ??= new Anthropic({ maxRetries: 2, timeout: 180_000 })
  try {
    const response = await client.messages.parse(buildRequest(system, user))
    // Lire la raison d'arrêt avant le résultat : un refus ou une sortie tronquée ne se valide pas.
    if (response.stop_reason === 'refusal') {
      return { kind: 'refused', detail: `Refus du modèle (${response.stop_details?.category ?? 'sans catégorie'})` }
    }
    if (response.stop_reason === 'max_tokens') return { kind: 'invalid', detail: 'Sortie tronquée (max_tokens)' }
    if (!response.parsed_output) return { kind: 'invalid', detail: 'Sortie structurée absente' }
    return {
      kind: 'ok',
      output: response.parsed_output,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
    }
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const retryable = err instanceof Anthropic.APIConnectionError || err.status === 429 || (err.status ?? 0) >= 500
      return { kind: 'api_error', detail: `API ${err.status ?? 'connexion'} : ${err.message}`, retryable }
    }
    // Erreur du SDK hors HTTP : la réponse ne correspond pas au schéma.
    if (err instanceof AnthropicError) return { kind: 'invalid', detail: err.message }
    throw err
  }
}
