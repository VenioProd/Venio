import type { UserRole, AdminRole, Permission } from '../types/enums.js'

export const ADMIN_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER']

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
  VIEW_BILLING: 'view_billing',
  MANAGE_BILLING: 'manage_billing',
  MANAGE_TASKS: 'manage_tasks',
  VIEW_QUALIOPI: 'view_qualiopi',
  MANAGE_QUALIOPI: 'manage_qualiopi',
  VIEW_TICKETS: 'view_tickets',
  CREATE_TICKETS: 'create_tickets',
  MANAGE_TICKETS: 'manage_tickets',
  // ── Comptabilité ──
  VIEW_ACCOUNTING: 'view_accounting',
  MANAGE_ACCOUNTING: 'manage_accounting',
  LOCK_ACCOUNTING: 'lock_accounting',
  VIEW_VAT: 'view_vat',
  MANAGE_VAT: 'manage_vat',
  EXPORT_FEC: 'export_fec',
  MANAGE_EXTERNAL_SOURCES: 'manage_external_sources',
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
    PERMISSIONS.EDIT_CONTENT,
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.MANAGE_BILLING,
    PERMISSIONS.MANAGE_TASKS,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.CREATE_TICKETS,
    PERMISSIONS.VIEW_ACCOUNTING,
    PERMISSIONS.MANAGE_ACCOUNTING,
    PERMISSIONS.VIEW_VAT,
    PERMISSIONS.MANAGE_VAT,
    PERMISSIONS.EXPORT_FEC,
  ]),
  RH: new Set([
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_CONTENT,
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
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.VIEW_MESSAGING,
    PERMISSIONS.SEND_MESSAGES,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.CREATE_TICKETS,
    PERMISSIONS.VIEW_ACCOUNTING,
    PERMISSIONS.VIEW_VAT,
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

export function resolvePermissions(role: UserRole, customPermissions: string[] | null): Permission[] {
  const rolePerms = getPermissionsForRole(role)
  if (!Array.isArray(customPermissions) || customPermissions.length === 0) return rolePerms
  // Merge: role defaults + custom (no duplicates)
  const merged = new Set<string>([...rolePerms, ...customPermissions])
  return Array.from(merged) as Permission[]
}

export function hasPermissionResolved(role: UserRole, permission: Permission, customPermissions: string[] | null): boolean {
  if (role === 'SUPER_ADMIN') return true
  const perms = resolvePermissions(role, customPermissions)
  return perms.includes(permission)
}
