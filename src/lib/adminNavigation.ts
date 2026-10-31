import type { User, UserRole } from '../types/auth.types'
import { hasPermission, PERMISSIONS } from './permissions'
import { getVisibleNavigation, NAVIGATION } from './rbac'
import { translate, type MessageKey } from '../i18n'

export const ADMIN_NAVIGATION_ZONES = [
  'Pilotage',
  'Clients & projets',
  'Contenu & outils',
  // i18n-ignore: identifiant de zone stable, affiché via getZoneLabel
  'Finance & conformité',
  // i18n-ignore: identifiant de zone stable, affiché via getZoneLabel
  'Équipe',
  'Analyse & rapports',
  'Administration',
] as const

export type AdminNavigationZone = (typeof ADMIN_NAVIGATION_ZONES)[number]
type NavigationItem = (typeof NAVIGATION)[number]
type NavigationId = NavigationItem['id']

// Les zones gardent leur libellé français comme identifiant stable ; l'affichage passe par ces clés.
const ZONE_LABEL_KEYS = {
  Pilotage: 'shell.zone.pilotage',
  'Clients & projets': 'shell.zone.clientsProjects',
  'Contenu & outils': 'shell.zone.contentTools',
  // i18n-ignore: identifiant de zone stable, affiché via getZoneLabel
  'Finance & conformité': 'shell.zone.financeCompliance',
  // i18n-ignore: identifiant de zone stable, affiché via getZoneLabel
  Équipe: 'shell.zone.team',
  'Analyse & rapports': 'shell.zone.analysisReports',
  Administration: 'shell.zone.administration',
} as const satisfies Record<AdminNavigationZone, MessageKey>

/** Libellé affiché d'une zone dans la langue active. */
export function getZoneLabel(zone: AdminNavigationZone): string {
  return translate(ZONE_LABEL_KEYS[zone])
}

const NAVIGATION_LABEL_KEYS: Record<string, MessageKey | undefined> = {
  home: 'shell.navItem.home',
  dashboard: 'shell.navItem.dashboard',
  'activity-center': 'shell.navItem.activityCenter',
  messages: 'shell.navItem.messages',
  clients: 'shell.navItem.clients',
  'external-sales': 'shell.navItem.externalSales',
  crm: 'shell.navItem.crm',
  projects: 'shell.navItem.projects',
  accounting: 'shell.navItem.accounting',
  interns: 'shell.navItem.interns',
  calendar: 'shell.navItem.calendar',
  emails: 'shell.navItem.emails',
  templates: 'shell.navItem.templates',
  resources: 'shell.navItem.resources',
  'tool-access': 'shell.navItem.toolAccess',
  reports: 'shell.navItem.reports',
  analytics: 'shell.navItem.analytics',
  qualiopi: 'shell.navItem.qualiopi',
  tickets: 'shell.navItem.tickets',
  'change-requests': 'shell.navItem.changeRequests',
  audit: 'shell.navItem.audit',
  'internal-projects': 'shell.navItem.internalProjects',
  dev: 'shell.navItem.dev',
  beta: 'shell.navItem.beta',
  education: 'shell.navItem.education',
  subsidiaries: 'shell.navItem.subsidiaries',
  arrow: 'shell.navItem.arrow',
  'admin-accounts': 'shell.navItem.adminAccounts',
  agents: 'shell.navItem.agents',
  health: 'shell.navItem.health',
  decisions: 'shell.navItem.decisions',
  guide: 'shell.navItem.guide',
  webhooks: 'shell.navItem.webhooks',
}

/** Libellé affiché d'un module de navigation dans la langue active (repli : libellé de la matrice RBAC). */
export function getNavigationLabel(item: NavigationItem): string {
  const key = NAVIGATION_LABEL_KEYS[item.id]
  return key ? translate(key) : item.label
}

/**
 * Tiroirs déployés par défaut à l'ouverture de la sidebar. Vide : tout est
 * replié au chargement. Les tiroirs s'ouvrent au survol (desktop, via CSS) ou
 * au clic/tap de l'en-tête (tactile & clavier) ; seul celui de la page active
 * reste ouvert.
 */
export const DEFAULT_OPEN_ZONES: AdminNavigationZone[] = []

/**
 * Modules rendus dans le pied de la sidebar (aide, support) plutôt que dans
 * un tiroir. Ils restent soumis au RBAC comme n'importe quel autre module.
 */
const FOOTER_NAVIGATION_IDS: NavigationId[] = ['guide']

