import { apiFetch } from '../../../../lib/api'

const BASE = '/api/admin/crm'

export interface CrmView {
  _id: string
  name: string
  owner: string
  scope: 'PRIVATE' | 'TEAM'
  filters: RichFilters
  columns: string[]
  sort: { key: string; dir: 1 | -1 } | null
  mode: 'table' | 'kanban'
  pinned: boolean
}

export interface RichFilters {
  q?: string
  project?: string
  owner?: string
  source?: string
  temperature?: string
  tag?: string
  late?: boolean
  big?: boolean
}

export type BulkAction = 'assign' | 'status' | 'tag' | 'archive' | 'restore' | 'delete'

export interface BulkResult {
  action: BulkAction
  ok: number
  failed: number
  results: Array<{ id: string; ok: boolean; error?: string }>
}

export const listViews = () => apiFetch<{ items: CrmView[] }>(`${BASE}/views`).then((r) => r.items)
export const createView = (view: Omit<CrmView, '_id' | 'owner' | 'pinned'> & { pinned?: boolean }) =>
  apiFetch<CrmView>(`${BASE}/views`, { method: 'POST', body: JSON.stringify(view) })
export const updateView = (id: string, patch: Partial<CrmView>) =>
  apiFetch<CrmView>(`${BASE}/views/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deleteView = (id: string) => apiFetch(`${BASE}/views/${id}`, { method: 'DELETE' })

export const bulkLeads = (ids: string[], action: BulkAction, payload: Record<string, unknown> = {}) =>
  apiFetch<BulkResult>(`${BASE}/leads/bulk`, {
    method: 'POST',
    body: JSON.stringify({ ids, action, payload, confirm: action === 'delete' ? true : undefined }),
  })

export interface LeadTask {
  _id: string
  title: string
  status: string
  dueDate: string | null
  ruleId: string | null
  userId?: { name?: string } | string
}
export interface LeadDocuments {
  quotes: Array<{ _id: string; title: string; reference?: string; status: string; createdAt: string }>
  projects: Array<{ _id: string; name: string; status: string }>
}
export interface LeadRun {
  _id: string
  ruleName: string
  status: string
  createdAt: string
  steps: Array<{ action: string; status: string; message: string }>
}

export const fetchLeadTasks = (id: string) => apiFetch<{ items: LeadTask[] }>(`${BASE}/leads/${id}/tasks`).then((r) => r.items)
export const fetchLeadDocuments = (id: string) => apiFetch<LeadDocuments>(`${BASE}/leads/${id}/documents`)
export const fetchLeadRuns = (id: string) => apiFetch<{ runs: LeadRun[] }>(`${BASE}/leads/${id}/timeline`).then((r) => r.runs)
