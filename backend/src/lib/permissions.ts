import type { UserRole, AdminRole, Permission } from '../types/enums.js'

export const ADMIN_ROLES: AdminRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'RH',
  'COMMERCIAL',
  'COMPTABLE',
  'VIEWER',
  'STAGIAIRE',
]

export const PERMISSIONS: Record<string, Permission> = {
  MANAGE_ADMINS: 'manage_admins',
  MANAGE_CLIENTS: 'manage_clients',
  VIEW_CRM: 'view_crm',
  MANAGE_CRM: 'manage_crm',
  VIEW_MESSAGING: 'view_messaging',
  SEND_MESSAGES: 'send_messages',
  MANAGE_CHANNELS: 'manage_channels',
  VIEW_PROJECTS: 'view_projects',
  EDIT_PROJECTS: 'edit_projects',
  VIEW_CONTENT: 'view_content',
  EDIT_CONTENT: 'edit_content',
  VIEW_PHASES: 'view_phases',
  MANAGE_PHASES: 'manage_phases',
  VIEW_BILLING: 'view_billing',
  MANAGE_BILLING: 'manage_billing',
  MANAGE_TASKS: 'manage_tasks',
  VIEW_QUALIOPI: 'view_qualiopi',
  MANAGE_QUALIOPI: 'manage_qualiopi',
  VIEW_TICKETS: 'view_tickets',
  CREATE_TICKETS: 'create_tickets',
  MANAGE_TICKETS: 'manage_tickets',
  // ── Demandes de changement client ──
  VIEW_CHANGE_REQUESTS: 'view_change_requests',
  MANAGE_CHANGE_REQUESTS: 'manage_change_requests',
  // ── Comptabilité ──
  VIEW_ACCOUNTING: 'view_accounting',
  MANAGE_ACCOUNTING: 'manage_accounting',
  LOCK_ACCOUNTING: 'lock_accounting',
  VIEW_VAT: 'view_vat',
  MANAGE_VAT: 'manage_vat',
  EXPORT_FEC: 'export_fec',
  MANAGE_EXTERNAL_SOURCES: 'manage_external_sources',
  // ── Dev workspace ──
  VIEW_DEV: 'view_dev',
  MANAGE_DEV: 'manage_dev',
  // ── Espace beta tests ──
  VIEW_BETA: 'view_beta',
  MANAGE_BETA: 'manage_beta',
  // ── Education (workspace pédagogique type Notion) ──
  VIEW_EDUCATION: 'view_education',
  MANAGE_EDUCATION: 'manage_education',
  // ── Webhooks sortants ──
  VIEW_WEBHOOKS: 'view_webhooks',
  MANAGE_WEBHOOKS: 'manage_webhooks',
}