/**
 * Task-oriented information architecture. Access remains exclusively defined
 * by rbac-matrix.json; this mapping only changes how authorised modules are
 * grouped and prioritised. Le regroupement suit l'usage (fréquence + tâche),
 * pas la permission : `dev` (partagé) ne rejoint donc jamais la zone
 * Administration, réservée aux outils `manage_admins`/super-admin.
 */
const ZONE_BY_NAVIGATION_ID: Partial<Record<NavigationId, AdminNavigationZone>> = {
  home: 'Pilotage',
  dashboard: 'Pilotage',
  'activity-center': 'Pilotage',
  messages: 'Pilotage',
  crm: 'Clients & projets',
  'external-sales': 'Clients & projets',
  clients: 'Clients & projets',
  arrow: 'Clients & projets',
  projects: 'Clients & projets',
  tickets: 'Clients & projets',
  'change-requests': 'Clients & projets',
  calendar: 'Clients & projets',
  templates: 'Contenu & outils',
  resources: 'Contenu & outils',
  education: 'Contenu & outils',
  'internal-projects': 'Contenu & outils',
  dev: 'Contenu & outils',
  beta: 'Contenu & outils',
  // i18n-ignore: identifiant de zone stable, affiché via getZoneLabel
  accounting: 'Finance & conformité',
  // i18n-ignore: identifiant de zone stable, affiché via getZoneLabel
  qualiopi: 'Finance & conformité',
  // i18n-ignore: identifiant de zone stable, affiché via getZoneLabel
  audit: 'Finance & conformité',
  // i18n-ignore: identifiant de zone stable, affiché via getZoneLabel
  interns: 'Équipe',
  // i18n-ignore: identifiant de zone stable, affiché via getZoneLabel
  emails: 'Équipe',
  analytics: 'Analyse & rapports',
  reports: 'Analyse & rapports',
  decisions: 'Analyse & rapports',
  'tool-access': 'Administration',
  'admin-accounts': 'Administration',
  agents: 'Administration',
  health: 'Administration',
  subsidiaries: 'Administration',
  webhooks: 'Administration',
}

export interface NavigationZone {
  id: AdminNavigationZone
  items: NavigationItem[]
}

export function getNavigationZone(item: NavigationItem): AdminNavigationZone {
  // A future matrix entry remains visible only when RBAC allows it and lands
  // in the tools zone until it receives an explicit task classification.
  return ZONE_BY_NAVIGATION_ID[item.id] ?? 'Contenu & outils'
}

export function getVisibleNavigationZones(user: User | null): NavigationZone[] {
  const itemsByZone = new Map<AdminNavigationZone, NavigationItem[]>()
  for (const zone of ADMIN_NAVIGATION_ZONES) itemsByZone.set(zone, [])

  for (const item of getVisibleNavigation(user)) {
    if (FOOTER_NAVIGATION_IDS.includes(item.id)) continue
    itemsByZone.get(getNavigationZone(item))?.push(item)
  }

  return ADMIN_NAVIGATION_ZONES.map((id) => ({ id, items: itemsByZone.get(id) || [] })).filter(
    (zone) => zone.items.length > 0,
  )
}

/** Modules d'aide/support rendus dans le pied de la sidebar (hors tiroirs). */
export function getFooterNavigation(user: User | null): NavigationItem[] {
  const visible = getVisibleNavigation(user)
  return FOOTER_NAVIGATION_IDS.flatMap((id) => visible.filter((item) => item.id === id))
}

const MOBILE_NAVIGATION_PRIORITY: NavigationId[] = ['home', 'messages', 'projects', 'crm']

export function getMobileNavigation(user: User | null): NavigationItem[] {
  const visible = getVisibleNavigation(user)
  const preferred = MOBILE_NAVIGATION_PRIORITY.flatMap((id) => visible.filter((item) => item.id === id))
  const remaining = visible.filter((item) => !preferred.some((preferredItem) => preferredItem.id === item.id))
  return [...preferred, ...remaining].slice(0, 4)
}

export interface RoleCockpit {
  title: string
  description: string
  priorities: NavigationId[]
}

interface RoleCockpitDefinition {
  titleKey: MessageKey
  descriptionKey: MessageKey
  priorities: NavigationId[]
}

