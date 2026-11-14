import type { MessageKey } from '../i18n'
import type { User } from '../types/auth.types'
import { ADMIN_HUBS, canAccessHubTab } from './adminHubs'

/**
 * Navigation du CRM en quatre moments du travail (refonte « Journée », nov. 2026).
 * Les sous-onglets vivent dans `ADMIN_HUBS.crm.tabs` (champ `moment`) pour que
 * la palette, le fil d'Ariane et le routage les lisent au même endroit.
 */
export const CRM_MOMENTS = [
  { id: 'aujourdhui', labelKey: 'shell.crm.moment.aujourdhui', to: '/admin/crm/aujourdhui' },
  { id: 'prospecter', labelKey: 'shell.crm.moment.prospecter', to: '/admin/crm/prospecter' },
  { id: 'suivre', labelKey: 'shell.crm.moment.suivre', to: '/admin/crm/suivre' },
  { id: 'piloter', labelKey: 'shell.crm.moment.piloter', to: '/admin/crm/piloter' },
] as const satisfies readonly { id: string; labelKey: MessageKey; to: string }[]

export type CrmMomentId = (typeof CRM_MOMENTS)[number]['id']
export type CrmTab = (typeof ADMIN_HUBS.crm.tabs)[number]
export type CrmTabId = CrmTab['id']

/** Page « Où est quoi ? » (plan du CRM). */
export const CRM_PLAN_PATH = '/admin/crm/plan'
/** Entrée du CRM : le moment « Aujourd'hui ». */
export const CRM_HOME_PATH = '/admin/crm/aujourdhui'

/** Adresses des écrans, à utiliser pour tout lien interne du front. */
export const CRM_PATHS = {
  home: CRM_HOME_PATH,
  plan: CRM_PLAN_PATH,
  ...(Object.fromEntries(ADMIN_HUBS.crm.tabs.map((tab) => [tab.id, tab.to])) as Record<CrmTabId, string>),
  lead: (leadId: string) => `/admin/crm/leads/${leadId}`,
}

/** Adresse propre du Kanban (sous-chemin du pipeline) ; `?mode=kanban` reste lu. */
export const CRM_KANBAN_PATH = `${CRM_PATHS.pipeline}/kanban`

/**
 * Anciennes adresses du CRM → nouvel écran. La requête et l'ancre sont
 * conservées par `LegacyAdminRedirect` ; une requête par défaut (`?section=`)
 * ne s'ajoute que si l'adresse d'origine ne la fixe pas déjà.
 * `/admin/crm` seul est traité à part (voir `crmRootTarget`).
 */
export const CRM_LEGACY_ROUTES: Readonly<Record<string, string>> = {
  '/admin/crm/a-traiter': '/admin/crm/aujourdhui',
  '/admin/crm/appels': '/admin/crm/prospecter/poste',
  '/admin/crm/rapports-scripts': '/admin/crm/prospecter/scripts',
  '/admin/crm/pipeline': '/admin/crm/suivre/pipeline',
  '/admin/crm/comptes': '/admin/crm/suivre/comptes',
  '/admin/crm/partenaires': '/admin/crm/suivre/partenaires',
  '/admin/crm/pilotage': '/admin/crm/piloter/previsions',
  '/admin/crm/automatisations': '/admin/crm/piloter/automatisations',
  '/admin/crm/sequences': '/admin/crm/piloter/automatisations?section=sequences',
  '/admin/crm/reglages': '/admin/crm/piloter/reglages',
  '/admin/crm/settings': '/admin/crm/piloter/reglages',
}

/**
 * `/admin/crm` était le pipeline des leads (liens des e-mails, notifications et
 * fiches projet), sauf `?mode=file` qui ouvrait la file de travail.
 */
export function crmRootTarget(search: string, hash: string): string {
  const query = new URLSearchParams(search)
  const mode = query.get('mode')
  if (mode === 'file') {
    query.delete('mode')
    return `${CRM_HOME_PATH}${query.size ? `?${query}` : ''}${hash}`
  }
  if (mode === 'table') query.set('mode', 'liste')
  return `${CRM_PATHS.pipeline}${query.size ? `?${query}` : ''}${hash}`
}

