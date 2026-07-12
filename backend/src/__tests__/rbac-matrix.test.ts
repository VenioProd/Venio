import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AGENT_SCOPES, hasAllScopes } from '../lib/agent/scopes.js'
import {
  ADMIN_ROLES,
  getPermissionsForRole,
  hasPermissionResolved,
  PERMISSIONS,
  resolvePermissions,
} from '../lib/permissions.js'
import type { UserRole } from '../types/enums.js'

type Matrix = {
  roles: { admin: string[]; all: string[] }
  permissions: Record<string, string>
  rolePermissions: Record<string, string[]>
  navigation: Array<{ screen: string; permission: string | null; roles: string[] }>
  apiActions: Array<{ id: string; permission: string; scope: string; source: string; agentSource: string }>
}

const root = resolve(import.meta.dirname, '../../..')
const matrix = JSON.parse(readFileSync(resolve(root, 'rbac-matrix.json'), 'utf8')) as Matrix

describe('RBAC matrix / API enforcement', () => {
  it('is the authoritative role and permission policy for the API', () => {
    expect(ADMIN_ROLES).toEqual(matrix.roles.admin)
    expect(PERMISSIONS).toEqual(matrix.permissions)

    for (const role of matrix.roles.all) {
      expect(new Set(getPermissionsForRole(role as UserRole))).toEqual(new Set(matrix.rolePermissions[role]))
    }
  })

  it('keeps API agents out of human RBAC, even if an ad-hoc grant exists', () => {
    expect(resolvePermissions('AGENT', ['manage_admins'], [])).toEqual([])
    expect(hasPermissionResolved('AGENT', PERMISSIONS.MANAGE_ADMINS, ['manage_admins'], [])).toBe(false)
  })

  it('maps every documented API action to an enforced permission and valid agent scope', () => {
    for (const action of matrix.apiActions) {
      const permissionKey = Object.entries(matrix.permissions).find(([, value]) => value === action.permission)?.[0]
      expect(permissionKey, `${action.id} must use a canonical permission`).toBeDefined()
      expect(AGENT_SCOPES).toContain(action.scope)

      const adminSource = readFileSync(resolve(root, action.source), 'utf8')
      const agentSource = readFileSync(resolve(root, action.agentSource), 'utf8')
      expect(adminSource).toContain(`PERMISSIONS.${permissionKey}`)
      expect(agentSource).toContain(`requireScope('${action.scope}')`)
      expect(hasAllScopes([action.scope], [action.scope])).toBe(true)
      expect(hasAllScopes([], [action.scope])).toBe(false)
    }
  })
})
