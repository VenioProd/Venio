import type { User, UserRole } from '../types/auth.types'
import { hasPermission, PERMISSIONS } from './permissions'
import { getVisibleNavigation, NAVIGATION } from './rbac'

export const ADMIN_NAVIGATION_ZONES = [
  'Pilotage',
  'Relation & projets',
  'Conformité & finance',
  'Équipe & produit',
  'Console système',
] as const

export type AdminNavigationZone = (typeof ADMIN_NAVIGATION_ZONES)[number]
type NavigationItem = (typeof NAVIGATION)[number]
type NavigationId = NavigationItem['id']

/**
 * Task-oriented information architecture. Access remains exclusively defined
 * by rbac-matrix.json; this mapping only changes how authorised modules are
 * grouped and prioritised.
 */
const ZONE_BY_NAVIGATION_ID: Partial<Record<NavigationId, AdminNavigationZone>> = {
  home: 'Pilotage',
  dashboard: 'Pilotage',
  messages: 'Pilotage',
  reports: 'Pilotage',
  analytics: 'Pilotage',
  decisions: 'Pilotage',
  guide: 'Pilotage',
  clients: 'Relation & projets',
  crm: 'Relation & projets',
  projects: 'Relation & projets',
  calendar: 'Relation & projets',
  templates: 'Relation & projets',
  resources: 'Relation & projets',
  tickets: 'Relation & projets',
  'internal-projects': 'Relation & projets',
  accounting: 'Conformité & finance',
  qualiopi: 'Conformité & finance',
  audit: 'Conformité & finance',
  interns: 'Équipe & produit',
  emails: 'Équipe & produit',
  dev: 'Équipe & produit',
  education: 'Équipe & produit',
  subsidiaries: 'Équipe & produit',
  'tool-access': 'Console système',
  'admin-accounts': 'Console système',
  agents: 'Console système',
}

export interface NavigationZone {
  id: AdminNavigationZone
  items: NavigationItem[]
}

export function getNavigationZone(item: NavigationItem): AdminNavigationZone {
  // A future matrix entry remains visible only when RBAC allows it and lands
  // in the product zone until it receives an explicit task classification.
  return ZONE_BY_NAVIGATION_ID[item.id] ?? 'Équipe & produit'
}

export function getVisibleNavigationZones(user: User | null): NavigationZone[] {
  const itemsByZone = new Map<AdminNavigationZone, NavigationItem[]>()
  for (const zone of ADMIN_NAVIGATION_ZONES) itemsByZone.set(zone, [])

  for (const item of getVisibleNavigation(user)) {
    itemsByZone.get(getNavigationZone(item))?.push(item)
  }

  return ADMIN_NAVIGATION_ZONES.map((id) => ({ id, items: itemsByZone.get(id) || [] })).filter(
    (zone) => zone.items.length > 0,
  )
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
    priorities: ['dashboard', 'decisions', 'analytics', 'admin-accounts'],
  },
  ADMIN: {
    title: 'Coordination des opérations',
    description: 'Suivez les projets, les clients et les sujets à débloquer pour l’équipe.',
    priorities: ['projects', 'crm', 'tickets', 'messages'],
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
