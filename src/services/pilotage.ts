import { apiFetch } from '../lib/api'
import type { LeadProject, LeadRevenueResponse, PilotagePeriod, PilotageResponse } from '../types/pilotage.types'

export function fetchPilotage(period: PilotagePeriod): Promise<PilotageResponse> {
  return apiFetch(`/api/admin/crm/pilotage?period=${period}`)
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
