import { apiFetch } from '../lib/api'
import type { Task } from '../types/task.types'
import type { GestionKpi, KpiPeriod } from '../types/gestion.types'
import type { MissionBrief } from '../types/brief.types'

export async function fetchAllTasks(projectId?: string): Promise<Task[]> {
  const qs = projectId ? `?projectId=${projectId}` : ''
  const res = await apiFetch(`/api/admin/gestion/tasks-all${qs}`) as { tasks: Task[] }
  return res.tasks
}

export async function fetchGestionKpi(period: KpiPeriod, userId?: string): Promise<GestionKpi> {
  let qs = `?period=${period}`
  if (userId) qs += `&userId=${userId}`
  return apiFetch(`/api/admin/gestion/kpi${qs}`) as Promise<GestionKpi>
}

export async function fetchBriefs(projectId?: string): Promise<MissionBrief[]> {
  const qs = projectId ? `?projectId=${projectId}` : ''
  return apiFetch(`/api/admin/briefs${qs}`) as Promise<MissionBrief[]>
}

export async function createBrief(data: Record<string, unknown>): Promise<MissionBrief> {
  return apiFetch('/api/admin/briefs', {
    method: 'POST',
    body: JSON.stringify(data),
  }) as Promise<MissionBrief>
}

export async function updateBrief(id: string, data: Record<string, unknown>): Promise<MissionBrief> {
  return apiFetch(`/api/admin/briefs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }) as Promise<MissionBrief>
}

export async function deleteBrief(id: string): Promise<void> {
  await apiFetch(`/api/admin/briefs/${id}`, { method: 'DELETE' })
}
