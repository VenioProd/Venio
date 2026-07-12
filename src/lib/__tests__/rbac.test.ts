import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getVisibleNavigation, isNavigationItemVisible, NAVIGATION, RBAC_MATRIX } from '../rbac'
import type { User, UserRole } from '../../types/auth.types'

function user(role: UserRole): User {
  return {
    _id: 'user-1',
    name: 'Test',
    email: 'test@example.test',
    role,
    permissions: [],
  }
}

describe('RBAC matrix / frontend navigation and screens', () => {
  it('keeps each navigation access rule within the canonical roles and permissions', () => {
    const permissions = new Set(Object.values(RBAC_MATRIX.permissions))
    const roles = new Set(RBAC_MATRIX.roles.admin)
    const screens = new Set<string>()

    for (const item of NAVIGATION) {
      expect(screens.has(item.screen)).toBe(false)
      screens.add(item.screen)
      if (item.permission) expect(permissions.has(item.permission)).toBe(true)
      for (const role of item.roles) expect(roles.has(role)).toBe(true)
    }
  })

  it('generates role-appropriate navigation from the matrix', () => {
    const viewerItems = getVisibleNavigation(user('VIEWER')).map((item) => item.id)
    expect(viewerItems).toEqual(expect.arrayContaining(['projects', 'accounting', 'tickets', 'dev']))
    expect(viewerItems).not.toEqual(expect.arrayContaining(['clients', 'crm', 'admin-accounts']))

    const rhItems = getVisibleNavigation(user('RH')).map((item) => item.id)
    expect(rhItems).toEqual(expect.arrayContaining(['interns', 'emails', 'qualiopi']))
    expect(rhItems).not.toContain('education')
  })

  it('honours the explicit role-or-permission rule without granting access anonymously', () => {
    const interns = NAVIGATION.find((item) => item.id === 'interns')!
    expect(isNavigationItemVisible(interns, user('RH'))).toBe(true)
    expect(isNavigationItemVisible(interns, user('ADMIN'))).toBe(false)
    expect(isNavigationItemVisible(interns, null)).toBe(false)
  })

  it('references existing admin route screens', () => {
    const appSource = readFileSync(resolve(import.meta.dirname, '../../App.tsx'), 'utf8')
    for (const item of NAVIGATION) {
      if (item.screen === '/admin') continue
      const routePath = item.screen.replace('/admin/', '')
      expect(appSource).toContain(`path="${routePath}"`)
    }
  })
})
