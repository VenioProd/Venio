import type { User, UserRole } from '../types/auth.types'
import { hasPermission, PERMISSIONS } from './permissions'
import { getVisibleNavigation, NAVIGATION } from './rbac'

export const ADMIN_NAVIGATION_ZONES = [
  'Pilotage',
  'Clients & projets',
  'Contenu & outils',
  'Finance & conformité',
  'Équipe',
  'Analyse & rapports',
  'Administration',
] as const

export type AdminNavigationZone = (typeof ADMIN_NAVIGATION_ZONES)[number]
type NavigationItem = (typeof NAVIGATION)[number]
type NavigationId = NavigationItem['id']

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
  clients: 'Clients & projets',
  arrow: 'Clients & projets',
  projects: 'Clients & projets',
  tickets: 'Clients & projets',
  calendar: 'Clients & projets',
  templates: 'Contenu & outils',
  resources: 'Contenu & outils',
  education: 'Contenu & outils',
  'internal-projects': 'Contenu & outils',
  dev: 'Contenu & outils',
  accounting: 'Finance & conformité',
  qualiopi: 'Finance & conformité',
  audit: 'Finance & conformité',
  interns: 'Équipe',
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

const ROLE_COCKPITS: Record<Exclude<UserRole, 'CLIENT'>, RoleCockpit> = {
  SUPER_ADMIN: {
    title: 'Arbitrages et santé de l’organisation',
    description: 'Décidez des priorités, surveillez les signaux transverses et accédez à la console système.',
    priorities: ['activity-center', 'dashboard', 'decisions', 'analytics', 'health'],
  },
  ADMIN: {
    title: 'Coordination des opérations',
    description: 'Suivez les projets, les clients et les sujets à débloquer pour l’équipe.',
    priorities: ['activity-center', 'projects', 'crm', 'tickets'],
  },
  MANAGER: {
    title: 'Pilotage des projets et de la charge',
    description: 'Concentrez-vous sur les projets actifs, les relances et le travail de l’équipe.',
    priorities: ['projects', 'crm', 'tickets', 'messages'],
  },
  COMMERCIAL: {
    title: 'Suivi commercial',
    description: 'Traitez le pipeline, les comptes clients et les prochaines relances.',
    priorities: ['crm', 'clients', 'projects', 'tickets'],
  },
  RH: {
    title: 'Suivi équipe et conformité',
    description: 'Priorisez l’équipe, Qualiopi et les demandes qui nécessitent un suivi.',
    priorities: ['interns', 'qualiopi', 'tickets', 'projects'],
  },
  COMPTABLE: {
    title: 'Clôture et conformité financière',
    description: 'Accédez aux écritures, à la TVA et aux éléments nécessaires à la clôture.',
    priorities: ['accounting', 'projects', 'messages'],
  },
  VIEWER: {
    title: 'Lecture et suivi',
    description: 'Consultez les projets, les chiffres et les sujets à signaler.',
    priorities: ['projects', 'accounting', 'tickets', 'dev'],
  },
  STAGIAIRE: {
    title: 'Travail à réaliser',
    description: 'Retrouvez les projets, ressources et demandes sur lesquelles avancer.',
    priorities: ['projects', 'resources', 'tickets', 'crm'],
  },
}

const DEFAULT_COCKPIT: RoleCockpit = {
  title: 'Mon espace de travail',
  description: 'Accédez aux modules autorisés pour votre rôle.',
  priorities: ['home'],
}

export function getRoleCockpit(user: User | null): RoleCockpit {
  if (!user || user.role === 'CLIENT') return DEFAULT_COCKPIT
  return ROLE_COCKPITS[user.role] || DEFAULT_COCKPIT
}

export function getRoleCockpitNavigation(user: User | null): NavigationItem[] {
  const cockpit = getRoleCockpit(user)
  const visible = getVisibleNavigation(user)
  return cockpit.priorities.flatMap((id) => visible.filter((item) => item.id === id))
}

type PaletteActionDefinition = {
  id: string
  label: string
  to: string
  permission: string
  destination: NavigationId
}

const PALETTE_ACTIONS: PaletteActionDefinition[] = [
  {
    id: 'create-project',
    label: 'Créer un projet',
    to: '/admin/projets/nouveau',
    permission: PERMISSIONS.EDIT_PROJECTS,
    destination: 'projects',
  },
  {
    id: 'create-lead',
    label: 'Créer ou qualifier un lead',
    to: '/admin/crm',
    permission: PERMISSIONS.MANAGE_CRM,
    destination: 'crm',
  },
  {
    id: 'create-ticket',
    label: 'Créer un ticket',
    to: '/admin/tickets',
    permission: PERMISSIONS.CREATE_TICKETS,
    destination: 'tickets',
  },
  {
    id: 'send-message',
    label: 'Envoyer un message',
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
    label: item.label,
    to: item.screen,
    zone: getNavigationZone(item),
  }))
  const visibleIds = new Set(visible.map((item) => item.id))
  const actions = PALETTE_ACTIONS.filter(
    (action) => visibleIds.has(action.destination) && hasPermission(user, action.permission),
  ).map((action) => ({
    kind: 'action' as const,
    id: action.id,
    label: action.label,
    to: action.to,
    zone: getNavigationZone(visible.find((item) => item.id === action.destination)!),
  }))

  return [...actions, ...modules]
}