const ROLE_COCKPITS: Record<Exclude<UserRole, 'CLIENT' | 'COMMERCIAL_EXTERNE'>, RoleCockpitDefinition> = {
  SUPER_ADMIN: {
    titleKey: 'shell.cockpit.superAdminTitle',
    descriptionKey: 'shell.cockpit.superAdminDescription',
    priorities: ['activity-center', 'dashboard', 'decisions', 'analytics', 'health'],
  },
  ADMIN: {
    titleKey: 'shell.cockpit.adminTitle',
    descriptionKey: 'shell.cockpit.adminDescription',
    priorities: ['activity-center', 'projects', 'crm', 'tickets'],
  },
  MANAGER: {
    titleKey: 'shell.cockpit.managerTitle',
    descriptionKey: 'shell.cockpit.managerDescription',
    priorities: ['projects', 'crm', 'tickets', 'messages'],
  },
  COMMERCIAL: {
    titleKey: 'shell.cockpit.commercialTitle',
    descriptionKey: 'shell.cockpit.commercialDescription',
    priorities: ['crm', 'clients', 'projects', 'tickets'],
  },
  RH: {
    titleKey: 'shell.cockpit.rhTitle',
    descriptionKey: 'shell.cockpit.rhDescription',
    priorities: ['interns', 'qualiopi', 'tickets', 'projects'],
  },
  COMPTABLE: {
    titleKey: 'shell.cockpit.comptableTitle',
    descriptionKey: 'shell.cockpit.comptableDescription',
    priorities: ['accounting', 'projects', 'messages'],
  },
  VIEWER: {
    titleKey: 'shell.cockpit.viewerTitle',
    descriptionKey: 'shell.cockpit.viewerDescription',
    priorities: ['projects', 'accounting', 'tickets', 'dev'],
  },
  STAGIAIRE: {
    titleKey: 'shell.cockpit.stagiaireTitle',
    descriptionKey: 'shell.cockpit.stagiaireDescription',
    priorities: ['projects', 'resources', 'tickets', 'crm'],
  },
}

const DEFAULT_COCKPIT: RoleCockpitDefinition = {
  titleKey: 'shell.cockpit.defaultTitle',
  descriptionKey: 'shell.cockpit.defaultDescription',
  priorities: ['home'],
}

export function getRoleCockpit(user: User | null): RoleCockpit {
  const definition =
    !user || user.role === 'CLIENT' || user.role === 'COMMERCIAL_EXTERNE'
      ? DEFAULT_COCKPIT
      : ROLE_COCKPITS[user.role] || DEFAULT_COCKPIT
  return {
    title: translate(definition.titleKey),
    description: translate(definition.descriptionKey),
    priorities: definition.priorities,
  }
}

export function getRoleCockpitNavigation(user: User | null): NavigationItem[] {
  const cockpit = getRoleCockpit(user)
  const visible = getVisibleNavigation(user)
  return cockpit.priorities.flatMap((id) => visible.filter((item) => item.id === id))
}

type PaletteActionDefinition = {
  id: string
  labelKey: MessageKey
  to: string
  permission: string
  destination: NavigationId
}

const PALETTE_ACTIONS: PaletteActionDefinition[] = [
  {
    id: 'create-project',
    labelKey: 'shell.paletteAction.createProject',
    to: '/admin/projets/nouveau',
    permission: PERMISSIONS.EDIT_PROJECTS,
    destination: 'projects',
  },
  {
    id: 'create-lead',
    labelKey: 'shell.paletteAction.createLead',
    to: '/admin/crm',
    permission: PERMISSIONS.MANAGE_CRM,
    destination: 'crm',
  },
  {
    id: 'create-ticket',
    labelKey: 'shell.paletteAction.createTicket',
    to: '/admin/tickets',
    permission: PERMISSIONS.CREATE_TICKETS,
    destination: 'tickets',
  },
  {
    id: 'send-message',
    labelKey: 'shell.paletteAction.sendMessage',
    to: '/admin/messages',
    permission: PERMISSIONS.SEND_MESSAGES,
    destination: 'messages',
  },
]

export type AdminCommandPaletteItem =
  | { kind: 'module'; id: string; label: string; to: string; zone: AdminNavigationZone }
  | { kind: 'action'; id: string; label: string; to: string; zone: AdminNavigationZone }

export function getCommandPaletteItems(user: User | null): AdminCommandPaletteItem[] {
  const visible = getVisibleNavigation(user)
  const modules = visible.map((item) => ({
    kind: 'module' as const,
    id: item.id,
    label: getNavigationLabel(item),
    to: item.screen,
    zone: getNavigationZone(item),
  }))
  const visibleIds = new Set(visible.map((item) => item.id))
  const actions = PALETTE_ACTIONS.filter(
    (action) => visibleIds.has(action.destination) && hasPermission(user, action.permission),
  ).map((action) => ({
    kind: 'action' as const,
    id: action.id,
    label: translate(action.labelKey),
    to: action.to,
    zone: getNavigationZone(visible.find((item) => item.id === action.destination)!),
  }))

  return [...actions, ...modules]
}
