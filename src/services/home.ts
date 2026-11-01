import { apiFetch } from '../lib/api'

/** File d'actions de l'accueil — miroir de backend/src/lib/home/queue.ts. */
export const QUEUE_KINDS = ['decision', 'task', 'ticket', 'request', 'crm', 'dev'] as const
export type QueueKind = (typeof QUEUE_KINDS)[number]
export type QueuePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
export type QueueAction = 'approve' | 'improve' | 'reject' | 'complete' | 'postpone' | 'open'
export type DecisionVerdict = 'approve' | 'improve' | 'reject'

export interface QueueItem {
  id: string
  kind: QueueKind
  sourceId: string
  title: string
  subtitle: string | null
  priority: QueuePriority
  status: string
  dueAt: string | null
  slaDueAt: string | null
  overdue: boolean
  dueToday: boolean
  createdAt: string | null
  score: number
  link: string | null
  actions: QueueAction[]
  meta: Record<string, string | number | null>
}

export interface HomeQueue {
  items: QueueItem[]
  counts: Record<'all' | QueueKind, number>
  overdue: number
  dueToday: number
  kinds: QueueKind[]
  generatedAt: string
}

export const getHomeQueue = () => apiFetch<HomeQueue>('/api/admin/home/queue?limit=100')

export const decide = (decisionId: string, verdict: DecisionVerdict) =>
  apiFetch(`/api/admin/decisions/${decisionId}/${verdict}`, { method: 'POST', body: JSON.stringify({}) })

/** Écrit statut ou échéance sur la tâche d'origine (projet ou perso). */
export function patchQueueTask(item: QueueItem, patch: { status?: 'TERMINE'; dueDate?: string }) {
  const projectId = item.meta.projectId
  const path =
    item.meta.source === 'PERSONAL' || !projectId
      ? `/api/admin/workspace/tasks/${item.sourceId}`
      : `/api/admin/projects/${projectId}/tasks/${item.sourceId}`
  return apiFetch(path, { method: 'PATCH', body: JSON.stringify(patch) })
}
