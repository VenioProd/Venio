import type { Permission, User, UserRole } from '../types/auth.types'
import matrix from '../../rbac-matrix.json'

export const ADMIN_ROLES = matrix.roles.admin as readonly UserRole[]
export const PERMISSIONS = matrix.permissions as Record<string, Permission>

const ROLE_PERMISSIONS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(matrix.rolePermissions).map(([role, permissions]) => [role, new Set(permissions)]),
)

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
  if (user.role === 'SUPER_ADMIN') return Object.values(PERMISSIONS)
  const base = new Set(getPermissionsForRole(user.role))
  for (const p of user.grantedPermissions ?? []) base.add(p)
  for (const p of user.deniedPermissions ?? []) base.delete(p)
  return Array.from(base)
}

export function hasPermission(user: User | null, permission: string): boolean {
  const permissions = resolveUserPermissions(user)
  return permissions.includes(permission)
}
