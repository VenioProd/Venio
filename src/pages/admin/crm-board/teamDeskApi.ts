import { apiFetch } from '../../../lib/api'
import { fetchTimeline } from '../../../services/interactions'
import type { CallSettings, RepInteraction, RepLead } from '../../../services/externalSales'
import type { Lead } from '../../../types/crm.types'
import type { CallDeskApi } from '../../commercial/callDesk'

/** Routeur d'appels de l'équipe : mêmes chemins et mêmes formes que `/api/commercial` (contrat, « Vague 3 »). */
export const TEAM_CALL_DESK_PREFIX = '/api/admin/call-desk'

const json = (body: unknown) => ({ body: JSON.stringify(body) })
const KINDS: RepInteraction['kind'][] = ['EMAIL', 'CALL', 'MEETING', 'NOTE']

/** Champs d'une fiche de l'équipe que la ligne de la file reprend après une analyse appliquée. */
const REFRESHED: (keyof Lead & keyof RepLead)[] = [
  'status',
  'nextActionAt',
  'lastContactAt',
  'notes',
  'leadTemperature',
  'budget',
  'serviceType',
  'contactName',
  'contactEmail',
  'contactPhone',
  'callHold',
]

export const teamDesk: CallDeskApi = {
  apiPrefix: TEAM_CALL_DESK_PREFIX,
  team: true,
  allowImport: false,
  // Même règle que pour l'externe : le serveur monte l'ajout pour l'équipe à `MANAGE_CRM`, l'onglet l'exige déjà.
  allowScriptTags: true,
  mineToggle: true,
  canLiftHold: true,
  settings: () => apiFetch<CallSettings>(`${TEAM_CALL_DESK_PREFIX}/calls/settings`),
  filters: () => apiFetch<{ lists: string[]; projects: string[] }>(`${TEAM_CALL_DESK_PREFIX}/calls/filters`),
  queue: ({ cursor, callList, project, mine }) => {
    const query = new URLSearchParams()
    if (cursor) query.set('cursor', cursor)
    if (callList) query.set('callList', callList)
    if (project) query.set('project', project)
    if (mine !== undefined) query.set('mine', mine ? '1' : '0')
    return apiFetch<{ leads: RepLead[]; nextCursor: string | null }>(
      `${TEAM_CALL_DESK_PREFIX}/calls/queue${query.size ? `?${query}` : ''}`,
    )
  },
  quickCall: (leadId, input) =>
    apiFetch<{ interactionId: string }>(`${TEAM_CALL_DESK_PREFIX}/leads/${leadId}/quick-call`, {
      method: 'POST',
      ...json(input),
    }),
  undoQuickCall: (leadId, interactionId) =>
    apiFetch<{ lead: RepLead }>(`${TEAM_CALL_DESK_PREFIX}/leads/${leadId}/quick-call/${interactionId}/undo`, {
      method: 'POST',
    }),
  addScriptTag: (tag) =>
    apiFetch<{ scriptTags: string[] }>(`${TEAM_CALL_DESK_PREFIX}/calls/script-tags`, {
      method: 'POST',
      ...json({ tag }),
    }),
  history: (leadId) =>
    fetchTimeline('LEAD', leadId, 5).then((data) =>
      data.entries
        .filter((entry) => entry.source === 'INTERACTION')
        .slice(0, 5)
        .map((entry) => ({
          _id: entry.id,
          kind: KINDS.includes(entry.kind as RepInteraction['kind']) ? (entry.kind as RepInteraction['kind']) : 'NOTE',
          direction: entry.direction === 'IN' || entry.direction === 'OUT' ? entry.direction : 'NONE',
          occurredAt: entry.occurredAt,
          subject: entry.label,
          body: entry.body,
        })),
    ),
  lead: (leadId) =>
    apiFetch<{ lead: Lead }>(`/api/admin/crm/leads/${leadId}`).then(({ lead }) => {
      const fresh: Partial<RepLead> = {}
      for (const key of REFRESHED) if (key in lead) Object.assign(fresh, { [key]: lead[key] })
      return fresh
    }),
  confirmBusinessContact: (leadId) =>
    apiFetch(`/api/admin/crm/leads/${leadId}`, { method: 'PATCH', ...json({ businessContact: true }) }),
}
