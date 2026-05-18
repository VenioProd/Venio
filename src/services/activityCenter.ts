import { apiFetch } from '../lib/api'

export interface SystemHealth {
  mongo: { state: number; label: string; ok: boolean }
  email: { configured: boolean }
  push: { configured: boolean }
  uploads: { path: string; accessible: boolean; writable: boolean }
  schedulers: { crmLegacy: boolean; automationEngine: boolean; accountingAutoLock: boolean }
  checkedAt: string
}

export interface ActivitySummary {
  openTickets: number
  unreadMessages: number
  overdueLeads: number
  overdueBilling: number
  checkedAt: string
  details?: Record<string, string>
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
  return apiFetch<SystemHealth>('/api/admin/health')
}

export async function fetchActivitySummary(): Promise<ActivitySummary> {
  return apiFetch<ActivitySummary>('/api/admin/activity-center')
}
