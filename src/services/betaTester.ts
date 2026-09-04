import { apiFetch } from '../lib/api'
import type { BetaReproducibility, BetaRunStatus, BetaSeverity, BetaStep, BetaVerdict } from './beta'

export interface TesterScenario {
  _id: string
  identifier: string
  title: string
  description: string
  steps: BetaStep[]
  summaryStatus: string
}

export interface TesterAttachment {
  _id: string
  originalName: string
  mimeType: string
  size: number
}

export interface TesterRun {
  _id: string
  scenario: string
  mine: boolean
  verdict: BetaVerdict
  severity: BetaSeverity | null
  status: BetaRunStatus
  failedStep: number | null
  title: string
  confirmationCount: number
  confirmedByMe: boolean
  createdAt: string
  /** Renseignés uniquement sur ses propres retours. */
  body?: string
  reproducibility?: BetaReproducibility | null
  attachments?: TesterAttachment[]
}

export interface TesterComment {
  _id: string
  body: string
  author: 'me' | 'team'
  createdAt: string
}

export interface TesterSession {
  tester: { name: string }
  campaign: { name: string; description: string; targetUrl: string | null; endsAt: string | null }
  scenarios: TesterScenario[]
  runs: TesterRun[]
}

export interface VerdictPayload {
  verdict: BetaVerdict
  severity?: BetaSeverity | null
  reproducibility?: BetaReproducibility | null
  failedStep?: number | null
  title?: string
  body?: string
}

const base = (token: string) => `/api/beta/${encodeURIComponent(token)}`

export function loadSession(token: string) {
  return apiFetch<TesterSession>(base(token))
}

/**
 * Le contexte technique part avec chaque verdict, sans que le testeur ait à
 * le saisir : c'est ce qui rend le retour exploitable côté équipe.
 */
export function submitVerdict(token: string, scenarioId: string, payload: VerdictPayload) {
  return apiFetch<{ run: TesterRun }>(`${base(token)}/scenarios/${scenarioId}/runs`, {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      url: typeof window === 'undefined' ? undefined : window.location.href,
      viewportWidth: typeof window === 'undefined' ? undefined : window.innerWidth,
      viewportHeight: typeof window === 'undefined' ? undefined : window.innerHeight,
      isMobile: typeof window === 'undefined' ? undefined : window.matchMedia('(pointer: coarse)').matches,
    }),
  })
}

export function confirmRun(token: string, runId: string) {
  return apiFetch<{ run: TesterRun }>(`${base(token)}/runs/${runId}/confirm`, { method: 'POST' })
}

export function listComments(token: string, runId: string) {
  return apiFetch<{ comments: TesterComment[] }>(`${base(token)}/runs/${runId}/comments`)
}

export function addComment(token: string, runId: string, body: string) {
  return apiFetch<{ comment: TesterComment }>(`${base(token)}/runs/${runId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

/** L'upload passe en multipart : on laisse le navigateur poser le Content-Type. */
export async function uploadScreenshot(token: string, runId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${base(token)}/runs/${runId}/attachments`, { method: 'POST', body: form })
  const payload = (await response.json().catch(() => null)) as {
    attachments?: TesterAttachment[]
    error?: string
  } | null
  if (!response.ok) throw new Error(payload?.error ?? 'Envoi impossible')
  return payload?.attachments ?? []
}

export function screenshotUrl(token: string, runId: string, attachmentId: string): string {
  return `${base(token)}/runs/${runId}/attachments/${attachmentId}`
}
