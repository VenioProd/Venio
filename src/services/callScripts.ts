import { apiFetch } from '../lib/api'

/**
 * Textes des scripts d'appel, sur le routeur du poste d'appel : externe
 * `/api/commercial` (lecture seule), équipe `/api/admin/call-desk` (écriture
 * avec `MANAGE_CRM`).
 */
export const REP_CALL_DESK = '/api/commercial'
export const TEAM_CALL_DESK = '/api/admin/call-desk'

export const SCRIPT_TITLE_MAX = 120
export const SCRIPT_BODY_MAX = 5000
export const SCRIPT_TAG_MAX = 60
/** Plafond d'étiquettes du serveur (`validateCallSettings`). */
export const SCRIPT_TAGS_MAX = 30

/** Un script : son étiquette, et son texte une fois rédigé (`null` sinon). */
export interface CallScriptText {
  tag: string
  title: string | null
  body: string | null
  updatedAt: string | null
}

export const listCallScripts = (base: string) =>
  apiFetch<{ scripts: CallScriptText[] }>(`${base}/calls/scripts`).then((data) => data.scripts)

export const saveCallScript = (base: string, input: { tag: string; title: string; body: string }) =>
  apiFetch<{ script: CallScriptText }>(`${base}/calls/scripts`, {
    method: 'PUT',
    body: JSON.stringify(input),
  }).then((data) => data.script)

export const addCallScriptTag = (base: string, tag: string) =>
  apiFetch<{ scriptTags: string[] }>(`${base}/calls/script-tags`, {
    method: 'POST',
    body: JSON.stringify({ tag }),
  })
