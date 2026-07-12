import matrix from '../../rbac-matrix.json'
import type { User } from '../types/auth.types'
import { hasPermission } from './permissions'

export const RBAC_MATRIX = matrix
export const NAVIGATION = matrix.navigation

/**
 * The sidebar and permission tests consume the same navigation policy. A
 * permission and an explicit role are alternatives only when both are set.
 */
export function isNavigationItemVisible(item: (typeof NAVIGATION)[number], user: User | null): boolean {
  const permissionAllowed = !item.permission || hasPermission(user, item.permission)
  const roleAllowed = item.roles.length === 0 || (user ? (item.roles as readonly string[]).includes(user.role) : false)
  return item.permission && item.roles.length > 0 ? permissionAllowed || roleAllowed : permissionAllowed && roleAllowed
}

export function getVisibleNavigation(user: User | null) {
  return NAVIGATION.filter((item) => isNavigationItemVisible(item, user))
}
