import { apiFetch } from '../../../lib/api'
import type { RepLead } from '../../../services/externalSales'
import type { CallQueueParams, QueueCounts } from '../../commercial/callDesk'
import { TEAM_CALL_DESK_PREFIX } from '../crm-board/teamDeskApi'

export type { QueueCounts }

/** Séance du jour : `GET /api/admin/call-desk/session` (ses appels du jour de Paris, des nombres seulement). */
export interface CallSession {
  day: string
  calls: number
  reached: number
  meetings: number
  conversionRate: number | null
  targetConversionRate: number | null
}

export type QueueCategory = Exclude<keyof QueueCounts, 'all'>
export const QUEUE_CATEGORIES: QueueCategory[] = ['callback', 'never', 'other']

export const fetchCallSession = () => apiFetch<CallSession>(`${TEAM_CALL_DESK_PREFIX}/session`)

/** Compteurs de « mes fiches » dans la file, sans la charger (une ligne). */
export const fetchQueueCounts = () =>
  apiFetch<{ counts?: QueueCounts }>(`${TEAM_CALL_DESK_PREFIX}/calls/queue?limit=1`).then((data) => data.counts ?? null)

/**
 * File de l'équipe restreinte à une catégorie (`?category=`). Mêmes paramètres que `teamDesk.queue`,
 * qui ne transmet pas la catégorie.
 */
export function fetchTeamQueue({
  cursor,
  callList,
  project,
  mine,
  category,
}: CallQueueParams & { category: QueueCategory }) {
  const query = new URLSearchParams()
  if (cursor) query.set('cursor', cursor)
  if (callList) query.set('callList', callList)
  if (project) query.set('project', project)
  if (mine !== undefined) query.set('mine', mine ? '1' : '0')
  query.set('category', category)
  return apiFetch<{ leads: RepLead[]; nextCursor: string | null; counts?: QueueCounts }>(
    `${TEAM_CALL_DESK_PREFIX}/calls/queue?${query}`,
  )
}
