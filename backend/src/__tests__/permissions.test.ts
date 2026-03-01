import { describe, it, expect } from 'vitest'
import {
  PERMISSIONS,
  ADMIN_ROLES,
  isAdminRole,
  hasPermission,
  getPermissionsForRole,
} from '../lib/permissions.js'

describe('permissions module', () => {
  describe('PERMISSIONS constant', () => {
    it('should have all expected permission keys', () => {
      const expectedKeys = [
        'MANAGE_ADMINS',
        'MANAGE_CLIENTS',
        'VIEW_CRM',
        'MANAGE_CRM',
        'VIEW_PROJECTS',
        'EDIT_PROJECTS',
        'VIEW_CONTENT',
        'EDIT_CONTENT',
        'VIEW_BILLING',
        'MANAGE_BILLING',
        'MANAGE_TASKS',
      ]
      expect(Object.keys(PERMISSIONS)).toEqual(expectedKeys)
    })

    it('should have string values for every permission', () => {
      for (const value of Object.values(PERMISSIONS)) {
        expect(typeof value).toBe('string')
      }
    })

    it('should have unique values', () => {
      const values = Object.values(PERMISSIONS)
      expect(new Set(values).size).toBe(values.length)
    })
  })

  describe('ADMIN_ROLES constant', () => {
    it('should include SUPER_ADMIN, ADMIN, and VIEWER', () => {
      expect(ADMIN_ROLES).toEqual(['SUPER_ADMIN', 'ADMIN', 'VIEWER'])
    })
  })

  describe('ROLE_PERMISSIONS', () => {
    it('SUPER_ADMIN should have all permissions', () => {
      const allPermissions = Object.values(PERMISSIONS)
      for (const perm of allPermissions) {
        expect(hasPermission('SUPER_ADMIN', perm)).toBe(true)
      }
    })

    it('ADMIN should have most permissions but not MANAGE_ADMINS', () => {
      expect(hasPermission('ADMIN', PERMISSIONS.MANAGE_ADMINS)).toBe(false)
      expect(hasPermission('ADMIN', PERMISSIONS.MANAGE_CLIENTS)).toBe(true)
      expect(hasPermission('ADMIN', PERMISSIONS.VIEW_CRM)).toBe(true)
      expect(hasPermission('ADMIN', PERMISSIONS.MANAGE_CRM)).toBe(true)
      expect(hasPermission('ADMIN', PERMISSIONS.VIEW_PROJECTS)).toBe(true)
      expect(hasPermission('ADMIN', PERMISSIONS.EDIT_PROJECTS)).toBe(true)
      expect(hasPermission('ADMIN', PERMISSIONS.VIEW_CONTENT)).toBe(true)
      expect(hasPermission('ADMIN', PERMISSIONS.EDIT_CONTENT)).toBe(true)
      expect(hasPermission('ADMIN', PERMISSIONS.VIEW_BILLING)).toBe(true)
      expect(hasPermission('ADMIN', PERMISSIONS.MANAGE_BILLING)).toBe(true)
      expect(hasPermission('ADMIN', PERMISSIONS.MANAGE_TASKS)).toBe(true)
    })

    it('VIEWER should only have view_* permissions', () => {
      expect(hasPermission('VIEWER', PERMISSIONS.VIEW_PROJECTS)).toBe(true)
      expect(hasPermission('VIEWER', PERMISSIONS.VIEW_CONTENT)).toBe(true)
      expect(hasPermission('VIEWER', PERMISSIONS.VIEW_BILLING)).toBe(true)

      // VIEWER should NOT have any manage/edit permissions
      expect(hasPermission('VIEWER', PERMISSIONS.MANAGE_ADMINS)).toBe(false)
      expect(hasPermission('VIEWER', PERMISSIONS.MANAGE_CLIENTS)).toBe(false)
      expect(hasPermission('VIEWER', PERMISSIONS.MANAGE_CRM)).toBe(false)
      expect(hasPermission('VIEWER', PERMISSIONS.EDIT_PROJECTS)).toBe(false)
      expect(hasPermission('VIEWER', PERMISSIONS.EDIT_CONTENT)).toBe(false)
      expect(hasPermission('VIEWER', PERMISSIONS.MANAGE_BILLING)).toBe(false)
      expect(hasPermission('VIEWER', PERMISSIONS.MANAGE_TASKS)).toBe(false)
    })

    it('VIEWER should not have VIEW_CRM', () => {
      expect(hasPermission('VIEWER', PERMISSIONS.VIEW_CRM)).toBe(false)
    })

    it('CLIENT should have no permissions', () => {
      for (const perm of Object.values(PERMISSIONS)) {
        expect(hasPermission('CLIENT', perm)).toBe(false)
      }
    })
  })

  describe('isAdminRole()', () => {
    it('should return true for SUPER_ADMIN', () => {
      expect(isAdminRole('SUPER_ADMIN')).toBe(true)
    })

    it('should return true for ADMIN', () => {
      expect(isAdminRole('ADMIN')).toBe(true)
    })

    it('should return true for VIEWER', () => {
      expect(isAdminRole('VIEWER')).toBe(true)
    })

    it('should return false for CLIENT', () => {
      expect(isAdminRole('CLIENT')).toBe(false)
    })

    it('should return false for unknown roles', () => {
      expect(isAdminRole('UNKNOWN' as any)).toBe(false)
      expect(isAdminRole('' as any)).toBe(false)
    })
  })

  describe('hasPermission()', () => {
    it('should return true when role has the permission', () => {
      expect(hasPermission('SUPER_ADMIN', PERMISSIONS.MANAGE_ADMINS)).toBe(true)
    })

    it('should return false when role lacks the permission', () => {
      expect(hasPermission('ADMIN', PERMISSIONS.MANAGE_ADMINS)).toBe(false)
    })

    it('should return false for an unknown role', () => {
      expect(hasPermission('UNKNOWN_ROLE' as any, PERMISSIONS.MANAGE_ADMINS)).toBe(false)
    })

    it('should return false for an unknown permission on a valid role', () => {
      expect(hasPermission('SUPER_ADMIN', 'nonexistent_permission' as any)).toBe(false)
    })
  })

  describe('getPermissionsForRole()', () => {
    it('should return all permissions for SUPER_ADMIN', () => {
      const perms = getPermissionsForRole('SUPER_ADMIN')
      expect(perms).toEqual(expect.arrayContaining(Object.values(PERMISSIONS)))
      expect(perms.length).toBe(Object.values(PERMISSIONS).length)
    })

    it('should return an array for ADMIN', () => {
      const perms = getPermissionsForRole('ADMIN')
      expect(Array.isArray(perms)).toBe(true)
      expect(perms.length).toBe(10) // all except MANAGE_ADMINS
      expect(perms).not.toContain(PERMISSIONS.MANAGE_ADMINS)
    })

    it('should return 3 permissions for VIEWER', () => {
      const perms = getPermissionsForRole('VIEWER')
      expect(perms.length).toBe(3)
      expect(perms).toContain(PERMISSIONS.VIEW_PROJECTS)
      expect(perms).toContain(PERMISSIONS.VIEW_CONTENT)
      expect(perms).toContain(PERMISSIONS.VIEW_BILLING)
    })

    it('should return an empty array for CLIENT', () => {
      const perms = getPermissionsForRole('CLIENT')
      expect(perms).toEqual([])
    })

    it('should return an empty array for an unknown role', () => {
      const perms = getPermissionsForRole('NONEXISTENT' as any)
      expect(perms).toEqual([])
    })
  })
})
