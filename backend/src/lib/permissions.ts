import type { UserRole, AdminRole, Permission } from '../types/enums.js'

export const ADMIN_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'VIEWER']

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
  ]),
  VIEWER: new Set([PERMISSIONS.VIEW_PROJECTS, PERMISSIONS.VIEW_CONTENT, PERMISSIONS.VIEW_BILLING]),
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
