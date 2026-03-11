import type { UserRole, AdminRole, Permission } from '../types/enums.js'

export const ADMIN_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER']

export const PERMISSIONS: Record<string, Permission> = {
  MANAGE_ADMINS: 'manage_admins',
  MANAGE_CLIENTS: 'manage_clients',
  VIEW_CRM: 'view_crm',
  MANAGE_CRM: 'manage_crm',
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
}

const ROLE_PERMISSIONS: Record<UserRole, Set<Permission>> = {
  SUPER_ADMIN: new Set(Object.values(PERMISSIONS)),
  ADMIN: new Set([
    PERMISSIONS.MANAGE_CLIENTS,
    PERMISSIONS.VIEW_CRM,
    PERMISSIONS.MANAGE_CRM,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.EDIT_PROJECTS,
    PERMISSIONS.VIEW_CONTENT,
    PERMISSIONS.EDIT_CONTENT,
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.MANAGE_BILLING,
    PERMISSIONS.MANAGE_TASKS,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.CREATE_TICKETS,
  ]),
  RH: new Set([
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_CONTENT,
    PERMISSIONS.VIEW_QUALIOPI,
    PERMISSIONS.MANAGE_QUALIOPI,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.CREATE_TICKETS,
  ]),
  VIEWER: new Set([
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_CONTENT,
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.CREATE_TICKETS,
  ]),
  CLIENT: new Set<Permission>(),
}

export function isAdminRole(role: UserRole): role is AdminRole {
  return (ADMIN_ROLES as string[]).includes(role)
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
  if (Array.isArray(customPermissions)) return customPermissions as Permission[]
  return getPermissionsForRole(role)
}

export function hasPermissionResolved(role: UserRole, permission: Permission, customPermissions: string[] | null): boolean {
  if (role === 'SUPER_ADMIN') return true
  const perms = resolvePermissions(role, customPermissions)
  return perms.includes(permission)
}
