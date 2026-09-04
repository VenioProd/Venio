import { apiFetch } from '../lib/api'
import type { DevIssue, UserRef } from './dev'

export type BetaCampaignStatus = 'DRAFT' | 'RUNNING' | 'CLOSED'
export type BetaScenarioStatus = 'NOT_TESTED' | 'OK' | 'KO' | 'TO_OPTIMIZE' | 'TO_RETEST'
export type BetaVerdict = 'WORKS' | 'BROKEN' | 'TO_OPTIMIZE'
export type BetaSeverity = 'BLOCKER' | 'MAJOR' | 'MINOR' | 'COSMETIC'
export type BetaReproducibility = 'ALWAYS' | 'SOMETIMES' | 'ONCE'
export type BetaRunStatus = 'OPEN' | 'ACKNOWLEDGED' | 'FIXED' | 'REJECTED'

export interface BetaStep {
  order: number
  instruction: string
  expected: string
}

export interface BetaCampaign {
  _id: string
  devProject: { _id: string; key: string; name: string; color?: string } | string
  name: string
  description: string
  targetUrl: string | null
  status: BetaCampaignStatus
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
  counts?: { scenarios: number; openFindings: number; testers: number }
}

export interface BetaScenario {
  _id: string
  campaign: string
  number: number
  identifier: string
  title: string
  description: string
  steps: BetaStep[]
  rank: number
  summaryStatus: BetaScenarioStatus
}

export interface BetaTester {
  _id: string
  campaign: string
  name: string
  email: string
  invitedAt: string
  lastSeenAt: string | null
  revokedAt: string | null
  expiresAt: string | null
}

export interface BetaAttachmentRef {
  _id: string
  originalName: string
  mimeType: string
  size: number
}

export interface BetaRunContext {
  url: string | null
  userAgent: string | null
  viewportWidth: number | null
  viewportHeight: number | null
  isMobile: boolean | null
}

export interface BetaRun {
  _id: string
  campaign: string
  scenario: { _id: string; identifier: string; title: string } | string
  tester: { _id: string; name: string; email: string } | null
  user: UserRef | null
  verdict: BetaVerdict
  severity: BetaSeverity | null
  reproducibility: BetaReproducibility | null
  status: BetaRunStatus
  failedStep: number | null
  title: string
  body: string
  context: BetaRunContext | null
  attachments: BetaAttachmentRef[]
  confirmationCount: number
  devIssue: Pick<DevIssue, '_id' | 'identifier' | 'title' | 'status'> | null
  createdAt: string
  updatedAt: string
}

export interface BetaComment {
  _id: string
  run: string
  authorUser: UserRef | null
  authorTester: { _id: string; name: string } | null
  body: string
  visibleToTester: boolean
  createdAt: string
}

export interface BetaCoverage {
  cells: Record<string, Record<string, BetaVerdict | null>>
  testedCount: number
  expectedCount: number
  disputedScenarioIds: string[]
  silentTesterIds: string[]
}

export interface BetaTemplate {
  _id: string
  name: string
  description: string
  scenarios: Array<{ title: string; description: string; steps: BetaStep[] }>
}

export interface CampaignDetail {
  campaign: BetaCampaign
  scenarios: BetaScenario[]
  testers: BetaTester[]
  coverage: BetaCoverage
}

const BASE = '/api/admin/beta'

function qs(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const rendered = search.toString()
  return rendered ? `?${rendered}` : ''
}

// ─── Campagnes ───

export function listCampaigns(filters: { devProject?: string; status?: string } = {}) {
  return apiFetch<{ campaigns: BetaCampaign[] }>(`${BASE}/campaigns${qs(filters)}`)
}

export function getCampaign(id: string) {
  return apiFetch<CampaignDetail>(`${BASE}/campaigns/${id}`)
}

export function createCampaign(data: {
  devProject: string
  name: string
  description?: string
  targetUrl?: string
  endsAt?: string
}) {
  return apiFetch<{ campaign: BetaCampaign }>(`${BASE}/campaigns`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateCampaign(id: string, data: Partial<BetaCampaign>) {
  return apiFetch<{ campaign: BetaCampaign }>(`${BASE}/campaigns/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function campaignReportUrl(id: string): string {
  return `${BASE}/campaigns/${id}/report`
}

// ─── Démarches ───

export function createScenario(
  campaignId: string,
  data: { title: string; description?: string; steps?: Array<{ instruction: string; expected: string }> },
) {
  return apiFetch<{ scenario: BetaScenario }>(`${BASE}/campaigns/${campaignId}/scenarios`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateScenario(id: string, data: Partial<BetaScenario>) {
  return apiFetch<{ scenario: BetaScenario }>(`${BASE}/scenarios/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function archiveScenario(id: string) {
  return apiFetch<{ scenario: BetaScenario }>(`${BASE}/scenarios/${id}`, { method: 'DELETE' })
}

// ─── Testeurs ───

export function inviteTester(campaignId: string, data: { name: string; email: string }) {
  // `token` n'est renvoyé qu'ici : c'est le seul moment où le lien est lisible.
  return apiFetch<{ tester: BetaTester; token: string }>(`${BASE}/campaigns/${campaignId}/testers`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function revokeTester(id: string) {
  return apiFetch<{ tester: BetaTester }>(`${BASE}/testers/${id}/revoke`, { method: 'POST' })
}

export function rotateTesterLink(id: string) {
  return apiFetch<{ tester: BetaTester; token: string }>(`${BASE}/testers/${id}/rotate`, { method: 'POST' })
}

export function testerLinkUrl(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return `${origin}/beta/${token}`
}

// ─── Retours ───

export function listRuns(campaignId: string, filters: { status?: string; verdict?: string; scenario?: string } = {}) {
  return apiFetch<{ runs: BetaRun[] }>(`${BASE}/campaigns/${campaignId}/runs${qs(filters)}`)
}

export function updateRunStatus(id: string, status: BetaRunStatus) {
  return apiFetch<{ run: BetaRun }>(`${BASE}/runs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function promoteRun(id: string) {
  return apiFetch<{ issue: DevIssue }>(`${BASE}/runs/${id}/promote`, { method: 'POST' })
}

export function listRunComments(id: string) {
  return apiFetch<{ comments: BetaComment[] }>(`${BASE}/runs/${id}/comments`)
}

export function addRunComment(id: string, body: string, visibleToTester = true) {
  return apiFetch<{ comment: BetaComment }>(`${BASE}/runs/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, visibleToTester }),
  })
}

export function runAttachmentUrl(runId: string, attachmentId: string): string {
  return `${BASE}/runs/${runId}/attachments/${attachmentId}`
}

// ─── Trames ───

export function listTemplates() {
  return apiFetch<{ templates: BetaTemplate[] }>(`${BASE}/templates`)
}

export function createTemplate(data: { name: string; description?: string; fromCampaign?: string }) {
  return apiFetch<{ template: BetaTemplate }>(`${BASE}/templates`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function applyTemplate(campaignId: string, templateId: string) {
  return apiFetch<{ scenarios: BetaScenario[] }>(`${BASE}/campaigns/${campaignId}/apply-template`, {
    method: 'POST',
    body: JSON.stringify({ template: templateId }),
  })
}