const ROLE_PERMISSIONS: Record<UserRole, Set<Permission>> = {
  SUPER_ADMIN: new Set(Object.values(PERMISSIONS)),
  ADMIN: new Set([
    PERMISSIONS.MANAGE_CLIENTS,
    PERMISSIONS.VIEW_CRM,
    PERMISSIONS.MANAGE_CRM,
    PERMISSIONS.VIEW_MESSAGING,
    PERMISSIONS.SEND_MESSAGES,
    PERMISSIONS.MANAGE_CHANNELS,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.EDIT_PROJECTS,
    PERMISSIONS.VIEW_CONTENT,
    PERMISSIONS.VIEW_PHASES,
    PERMISSIONS.EDIT_CONTENT,
    PERMISSIONS.MANAGE_PHASES,
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.MANAGE_BILLING,
    PERMISSIONS.MANAGE_TASKS,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.CREATE_TICKETS,
    PERMISSIONS.VIEW_CHANGE_REQUESTS,
    PERMISSIONS.MANAGE_CHANGE_REQUESTS,
    PERMISSIONS.VIEW_ACCOUNTING,
    PERMISSIONS.MANAGE_ACCOUNTING,
    PERMISSIONS.VIEW_VAT,
    PERMISSIONS.MANAGE_VAT,
    PERMISSIONS.EXPORT_FEC,
    PERMISSIONS.VIEW_DEV,
    PERMISSIONS.MANAGE_DEV,
    PERMISSIONS.VIEW_BETA,
    PERMISSIONS.MANAGE_BETA,
  ]),
  // MANAGER = ADMIN sans manage_admins, lock_accounting, export_fec, manage_external_sources
  MANAGER: new Set([
    PERMISSIONS.MANAGE_CLIENTS,
    PERMISSIONS.VIEW_CRM,
    PERMISSIONS.MANAGE_CRM,
    PERMISSIONS.VIEW_MESSAGING,
    PERMISSIONS.SEND_MESSAGES,
    PERMISSIONS.MANAGE_CHANNELS,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.EDIT_PROJECTS,
    PERMISSIONS.VIEW_CONTENT,
    PERMISSIONS.VIEW_PHASES,
    PERMISSIONS.EDIT_CONTENT,
    PERMISSIONS.MANAGE_PHASES,
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.MANAGE_BILLING,
    PERMISSIONS.MANAGE_TASKS,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.CREATE_TICKETS,
    PERMISSIONS.VIEW_CHANGE_REQUESTS,
    PERMISSIONS.MANAGE_CHANGE_REQUESTS,
    PERMISSIONS.VIEW_ACCOUNTING,
    PERMISSIONS.MANAGE_ACCOUNTING,
    PERMISSIONS.VIEW_VAT,
    PERMISSIONS.MANAGE_VAT,
    PERMISSIONS.VIEW_DEV,
    PERMISSIONS.MANAGE_DEV,
    PERMISSIONS.VIEW_BETA,
    PERMISSIONS.MANAGE_BETA,
  ]),
  COMPTABLE: new Set([
    PERMISSIONS.VIEW_ACCOUNTING,
    PERMISSIONS.MANAGE_ACCOUNTING,
    PERMISSIONS.LOCK_ACCOUNTING,
    PERMISSIONS.VIEW_VAT,
    PERMISSIONS.MANAGE_VAT,
    PERMISSIONS.EXPORT_FEC,
    PERMISSIONS.MANAGE_EXTERNAL_SOURCES,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.VIEW_MESSAGING,
    PERMISSIONS.SEND_MESSAGES,
  ]),
  RH: new Set([
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_CONTENT,
    PERMISSIONS.VIEW_PHASES,
    PERMISSIONS.VIEW_MESSAGING,
    PERMISSIONS.SEND_MESSAGES,
    PERMISSIONS.VIEW_QUALIOPI,
    PERMISSIONS.MANAGE_QUALIOPI,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.CREATE_TICKETS,
  ]),
  VIEWER: new Set([
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_CONTENT,
    PERMISSIONS.VIEW_PHASES,
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.VIEW_MESSAGING,
    PERMISSIONS.SEND_MESSAGES,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.CREATE_TICKETS,
    PERMISSIONS.VIEW_CHANGE_REQUESTS,
    PERMISSIONS.VIEW_ACCOUNTING,
    PERMISSIONS.VIEW_VAT,
    PERMISSIONS.VIEW_DEV,
    PERMISSIONS.VIEW_BETA,
  ]),
  COMMERCIAL: new Set([
    PERMISSIONS.VIEW_CRM,
    PERMISSIONS.MANAGE_CRM,
    PERMISSIONS.MANAGE_CLIENTS,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_CONTENT,
    PERMISSIONS.VIEW_PHASES,
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.MANAGE_TASKS,
    PERMISSIONS.VIEW_MESSAGING,
    PERMISSIONS.SEND_MESSAGES,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.CREATE_TICKETS,
    PERMISSIONS.VIEW_CHANGE_REQUESTS,
  ]),
  STAGIAIRE: new Set([
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.MANAGE_TASKS,
    PERMISSIONS.VIEW_CONTENT,
    PERMISSIONS.VIEW_PHASES,
    PERMISSIONS.VIEW_CRM,
    PERMISSIONS.MANAGE_CRM,
    PERMISSIONS.VIEW_MESSAGING,
    PERMISSIONS.SEND_MESSAGES,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.CREATE_TICKETS,
  ]),
  CLIENT: new Set<Permission>(),
  // Agents (API Bearer tokens) n'héritent d'aucune permission par rôle ;
  // leurs accès sont contrôlés par les scopes de l'AgentToken.
  AGENT: new Set<Permission>(),
}

export function isAdminRole(role: UserRole): role is AdminRole {
  return (ADMIN_ROLES as string[]).includes(role)
}

/**
 * Un user "interne" est soit un admin humain (SUPER_ADMIN, ADMIN, RH, VIEWER),
 * soit un agent système (AGENT). Utilisé par la messagerie interne pour
 * autoriser à la fois les humains internes et les agents externes à
 * envoyer/lire des messages. N'octroie AUCUNE permission admin par lui-même.
 */
export function isInternalRole(role: UserRole): boolean {
  return isAdminRole(role) || role === 'AGENT'
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const rolePermissions = ROLE_PERMISSIONS[role]
  if (!rolePermissions) return false
  return rolePermissions.has(permission)
}

export function getPermissionsForRole(role: UserRole): Permission[] {
  const rolePermissions = ROLE_PERMISSIONS[role]
  if (!rolePermissions) return []
  return Array.from(rolePermissions)
}

export function resolvePermissions(
  role: UserRole,
  grantedPermissions: string[],
  deniedPermissions: string[],
): Permission[] {
  if (role === 'SUPER_ADMIN') return Object.values(PERMISSIONS) as Permission[]
  // An API agent is authorized exclusively by its PAT scopes, never by the
  // human-admin RBAC matrix nor by ad-hoc permission grants.
  if (role === 'AGENT') return []
  const base = new Set(getPermissionsForRole(role))
  for (const p of grantedPermissions) base.add(p as Permission)
  for (const p of deniedPermissions) base.delete(p as Permission)
  return Array.from(base)
}

export function hasPermissionResolved(
  role: UserRole,
  permission: Permission,
  grantedPermissions: string[],
  deniedPermissions: string[],
): boolean {
  if (role === 'SUPER_ADMIN') return true
  const perms = resolvePermissions(role, grantedPermissions, deniedPermissions)
  return perms.includes(permission)
}
