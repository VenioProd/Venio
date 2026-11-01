import { ADMIN_MODULE_PATHS } from './adminHubRoutes'
import type { User, UserRole } from '../types/auth.types'
import { hasPermission, PERMISSIONS } from './permissions'
import { getVisibleNavigation, NAVIGATION } from './rbac'
import { translate, type MessageKey } from '../i18n'

export const ADMIN_NAVIGATION_ZONES = ['Pilotage', 'Commercial', 'Production', 'Organisation'] as const
export type AdminNavigationZone = (typeof ADMIN_NAVIGATION_ZONES)[number]
type NavigationItem = (typeof NAVIGATION)[number]
type NavigationId = NavigationItem['id']
const ZONE_LABEL_KEYS = {
  Pilotage: 'shell.zone.pilotage',
  Commercial: 'shell.zone.commercial',
  Production: 'shell.zone.production',
  Organisation: 'shell.zone.organisation',
} as const satisfies Record<AdminNavigationZone, MessageKey>

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
  'dev-ideas': 'shell.navItem.devIdeas',
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
export function getNavigationLabel(item: NavigationItem | AdminNavigationItem): string {
  if ('paths' in item) return getAdminNavigationLabel(item)
  const key = NAVIGATION_LABEL_KEYS[item.id]
  return key ? translate(key) : item.label
}

/** Presentation only: access to each original module still comes from the RBAC matrix. */
export const ADMIN_NAVIGATION_GROUPS = [
  { id: 'home', zone: 'Pilotage', modules: ['home', 'dashboard', 'decisions'] },
  { id: 'inbox', zone: 'Pilotage', modules: ['messages', 'activity-center', 'emails'] },
  { id: 'analytics', zone: 'Pilotage', modules: ['analytics', 'reports'] },
  { id: 'crm', zone: 'Commercial', modules: ['crm', 'clients', 'external-sales'] },
  { id: 'projects', zone: 'Production', modules: ['projects', 'internal-projects', 'templates'] },
  { id: 'requests', zone: 'Production', modules: ['change-requests', 'tickets'] },
  { id: 'calendar', zone: 'Production', modules: ['calendar'] },
  { id: 'dev', zone: 'Production', modules: ['dev', 'dev-ideas', 'beta'] },
  { id: 'resources', zone: 'Production', modules: ['resources'] },
  { id: 'accounting', zone: 'Organisation', modules: ['accounting'] },
  { id: 'team', zone: 'Organisation', modules: ['interns', 'admin-accounts', 'tool-access'] },
  { id: 'training', zone: 'Organisation', modules: ['qualiopi', 'education'] },
  { id: 'system', zone: 'Organisation', modules: ['health', 'audit', 'agents', 'webhooks'] },
] as const satisfies readonly { id: string; zone: AdminNavigationZone; modules: readonly NavigationId[] }[]

export type AdminNavigationId = (typeof ADMIN_NAVIGATION_GROUPS)[number]['id']
export interface AdminNavigationItem {
  id: AdminNavigationId
  label: string
  screen: string
  /** All original paths, including modules other than the selected destination. */
  paths: string[]
}
export interface NavigationZone {
  id: AdminNavigationZone
  items: AdminNavigationItem[]
}

export function getNavigationZone(item: { id: string }): AdminNavigationZone {
  return (
    ADMIN_NAVIGATION_GROUPS.find(
      (group) => group.id === item.id || (group.modules as readonly string[]).includes(item.id),
    )?.zone ?? 'Organisation'
  )
}

export function getVisibleAdminNavigation(user: User | null): AdminNavigationItem[] {
  const visible = getVisibleNavigation(user)
  return ADMIN_NAVIGATION_GROUPS.flatMap((group) => {
    const destination = group.modules.flatMap((id) => visible.filter((item) => item.id === id))[0]
    if (!destination) return []
    const paths = NAVIGATION.filter(
      (item) =>
        (group.modules as readonly string[]).includes(item.id) && !(group.id === 'home' && item.id === 'dashboard'),
    ).flatMap((item) => [item.screen, ...(ADMIN_MODULE_PATHS[item.id] ? [ADMIN_MODULE_PATHS[item.id]] : [])])
    if (group.id === 'home') paths.push('/admin/mon-espace')
    if (group.id === 'analytics') paths.push('/admin/dashboard', '/admin/analytics/business')
    if (group.id === 'projects') paths.push('/admin/projets', '/admin/filiales')
    if (group.id === 'requests') paths.push('/admin/demandes')
    if (group.id === 'team') paths.push('/admin/equipe')
    if (group.id === 'training') paths.push('/admin/formation')
    if (group.id === 'system') paths.push('/admin/systeme')
    if (group.id === 'inbox') paths.push('/admin/inbox')
    return [
      {
        id: group.id,
        label: translate(GROUP_LABEL_KEYS[group.id]),
        screen:
          destination.id === 'home' || (group.id === 'home' && destination.id === 'dashboard')
            ? '/admin/mon-espace'
            : (ADMIN_MODULE_PATHS[destination.id] ?? destination.screen),
        paths,
      },
    ]
  })
}

