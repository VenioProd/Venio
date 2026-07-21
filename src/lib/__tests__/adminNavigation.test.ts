import { describe, expect, it } from 'vitest'
import type { User, UserRole } from '../../types/auth.types'
import {
  ADMIN_NAVIGATION_ZONES,
  getCommandPaletteItems,
  getMobileNavigation,
  getRoleCockpitNavigation,
  getVisibleNavigationZones,
} from '../adminNavigation'

function user(role: UserRole): User {
  return {
    _id: `navigation-${role.toLowerCase()}`,
    name: role,
    email: `${role.toLowerCase()}@example.test`,
    role,
    permissions: [],
  }
}

describe('VENIO-99 — navigation et cockpit RBAC', () => {
  it('regroups every visible module into declared task-oriented zones', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'COMMERCIAL', 'RH', 'COMPTABLE', 'VIEWER', 'STAGIAIRE'] as UserRole[]) {
      const zones = getVisibleNavigationZones(user(role))
      expect(zones.length).toBeLessThanOrEqual(ADMIN_NAVIGATION_ZONES.length)
      expect(zones.every((zone) => ADMIN_NAVIGATION_ZONES.includes(zone.id))).toBe(true)
    }
  })

  it('keeps the administration zone exclusive to SUPER_ADMIN in the role matrix', () => {
    expect(getVisibleNavigationZones(user('SUPER_ADMIN')).some((zone) => zone.id === 'Administration')).toBe(true)
    for (const role of ['ADMIN', 'COMMERCIAL', 'RH', 'COMPTABLE', 'VIEWER', 'STAGIAIRE'] as UserRole[]) {
      expect(getVisibleNavigationZones(user(role)).some((zone) => zone.id === 'Administration')).toBe(false)
    }
  })

  it('filters cockpit shortcuts, palette modules and quick actions through the same permissions', () => {
    const comptablePalette = getCommandPaletteItems(user('COMPTABLE'))
    expect(comptablePalette.map((item) => item.id)).toContain('accounting')
    expect(comptablePalette.map((item) => item.id)).not.toEqual(
      expect.arrayContaining(['crm', 'create-lead', 'tickets']),
    )

    const viewerCockpit = getRoleCockpitNavigation(user('VIEWER')).map((item) => item.id)
    expect(viewerCockpit).toEqual(expect.arrayContaining(['projects', 'accounting', 'tickets', 'dev']))
  })

  it('derives mobile tabs from authorised navigation rather than fixed links', () => {
    const comptableTabs = getMobileNavigation(user('COMPTABLE')).map((item) => item.id)
    expect(comptableTabs).toContain('projects')
    expect(comptableTabs).not.toEqual(expect.arrayContaining(['crm', 'clients', 'tickets']))
  })
})
