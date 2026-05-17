import type { Permission, User, UserRole } from '../types/auth.types'

export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER'] as const

export const PERMISSIONS = {
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
  VIEW_ACCOUNTING: 'view_accounting',
  MANAGE_ACCOUNTING: 'manage_accounting',
  LOCK_ACCOUNTING: 'lock_accounting',
  VIEW_VAT: 'view_vat',
  MANAGE_VAT: 'manage_vat',
  EXPORT_FEC: 'export_fec',
  MANAGE_EXTERNAL_SOURCES: 'manage_external_sources',
  MANAGE_TASKS: 'manage_tasks',
  VIEW_QUALIOPI: 'view_qualiopi',
  MANAGE_QUALIOPI: 'manage_qualiopi',
  VIEW_TICKETS: 'view_tickets',
  CREATE_TICKETS: 'create_tickets',
  MANAGE_TICKETS: 'manage_tickets',
} as const

const ROLE_PERMISSIONS: Record<string, Set<string>> = {
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
    PERMISSIONS.VIEW_ACCOUNTING,
    PERMISSIONS.MANAGE_ACCOUNTING,
    PERMISSIONS.VIEW_VAT,
    PERMISSIONS.MANAGE_VAT,
    PERMISSIONS.EXPORT_FEC,
    PERMISSIONS.MANAGE_TASKS,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.CREATE_TICKETS,
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
    PERMISSIONS.VIEW_ACCOUNTING,
    PERMISSIONS.VIEW_VAT,
    PERMISSIONS.VIEW_MESSAGING,
    PERMISSIONS.SEND_MESSAGES,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.CREATE_TICKETS,
  ]),
  CLIENT: new Set([]),
}

export function isAdminRole(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role)
}

export function getPermissionsForRole(role: string): string[] {
  const rolePermissions = ROLE_PERMISSIONS[role]
  if (!rolePermissions) return []
  return Array.from(rolePermissions)
}

export function resolveUserPermissions(user: User | null): string[] {
  if (!user) return []
  const rolePerms = getPermissionsForRole(user.role)
  if (!Array.isArray(user.permissions) || user.permissions.length === 0) {
    return rolePerms
  }
  // Merge: role defaults + custom (no duplicates)
  const merged = new Set<string>([...rolePerms, ...user.permissions])
  return Array.from(merged)
}

export function hasPermission(user: User | null, permission: string): boolean {
  const permissions = resolveUserPermissions(user)
  return permissions.includes(permission)
}
