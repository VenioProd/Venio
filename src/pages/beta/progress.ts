import type { BetaReproducibility, BetaSeverity, BetaVerdict } from '../../services/beta'

/**
 * Mémoire locale de la progression d'un testeur.
 *
 * Une campagne se déroule rarement d'une traite : cinquante étapes se testent
 * en plusieurs sessions, entre deux interruptions. Sans cette persistance, un
 * simple rechargement efface les cases cochées et le retour à moitié rédigé.
 *
 * Volontairement local au navigateur : ce sont des notes de travail, pas des
 * données à publier. Rien ne part au serveur tant que le testeur n'a pas
 * validé son verdict.
 */

export interface DraftFeedback {
  verdict: BetaVerdict | null
  severity?: BetaSeverity | null
  reproducibility?: BetaReproducibility | null
  failedStep?: number | null
  title: string
  body: string
}

export interface ScenarioProgress {
  checked: number[]
  draft: DraftFeedback | null
}

const EMPTY: ScenarioProgress = { checked: [], draft: null }

/** La clé porte le testeur : deux personnes peuvent partager un poste. */
function keyFor(testerKey: string, scenarioId: string): string {
  return `venio-beta:${testerKey}:${scenarioId}`
}

/**
 * Le stockage peut être indisponible — navigation privée, site data bloqué,
 * certains contextes embarqués lèvent à la simple lecture. La progression est
 * un confort : elle ne doit jamais empêcher de tester.
 */
function safeRead(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* rien à faire : le testeur perdra sa progression, pas sa session */
  }
}

export function readProgress(testerKey: string, scenarioId: string): ScenarioProgress {
  const stored = safeRead(keyFor(testerKey, scenarioId))
  if (!stored || typeof stored !== 'object') return { ...EMPTY }

  const raw = stored as Record<string, unknown>
  const checked = Array.isArray(raw.checked)
    ? raw.checked.filter((step): step is number => typeof step === 'number' && Number.isFinite(step))
    : []
  const draft = raw.draft && typeof raw.draft === 'object' ? ({ ...(raw.draft as object) } as DraftFeedback) : null

  return { checked, draft }
}

function merge(testerKey: string, scenarioId: string, patch: Partial<ScenarioProgress>): void {
  const current = readProgress(testerKey, scenarioId)
  safeWrite(keyFor(testerKey, scenarioId), { ...current, ...patch })
}

export function writeChecked(testerKey: string, scenarioId: string, checked: number[]): void {
  merge(testerKey, scenarioId, { checked })
}

export function writeDraft(testerKey: string, scenarioId: string, draft: DraftFeedback | null): void {
  merge(testerKey, scenarioId, { draft })
}

/** Après l'envoi du verdict, les notes de travail n'ont plus de raison d'être. */
export function clearScenarioProgress(testerKey: string, scenarioId: string): void {
  try {
    window.localStorage.removeItem(keyFor(testerKey, scenarioId))
  } catch {
    /* voir safeWrite */
  }
}

/**
 * Choisit la démarche à rouvrir quand le testeur revient.
 *
 * Priorité à ce qu'il avait commencé — des cases cochées sans verdict rendu
 * signalent une session interrompue, et c'est là qu'il veut reprendre. À
 * défaut, la première qu'il n'a pas encore traitée.
 */
export function pickScenarioToResume(
  scenarios: Array<{ _id: string }>,
  answered: Set<string>,
  checkedByScenario: Record<string, number[] | undefined>,
): string | null {
  const pending = scenarios.filter((scenario) => !answered.has(scenario._id))

  const started = pending
    .map((scenario) => ({ id: scenario._id, count: checkedByScenario[scenario._id]?.length ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)

  return started[0]?.id ?? pending[0]?._id ?? null
}
