import { apiFetch } from '../../../lib/api'
import type { QueueCounts } from '../../commercial/callDesk'
import { TEAM_CALL_DESK_PREFIX } from '../crm-board/teamDeskApi'

export type { QueueCounts }

/** Séance du jour : `GET <routeur d'appels>/session` (ses appels du jour de Paris, des nombres seulement). */
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

/** `apiPrefix` : routeur d'appels de l'équipe par défaut, `/api/commercial` pour le commercial externe. */
export const fetchCallSession = (apiPrefix: string = TEAM_CALL_DESK_PREFIX) =>
  apiFetch<CallSession>(`${apiPrefix}/session`)

/** Compteurs de « mes fiches » dans la file, sans la charger (une ligne). */
export const fetchQueueCounts = () =>
  apiFetch<{ counts?: QueueCounts }>(`${TEAM_CALL_DESK_PREFIX}/calls/queue?limit=1`).then((data) => data.counts ?? null)
