import { apiFetch } from '../lib/api'
import type {
  WorkspaceLayout,
  PersonalTask,
  WorkspaceNote,
  WorkspaceNoteType,
  WorkspaceOverview,
  PersonalTaskStatus,
} from '../types/workspace.types'

const BASE = '/api/admin/workspace'

export const getLayout = () => apiFetch<WorkspaceLayout>(`${BASE}/layout`)
export const saveLayout = (layout: Partial<WorkspaceLayout>) =>
  apiFetch<WorkspaceLayout>(`${BASE}/layout`, { method: 'PUT', body: JSON.stringify(layout) })

export const getTasks = (status?: PersonalTaskStatus) =>
  apiFetch<PersonalTask[]>(`${BASE}/tasks${status ? `?status=${status}` : ''}`)
export const createTask = (data: Partial<PersonalTask>) =>
  apiFetch<PersonalTask>(`${BASE}/tasks`, { method: 'POST', body: JSON.stringify(data) })
export const updateTask = (id: string, data: Partial<PersonalTask>) =>
  apiFetch<PersonalTask>(`${BASE}/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteTask = (id: string) =>
  apiFetch<{ ok: boolean }>(`${BASE}/tasks/${id}`, { method: 'DELETE' })

export const getNotes = (type: WorkspaceNoteType) =>
  apiFetch<WorkspaceNote[]>(`${BASE}/notes?type=${type}`)
export const createNote = (data: Partial<WorkspaceNote>) =>
  apiFetch<WorkspaceNote>(`${BASE}/notes`, { method: 'POST', body: JSON.stringify(data) })
export const updateNote = (id: string, data: Partial<WorkspaceNote>) =>
  apiFetch<WorkspaceNote>(`${BASE}/notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteNote = (id: string) =>
  apiFetch<{ ok: boolean }>(`${BASE}/notes/${id}`, { method: 'DELETE' })
export const convertIdea = (id: string) =>
  apiFetch<PersonalTask>(`${BASE}/notes/${id}/convert`, { method: 'POST' })

export const getOverview = () => apiFetch<WorkspaceOverview>(`${BASE}/overview`)
