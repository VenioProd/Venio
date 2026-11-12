import {
  commercialApi,
  type CallDraft,
  type CallSettings,
  type RepInteraction,
  type RepLead,
} from '../../services/externalSales'

export interface CallQueueParams {
  cursor?: string
  callList?: string
  project?: string
  /** Équipe seulement : `true` = mes fiches, `false` = tout mon périmètre. */
  mine?: boolean
}

/**
 * Ce que la file d'appels demande à son serveur. Le commercial externe et l'équipe partagent le même écran
 * (`CallDesk` dans `CommercialCalls.tsx`) ; seuls les routes et quelques droits changent.
 */
export interface CallDeskApi {
  /** Routeur des appels (softphone, appels d'une fiche, transcripts, analyses). */
  apiPrefix: string
  /** Titre : un `h1` dans l'espace du commercial, un `h2` sous l'en-tête du CRM. */
  team: boolean
  /** Import de listes d'appel (commercial seulement). */
  allowImport: boolean
  /** Ajout d'une étiquette de script depuis la file. */
  allowScriptTags: boolean
  /** Bascule « mes fiches / tout mon périmètre ». */
  mineToggle: boolean
  /** Lever la retenue d'une opposition (équipe seulement). */
  canLiftHold: boolean
  settings: () => Promise<CallSettings>
  filters: () => Promise<{ lists: string[]; projects: string[] }>
  queue: (params: CallQueueParams) => Promise<{ leads: RepLead[]; nextCursor: string | null }>
  quickCall: (leadId: string, input: CallDraft) => Promise<{ interactionId: string }>
  undoQuickCall: (leadId: string, interactionId: string) => Promise<{ lead: RepLead }>
  addScriptTag: (tag: string) => Promise<{ scriptTags: string[] }>
  /** Les 5 derniers échanges de la fiche. */
  history: (leadId: string) => Promise<RepInteraction[]>
  /** Relecture d'une fiche après une analyse appliquée : les champs à fusionner dans la ligne de la file. */
  lead: (leadId: string) => Promise<Partial<RepLead>>
}

export const commercialDesk: CallDeskApi = {
  apiPrefix: '/api/commercial',
  team: false,
  allowImport: true,
  allowScriptTags: true,
  mineToggle: false,
  canLiftHold: false,
  settings: () => commercialApi.callSettings(),
  filters: () => commercialApi.callFilters(),
  queue: ({ cursor, callList, project }) => commercialApi.callQueue({ cursor, callList, project }),
  quickCall: (leadId, input) => commercialApi.quickCall(leadId, input),
  undoQuickCall: (leadId, interactionId) => commercialApi.undoQuickCall(leadId, interactionId),
  addScriptTag: (tag) => commercialApi.addScriptTag(tag),
  history: (leadId) => commercialApi.lead(leadId).then((data) => data.interactions.slice(0, 5)),
  lead: (leadId) => commercialApi.lead(leadId).then((data) => data.lead),
}