const GROUP_LABEL_KEYS = {
  home: 'shell.entry.home',
  inbox: 'shell.entry.inbox',
  analytics: 'shell.navItem.analytics',
  crm: 'shell.navItem.crm',
  projects: 'shell.navItem.projects',
  requests: 'shell.entry.requests',
  calendar: 'shell.navItem.calendar',
  dev: 'shell.entry.dev',
  resources: 'shell.navItem.resources',
  accounting: 'shell.navItem.accounting',
  team: 'shell.entry.team',
  training: 'shell.entry.training',
  system: 'shell.entry.system',
} as const satisfies Record<AdminNavigationId, MessageKey>

export function getAdminNavigationLabel(item: AdminNavigationItem): string {
  return translate(GROUP_LABEL_KEYS[item.id])
}

export function isAdminNavigationActive(item: AdminNavigationItem, pathname: string): boolean {
  return item.paths.some((path) => pathname === path || (path !== '/admin' && pathname.startsWith(`${path}/`)))
}

export function getVisibleNavigationZones(user: User | null): NavigationZone[] {
  const visible = getVisibleAdminNavigation(user)
  return ADMIN_NAVIGATION_ZONES.map((id) => ({
    id,
    items: visible.filter((item) => getNavigationZone(item) === id),
  })).filter((zone) => zone.items.length > 0)
}

const MOBILE_NAVIGATION_PRIORITY: AdminNavigationId[] = ['home', 'inbox', 'projects', 'crm']
export function getMobileNavigation(user: User | null): AdminNavigationItem[] {
  const visible = getVisibleAdminNavigation(user)
  const preferred = MOBILE_NAVIGATION_PRIORITY.flatMap((id) => visible.filter((item) => item.id === id))
  const remaining = getRoleCockpitNavigation(user).filter((item) => !preferred.some((tab) => tab.id === item.id))
  const fallback = visible.filter((item) => ![...preferred, ...remaining].some((tab) => tab.id === item.id))
  return [...preferred, ...remaining, ...fallback].slice(0, 4)
}

export interface RoleCockpit {
  title: string
  description: string
  priorities: AdminNavigationId[]
}

interface RoleCockpitDefinition {
  titleKey: MessageKey
  descriptionKey: MessageKey
  priorities: AdminNavigationId[]
}

const ROLE_COCKPITS: Record<Exclude<UserRole, 'CLIENT' | 'COMMERCIAL_EXTERNE'>, RoleCockpitDefinition> = {
  SUPER_ADMIN: {
    titleKey: 'shell.cockpit.superAdminTitle',
    descriptionKey: 'shell.cockpit.superAdminDescription',
    priorities: ['inbox', 'home', 'analytics', 'system'],
  },
  ADMIN: {
    titleKey: 'shell.cockpit.adminTitle',
    descriptionKey: 'shell.cockpit.adminDescription',
    priorities: ['inbox', 'projects', 'crm', 'requests'],
  },
  MANAGER: {
    titleKey: 'shell.cockpit.managerTitle',
    descriptionKey: 'shell.cockpit.managerDescription',
    priorities: ['projects', 'crm', 'requests', 'inbox'],
  },
  COMMERCIAL: {
    titleKey: 'shell.cockpit.commercialTitle',
    descriptionKey: 'shell.cockpit.commercialDescription',
    priorities: ['crm', 'projects', 'requests'],
  },
  RH: {
    titleKey: 'shell.cockpit.rhTitle',
    descriptionKey: 'shell.cockpit.rhDescription',
    priorities: ['team', 'training', 'requests', 'projects'],
  },
  COMPTABLE: {
    titleKey: 'shell.cockpit.comptableTitle',
    descriptionKey: 'shell.cockpit.comptableDescription',
    priorities: ['accounting', 'projects', 'inbox'],
  },
  VIEWER: {
    titleKey: 'shell.cockpit.viewerTitle',
    descriptionKey: 'shell.cockpit.viewerDescription',
    priorities: ['projects', 'accounting', 'requests', 'dev'],
  },
  STAGIAIRE: {
    titleKey: 'shell.cockpit.stagiaireTitle',
    descriptionKey: 'shell.cockpit.stagiaireDescription',
    priorities: ['projects', 'resources', 'requests', 'crm'],
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

export function getRoleCockpitNavigation(user: User | null): AdminNavigationItem[] {
  const cockpit = getRoleCockpit(user)
  const visible = getVisibleAdminNavigation(user)
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
    to: '/admin/demandes/equipe',
    permission: PERMISSIONS.CREATE_TICKETS,
    destination: 'tickets',
  },
  {
    id: 'send-message',
    labelKey: 'shell.paletteAction.sendMessage',
    to: '/admin/inbox/conversations',
    permission: PERMISSIONS.SEND_MESSAGES,
    destination: 'messages',
  },
]

export type AdminCommandPaletteItem =
  | { kind: 'module'; id: string; label: string; to: string; zone: AdminNavigationZone }
  | { kind: 'action'; id: string; label: string; to: string; zone: AdminNavigationZone }

export function getCommandPaletteItems(user: User | null): AdminCommandPaletteItem[] {
  const visible = getVisibleNavigation(user).filter((item) => item.id !== 'arrow')
  const modules = visible.map((item) => ({
    kind: 'module' as const,
    id: item.id,
    label: getNavigationLabel(item),
    to: item.id === 'home' ? '/admin/mon-espace' : (ADMIN_MODULE_PATHS[item.id] ?? item.screen),
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