/** Valeurs de `from` posées par la file quand elle ouvre une fiche, et l'onglet où revenir. */
export const CRM_QUEUE_ORIGINS: Readonly<Record<string, CrmTabId>> = {
  queue: 'jour',
  semaine: 'semaine',
  filer: 'filer',
}

export function crmQueueOrigin(tabId: CrmTabId): string | null {
  return Object.entries(CRM_QUEUE_ORIGINS).find(([, id]) => id === tabId)?.[0] ?? null
}

/**
 * Onglet actif pour une adresse du CRM. La fiche d'un lead appartient au
 * pipeline, sauf si la file l'a ouverte (`from=queue|semaine|filer`).
 */
export function resolveCrmTab(pathname: string, search = ''): CrmTab | null {
  const path = pathname.replace(/\/$/, '')
  if (path.startsWith('/admin/crm/leads/')) {
    const origin = CRM_QUEUE_ORIGINS[new URLSearchParams(search).get('from') ?? '']
    return ADMIN_HUBS.crm.tabs.find((tab) => tab.id === (origin ?? 'pipeline')) ?? null
  }
  // Le plus long préfixe gagne : `/aujourdhui/semaine` avant `/aujourdhui`.
  return (
    [...ADMIN_HUBS.crm.tabs]
      .sort((a, b) => b.to.length - a.to.length)
      .find((tab) => path === tab.to || path.startsWith(`${tab.to}/`)) ?? null
  )
}

export function resolveCrmMoment(pathname: string): CrmMomentId | null {
  const path = pathname.replace(/\/$/, '')
  return CRM_MOMENTS.find((moment) => path === moment.to || path.startsWith(`${moment.to}/`))?.id ?? null
}

export function visibleCrmTabs(user: User | null): CrmTab[] {
  return ADMIN_HUBS.crm.tabs.filter((tab) => canAccessHubTab(user, tab))
}

export function crmTabsOf(moment: CrmMomentId, tabs: readonly CrmTab[]): CrmTab[] {
  return tabs.filter((tab) => tab.moment === moment)
}

/**
 * Plan du CRM : où se trouve chaque fonction des neuf anciens onglets.
 * Sert à la page « Où est quoi ? » et au test des redirections.
 */
export const CRM_PLAN: readonly {
  id: string
  oldLabelKey: MessageKey
  oldPath: string
  tabs: readonly CrmTabId[]
}[] = [
  {
    id: 'queue',
    oldLabelKey: 'shell.hub.crm.queue',
    oldPath: '/admin/crm/a-traiter',
    tabs: ['jour', 'semaine', 'filer'],
  },
  { id: 'calls', oldLabelKey: 'shell.hub.crm.calls', oldPath: '/admin/crm/appels', tabs: ['poste'] },
  { id: 'leads', oldLabelKey: 'shell.hub.crm.pipeline', oldPath: '/admin/crm', tabs: ['pipeline'] },
  { id: 'pilotage', oldLabelKey: 'shell.hub.crm.pilotage', oldPath: '/admin/crm/pilotage', tabs: ['previsions'] },
  { id: 'scripts', oldLabelKey: 'callScriptReport.tab', oldPath: '/admin/crm/rapports-scripts', tabs: ['scripts'] },
  {
    id: 'automations',
    oldLabelKey: 'shell.hub.crm.automatisations',
    oldPath: '/admin/crm/automatisations',
    tabs: ['automatisations'],
  },
  { id: 'accounts', oldLabelKey: 'shell.hub.crm.comptes', oldPath: '/admin/crm/comptes', tabs: ['comptes'] },
  {
    id: 'partners',
    oldLabelKey: 'shell.hub.crm.partenaires',
    oldPath: '/admin/crm/partenaires',
    tabs: ['partenaires'],
  },
  { id: 'settings', oldLabelKey: 'shell.hub.crm.settings', oldPath: '/admin/crm/reglages', tabs: ['reglages'] },
]
