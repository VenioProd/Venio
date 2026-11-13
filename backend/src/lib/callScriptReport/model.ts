import Anthropic, { AnthropicError } from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { analysisModel } from '../callAnalysis/model.js'
import { scriptReportModelSchema, type ScriptReportModelOutput } from './schema.js'

export const PROMPT_VERSION = 'script-report-1'
/** Sortie bornée : le coût d'un rapport est plafonné en entrée (réglage) et en sortie (ici). */
const MAX_OUTPUT_TOKENS = 8000

export function reportModel(configured: string): string {
  return configured.trim() || process.env.CALL_SCRIPT_REPORT_MODEL?.trim() || analysisModel()
}

export const SYSTEM_PROMPT = `Tu es coach en prospection téléphonique pour Venio, agence web à Paris.
Tu reçois les transcriptions des appels d'un commercial sur une semaine, chacune repérée par un code (C1, C2…), avec son résultat déclaré, son script et, quand elle existe, la chaleur estimée.

But : aider ce commercial à atteindre l'objectif de conversion indiqué (rendez-vous obtenus sur prospects joints).

Produis :
- summary : trois phrases au plus sur la semaine.
- conversionReading : lecture du taux de conversion face à l'objectif, et ce qui le tire vers le haut ou le bas.
- objections : les objections récurrentes, de la plus fréquente à la moins fréquente (cinq au plus), avec le nombre d'appels où elles apparaissent, une ou deux citations, et une réponse à essayer.
- advancing : les passages qui ont fait avancer l'appel (cinq au plus).
- losing : les passages où l'appel s'est perdu (cinq au plus).
- scriptChanges : les formulations de script à essayer la semaine prochaine (cinq au plus) ; « current » est la formulation actuelle si elle apparaît, sinon null.

Règles :
- Chaque citation est recopiée mot pour mot depuis la transcription de l'appel indiqué dans « call », en une seule prise de parole, quinze mots au plus. Le serveur écarte toute citation introuvable.
- N'écris jamais de nom de personne, d'entreprise, de numéro de téléphone ni d'adresse e-mail, ni dans les citations ni ailleurs : choisis une autre citation ou écris « le prospect ».
- Tu juges les formulations et la conduite de l'appel, jamais la personne du commercial : ni émotion, ni note de personnalité.
- Si les appels sont trop peu nombreux pour conclure, dis-le plutôt que d'inventer une tendance.
- Réponds en français.`

export type ReportModelResult =
  | { kind: 'ok'; output: ScriptReportModelOutput; model: string; usage: { inputTokens: number; outputTokens: number } }
  | { kind: 'refused' | 'invalid'; detail: string }
  | { kind: 'api_error'; detail: string; retryable: boolean }

let client: Anthropic | null = null

export async function callReportModel(model: string, user: string): Promise<ReportModelResult> {
  client ??= new Anthropic({ maxRetries: 2, timeout: 300_000 })
  try {
    const response = await client.messages.parse({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: zodOutputFormat(scriptReportModelSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    })
    if (response.stop_reason === 'refusal') return { kind: 'refused', detail: 'Refus du modèle' }
    if (response.stop_reason === 'max_tokens') return { kind: 'invalid', detail: 'Sortie tronquée (max_tokens)' }
    if (!response.parsed_output) return { kind: 'invalid', detail: 'Sortie structurée absente' }
    return {
      kind: 'ok',
      output: response.parsed_output,
      model: response.model,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    }
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const retryable = err instanceof Anthropic.APIConnectionError || err.status === 429 || (err.status ?? 0) >= 500
      return { kind: 'api_error', detail: `API ${err.status ?? 'connexion'} : ${err.message}`, retryable }
    }
    if (err instanceof AnthropicError) return { kind: 'invalid', detail: err.message }
    throw err
  }
}
