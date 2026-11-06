import { apiFetch } from '../lib/api'
import type {
  CrmGoal,
  CrmGoalInput,
  ForecastResponse,
  LeadProject,
  LeadRevenueResponse,
  PilotagePeriod,
  PilotageResponse,
} from '../types/pilotage.types'

export function fetchPilotage(period: PilotagePeriod, entity?: string): Promise<PilotageResponse> {
  const query = new URLSearchParams({ period })
  if (entity) query.set('entity', entity)
  return apiFetch(`/api/admin/crm/pilotage?${query}`)
}

export function fetchLeadRevenue(leadId: string): Promise<LeadRevenueResponse> {
  return apiFetch(`/api/admin/crm/leads/${leadId}/revenue`)
}

export function fetchProjectCandidates(leadId: string): Promise<{ candidates: LeadProject[]; reason?: string }> {
  return apiFetch(`/api/admin/crm/leads/${leadId}/project-candidates`)
}

export function linkProjectToLead(leadId: string, projectId: string): Promise<unknown> {
  return apiFetch(`/api/admin/crm/leads/${leadId}/projects/${projectId}`, { method: 'POST' })
}

export function unlinkProjectFromLead(leadId: string, projectId: string): Promise<unknown> {
  return apiFetch(`/api/admin/crm/leads/${leadId}/projects/${projectId}`, { method: 'DELETE' })
}

export interface ForecastQuery {
  months?: number
  from?: string
  entity?: string
  userId?: string
}

export function fetchForecast(query: ForecastQuery = {}): Promise<ForecastResponse> {
  const params = new URLSearchParams()
  if (query.months) params.set('months', String(query.months))
  if (query.from) params.set('from', query.from)
  if (query.entity) params.set('entity', query.entity)
  if (query.userId) params.set('userId', query.userId)
  const suffix = params.toString()
  return apiFetch('/api/admin/crm/forecast' + (suffix ? '?' + suffix : ''))
}

export async function fetchGoals(range: { from?: string; to?: string } = {}): Promise<CrmGoal[]> {
  const params = new URLSearchParams()
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  const suffix = params.toString()
  const response = await apiFetch<{ goals: CrmGoal[] }>('/api/admin/crm/goals' + (suffix ? '?' + suffix : ''))
  return response.goals
}

export function createGoal(input: CrmGoalInput): Promise<{ goal: CrmGoal }> {
  return apiFetch('/api/admin/crm/goals', { method: 'POST', body: JSON.stringify(input) })
}

export function updateGoal(id: string, targets: Pick<CrmGoalInput, 'amountTarget' | 'wonCountTarget'>): Promise<{ goal: CrmGoal }> {
  return apiFetch('/api/admin/crm/goals/' + id, { method: 'PATCH', body: JSON.stringify(targets) })
}

export function deleteGoal(id: string): Promise<unknown> {
  return apiFetch('/api/admin/crm/goals/' + id, { method: 'DELETE' })
}
