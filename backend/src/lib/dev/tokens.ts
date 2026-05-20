import type { DevProjectGithubConfig } from '../../models/DevProject.js'

export interface DevTokensSnapshot {
  available: boolean
  source: 'none' | 'agents' | 'llm-runs'
  reason: string
  period: { since: string | null; until: string | null }
  totalTokens: number | null
  inputTokens: number | null
  outputTokens: number | null
  estimatedCostUsd: number | null
  missing: string[]
}

/**
 * Compute the LLM token usage snapshot for a dev project.
 *
 * As of this commit, Venio doesn't ingest LLM-run telemetry per project, so we
 * deliberately return a "non disponible" payload with a clear list of what would
 * be needed to populate it. We never invent numbers — UI renders the placeholder.
 *
 * Future wiring (none implemented yet) would aggregate from:
 *   - an `LlmRun` collection populated by the agent SDK
 *   - per-token usage stored on AgentToken (tokensConsumed, tokensCost)
 *   - or pulled from an upstream provider (Anthropic usage API, OpenRouter, …)
 */
export function computeProjectTokensSnapshot(
  _project: { _id: unknown; key: string; github?: DevProjectGithubConfig | null } | null
): DevTokensSnapshot {
  return {
    available: false,
    source: 'none',
    reason:
      "Aucune source de comptage des tokens LLM n'est connectée. Activez un suivi par run d'agent (LlmRun) ou un quota par AgentToken pour alimenter ces métriques.",
    period: { since: null, until: null },
    totalTokens: null,
    inputTokens: null,
    outputTokens: null,
    estimatedCostUsd: null,
    missing: [
      'collection LlmRun avec tokens d\'entrée/sortie par projet',
      'lien projet → tokens consommés (champ project sur AgentToken ou run)',
      'tarif modèle pour estimer le coût (USD/Mtok)',
    ],
  }
}
