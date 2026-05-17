import { describe, it, expect } from 'vitest'
import {
  isAdminRole,
  getPermissionsForRole,
  hasPermission,
  resolveUserPermissions,
  PERMISSIONS,
} from '../permissions'
import type { User, UserRole } from '../../types/auth.types'

const makeUser = (role: string, permissions?: string[]) =>
  ({
    _id: '1',
    name: 'Test',
    email: 'test@test.com',
    role: role as UserRole,
    permissions: permissions ?? [],
  }) as User

describe('isAdminRole', () => {
  it('returns true for SUPER_ADMIN', () => {
    expect(isAdminRole('SUPER_ADMIN')).toBe(true)
  })

  it('returns true for ADMIN', () => {
    expect(isAdminRole('ADMIN')).toBe(true)
  })

  it('returns true for VIEWER', () => {
    expect(isAdminRole('VIEWER')).toBe(true)
  })

  it('returns false for CLIENT', () => {
    expect(isAdminRole('CLIENT')).toBe(false)
  })

  it('returns false for an unknown role', () => {
    expect(isAdminRole('UNKNOWN')).toBe(false)
  })
})

describe('getPermissionsForRole', () => {
  it('returns all permissions for SUPER_ADMIN', () => {
    const perms = getPermissionsForRole('SUPER_ADMIN')
    const allPerms = Object.values(PERMISSIONS)
    for (const p of allPerms) {
      expect(perms).toContain(p)
    }
    expect(perms.length).toBe(allPerms.length)
  })

  it('returns only view_* permissions for VIEWER', () => {
    const perms = getPermissionsForRole('VIEWER')
    expect(perms).toContain('view_projects')
    expect(perms).toContain('view_content')
    expect(perms).toContain('view_billing')
    expect(perms).toContain('view_messaging')
    expect(perms).toContain('send_messages')
    expect(perms).not.toContain('manage_admins')
    expect(perms).not.toContain('edit_projects')
    expect(perms).not.toContain('manage_channels')
  })

  it('returns an empty array for CLIENT', () => {
    const perms = getPermissionsForRole('CLIENT')
    expect(perms).toEqual([])
  })

  it('returns an empty array for an unknown role', () => {
    const perms = getPermissionsForRole('UNKNOWN')
    expect(perms).toEqual([])
  })
})

describe('hasPermission', () => {
  it('returns true when SUPER_ADMIN has manage_admins', () => {
    const user = makeUser('SUPER_ADMIN')
    expect(hasPermission(user, PERMISSIONS.MANAGE_ADMINS)).toBe(true)
  })

  it('returns true when an internal user can send messages', () => {
    const user = makeUser('ADMIN')
    expect(hasPermission(user, PERMISSIONS.VIEW_MESSAGING)).toBe(true)
    expect(hasPermission(user, PERMISSIONS.SEND_MESSAGES)).toBe(true)
  })

  it('returns false when VIEWER does not have manage_admins', () => {
    const user = makeUser('VIEWER')
    expect(hasPermission(user, PERMISSIONS.MANAGE_ADMINS)).toBe(false)
  })

  it('returns false when user is null', () => {
    expect(hasPermission(null, PERMISSIONS.MANAGE_ADMINS)).toBe(false)
  })
})

describe('resolveUserPermissions', () => {
  it('returns role defaults merged with custom permissions (union)', () => {
    const user = makeUser('VIEWER', ['manage_admins', 'edit_projects'])
    const perms = resolveUserPermissions(user)
    // Should contain role defaults (VIEWER) + custom permissions
    expect(perms).toContain('view_projects')
    expect(perms).toContain('view_content')
    expect(perms).toContain('view_billing')
    expect(perms).toContain('manage_admins')
    expect(perms).toContain('edit_projects')
  })

  it('falls back to role defaults when permissions array is empty', () => {
    const user = makeUser('SUPER_ADMIN')
    const perms = resolveUserPermissions(user)
    const allPerms = Object.values(PERMISSIONS)
    for (const p of allPerms) {
      expect(perms).toContain(p)
    }
  })

  it('returns empty array for null user', () => {
    expect(resolveUserPermissions(null)).toEqual([])
  })
})
