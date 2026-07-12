import { apiFetch } from '../lib/api'

export type HealthStatus = 'ok' | 'warning' | 'error'

export interface SystemHealth {
  status: HealthStatus
  database: { status: HealthStatus; latencyMs: number | null }
  email: { status: HealthStatus }
  push: { status: HealthStatus }
  automation: { status: HealthStatus; schedulerRunning: boolean; registeredJobs: number; lastTickAt: string | null }
  schedulers: {
    crm: { running: boolean; lastRunAt: string | null }
    accounting: { running: boolean; lastRunAt: string | null }
  }
  uploads: { status: HealthStatus; directories: Array<{ name: string; status: HealthStatus }> }
  recentErrors: Array<{ source: string; occurredAt: string }>
  checkedAt: string
}

export interface ActivityEntry {
  id: string
  title: string
  meta: string
  href: string
  dueAt?: string
}

export interface ActivitySection {
  key: string
  label: string
  href: string
  entries: ActivityEntry[]
  hasMore: boolean
}

export interface ActivitySummary {
  sections: ActivitySection[]
  limit: number
  checkedAt: string
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
  return apiFetch<SystemHealth>('/api/admin/health')
}

export async function fetchActivitySummary(limit = 5): Promise<ActivitySummary> {
  return apiFetch<ActivitySummary>(`/api/admin/activity-center?limit=${Math.min(Math.max(limit, 1), 20)}`)
}
