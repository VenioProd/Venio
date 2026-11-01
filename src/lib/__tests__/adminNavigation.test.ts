import { describe, expect, it } from 'vitest'
import type { User, UserRole } from '../../types/auth.types'
import {
  ADMIN_NAVIGATION_ZONES,
  ADMIN_NAVIGATION_GROUPS,
  getVisibleAdminNavigation,
  isAdminNavigationActive,
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

  it('groups the 31 sidebar modules into exactly 13 entries and four zones', () => {
    const zones = getVisibleNavigationZones(user('SUPER_ADMIN'))
    expect(zones.map((zone) => zone.id)).toEqual(['Pilotage', 'Commercial', 'Production', 'Organisation'])
    const entries = zones.flatMap((zone) => zone.items)
    expect(entries.map((item) => item.id)).toEqual(ADMIN_NAVIGATION_GROUPS.map((group) => group.id))
    expect(entries).toHaveLength(13)
    expect(ADMIN_NAVIGATION_GROUPS.flatMap((group) => [...group.modules])).toHaveLength(31)
    expect(entries.find((item) => item.id === 'home')?.screen).toBe('/admin/mon-espace')
    expect(entries.map((item) => item.id)).not.toEqual(expect.arrayContaining(['arrow', 'subsidiaries', 'guide']))
  })

  it('shows merged entries when any original module is accessible and chooses the first accessible route', () => {
    const rhEntries = getVisibleAdminNavigation(user('RH'))
    expect(rhEntries.find((item) => item.id === 'requests')?.screen).toBe('/admin/demandes/equipe')
    const comptable = user('COMPTABLE')
    expect(getVisibleAdminNavigation(comptable).some((item) => item.id === 'requests')).toBe(false)
    expect(
      getVisibleAdminNavigation({ ...comptable, grantedPermissions: ['view_change_requests'] }).find(
        (item) => item.id === 'requests',
      )?.screen,
    ).toBe('/admin/demandes/clients')
    expect(
      getVisibleAdminNavigation({ ...comptable, grantedPermissions: ['manage_external_sales'] }).find(
        (item) => item.id === 'crm',
      )?.screen,
    ).toBe('/admin/crm/partenaires')
    expect(
      getVisibleAdminNavigation({
        ...comptable,
        grantedPermissions: ['view_beta'],
        deniedPermissions: ['submit_dev_suggestion'],
      }).find((item) => item.id === 'dev')
        ?.screen,
    ).toBe('/admin/dev/recette')
    expect(
      getVisibleAdminNavigation({ ...comptable, grantedPermissions: ['view_education'] }).find(
        (item) => item.id === 'training',
      )?.screen,
    ).toBe('/admin/formation/pedagogie')
  })

  it('lights up merged entries on original module subpages without matching unrelated prefixes', () => {
    const entries = getVisibleAdminNavigation(user('SUPER_ADMIN'))
    for (const [id, path] of [
      ['requests', '/admin/tickets/123'],
      ['team', '/admin/comptes-admin/123'],
      ['system', '/admin/webhooks/123'],
      ['inbox', '/admin/inbox/envoi-groupe'],
      ['projects', '/admin/projets/123'],
      ['projects', '/admin/projets-internes/123'],
      ['analytics', '/admin/analytics/business'],
    ]) {
      expect(entries.filter((item) => isAdminNavigationActive(item, path)).map((item) => item.id)).toEqual([id])
    }
    expect(entries.filter((item) => isAdminNavigationActive(item, '/admin/tickets-other'))).toEqual([])
  })

  it('retains legacy modules and guide in the palette but excludes Arrow', () => {
    const ids = getCommandPaletteItems(user('SUPER_ADMIN')).map((item) => item.id)
    expect(ids).toEqual(expect.arrayContaining(['guide', 'tickets', 'emails', 'beta', 'subsidiaries']))
    expect(ids).not.toContain('arrow')
  })

  it('filters cockpit shortcuts, palette modules and quick actions through the same permissions', () => {
    const comptablePalette = getCommandPaletteItems(user('COMPTABLE'))
    expect(comptablePalette.map((item) => item.id)).toContain('accounting')
    expect(comptablePalette.map((item) => item.id)).not.toEqual(
      expect.arrayContaining(['crm', 'create-lead', 'tickets']),
    )

    const viewerCockpit = getRoleCockpitNavigation(user('VIEWER')).map((item) => item.id)
    expect(viewerCockpit).toEqual(expect.arrayContaining(['projects', 'accounting', 'requests', 'dev']))
  })

  it('derives mobile tabs from authorised navigation rather than fixed links', () => {
    const comptableTabs = getMobileNavigation(user('COMPTABLE')).map((item) => item.id)
    expect(comptableTabs).toContain('projects')
    expect(comptableTabs).not.toEqual(expect.arrayContaining(['crm', 'team', 'requests']))
  })
})
