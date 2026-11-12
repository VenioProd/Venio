import { apiFetch } from '../../../../lib/api'
import type { CrmRule, CrmRuleRun, RuleDraft, RuleStatus, RunsPage, SimulationResult } from './types'

const BASE = '/api/admin/crm/rules'
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

export const fetchRules = async (): Promise<CrmRule[]> => (await apiFetch<{ items: CrmRule[] }>(BASE)).items ?? []

export function fetchRuns(
  params: { status?: string; rule?: string; page?: number; pageSize?: number } = {},
): Promise<RunsPage> {
  const q = new URLSearchParams()
  if (params.status && params.status !== 'all') q.set('status', params.status)
  if (params.rule) q.set('rule', params.rule)
  q.set('page', String(params.page ?? 1))
  q.set('pageSize', String(params.pageSize ?? 50))
  return apiFetch<RunsPage>(`${BASE}/runs?${q.toString()}`)
}

export const createRule = (draft: RuleDraft) => apiFetch<CrmRule>(BASE, json('POST', draft))
export const updateRule = (id: string, patch: Partial<RuleDraft> & { status?: RuleStatus }) =>
  apiFetch<CrmRule>(`${BASE}/${id}`, json('PATCH', patch))
export const setRuleStatus = (id: string, status: RuleStatus) => updateRule(id, { status })
export const deleteRule = (id: string) => apiFetch<{ ok: boolean }>(`${BASE}/${id}`, json('DELETE'))
export const simulateRule = (id: string, record = false) =>
  apiFetch<SimulationResult>(`${BASE}/${id}/simulate`, json('POST', { record }))

export const approveRun = (id: string) => apiFetch<CrmRuleRun>(`${BASE}/runs/${id}/approve`, json('POST'))
export const rejectRun = (id: string) => apiFetch<CrmRuleRun>(`${BASE}/runs/${id}/reject`, json('POST'))
export const retryRun = (id: string) => apiFetch<CrmRuleRun>(`${BASE}/runs/${id}/retry`, json('POST'))

export const fetchAdmins = async (): Promise<Array<{ _id: string; name?: string; email?: string }>> =>
  (await apiFetch<{ users?: Array<{ _id: string; name?: string; email?: string }> }>('/api/admin/admins')).users ?? []
