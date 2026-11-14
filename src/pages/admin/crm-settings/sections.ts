import type { MessageKey } from '../../../i18n'

/**
 * Sections des réglages du CRM : un sous-chemin par section
 * (`/admin/crm/piloter/reglages/<id>`), regroupées comme dans la maquette.
 * Les composants de section n'ont pas changé : seule leur répartition change.
 */
export const SETTINGS_BASE_PATH = '/admin/crm/piloter/reglages'

export const SETTINGS_SECTION_IDS = [
  'statuts',
  'qualification',
  'score',
  'assignation',
  'doublons',
  'alertes',
  'escalade',
  'notifications',
  'rapports',
  'appels',
  'telephonie',
  'enregistrement',
  'transcription',
  'analyse',
  'scripts',
  'conservation',
  'opposes',
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number]

export const SETTINGS_GROUPS: ReadonlyArray<{
  id: string
  labelKey: MessageKey
  sections: readonly SettingsSectionId[]
}> = [
  {
    id: 'pipeline',
    labelKey: 'crmPilot.set.group.pipeline',
    sections: ['statuts', 'qualification', 'score', 'assignation', 'doublons'],
  },
  {
    id: 'alerts',
    labelKey: 'crmPilot.set.group.alerts',
    sections: ['alertes', 'escalade', 'notifications', 'rapports'],
  },
  {
    id: 'calls',
    labelKey: 'crmPilot.set.group.calls',
    sections: ['appels', 'telephonie', 'enregistrement', 'transcription', 'analyse', 'scripts'],
  },
  { id: 'data', labelKey: 'crmPilot.set.group.data', sections: ['conservation', 'opposes'] },
]

export const settingsSectionLabelKey = (id: SettingsSectionId) => `crmPilot.set.s.${id}` as MessageKey

export const settingsSectionPath = (id: SettingsSectionId) => `${SETTINGS_BASE_PATH}/${id}`

/** Section demandée par une adresse ; la première quand elle manque ou est inconnue. */
export function settingsSectionOf(pathname: string): SettingsSectionId {
  const found = pathname.replace(/\/$/, '').match(/\/reglages\/([^/]+)/)?.[1] ?? ''
  return (SETTINGS_SECTION_IDS as readonly string[]).includes(found)
    ? (found as SettingsSectionId)
    : SETTINGS_SECTION_IDS[0]
}
