import { apiFetch } from '../lib/api'
import type { ActivityLog } from '../types/activity.types'

export async function fetchActivities(projectId: string, limit = 30, before?: string): Promise<ActivityLog[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (before) params.set('before', before)
  const res = (await apiFetch(`/api/admin/projects/${projectId}/activity?${params}`)) as { activities: ActivityLog[] }
  return res.activities
}
