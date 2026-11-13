import { describe, expect, it } from 'vitest'
import matrix from '../../../rbac-matrix.json'
import { getPermissionsForRole } from '../permissions'
import {
  ACCESS_MODULES,
  INVITABLE_ROLES,
  ROLE_TEXT,
  generatePassword,
  moduleLevel,
  permissionOverrides,
} from '../teamAccess'

describe('catalogue du formulaire d’invitation', () => {
  it('range chacun des droits de la matrice dans un module, et un seul', () => {
    const listed = ACCESS_MODULES.flatMap((module) => module.permissions.map((item) => item.permission))
    expect([...listed].sort()).toEqual(Object.values(matrix.permissions).sort())
  })

  it('ne propose ni super admin, ni agent, ni client, et décrit chaque rôle proposé', () => {
    expect(INVITABLE_ROLES).not.toContain('SUPER_ADMIN')
    expect(INVITABLE_ROLES).not.toContain('AGENT')
    expect(INVITABLE_ROLES).not.toContain('CLIENT')
    // Chaque rôle d'équipe hors super admin, plus le commercial externe.
    expect([...INVITABLE_ROLES].sort()).toEqual(
      [...matrix.roles.admin.filter((role) => role !== 'SUPER_ADMIN'), 'COMMERCIAL_EXTERNE'].sort(),
    )
    for (const role of INVITABLE_ROLES) expect(ROLE_TEXT[role], role).toBeDefined()
  })

  it('donne le plus haut niveau d’accès accordé dans le module', () => {
    const crm = ACCESS_MODULES.find((module) => module.id === 'crm')!
    expect(moduleLevel(crm, new Set())).toBe('none')
    expect(moduleLevel(crm, new Set(['view_crm']))).toBe('read')
    expect(moduleLevel(crm, new Set(['view_crm', 'manage_crm']))).toBe('write')
  })

  it('un viewer lit la compta sans l’éditer, un comptable l’édite', () => {
    const accounting = ACCESS_MODULES.find((module) => module.id === 'accounting')!
    expect(moduleLevel(accounting, new Set(getPermissionsForRole('VIEWER')))).toBe('read')
    expect(moduleLevel(accounting, new Set(getPermissionsForRole('COMPTABLE')))).toBe('write')
    expect(moduleLevel(accounting, new Set(getPermissionsForRole('COMMERCIAL')))).toBe('none')
  })
})

describe('permissionOverrides', () => {
  it('sépare ce qui s’ajoute au rôle de ce qui en est retiré', () => {
    expect(permissionOverrides(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual({
      grantedPermissions: ['d'],
      deniedPermissions: ['a'],
    })
  })

  it('ne renvoie aucun écart quand la sélection est celle du rôle', () => {
    const defaults = getPermissionsForRole('RH')
    expect(permissionOverrides(defaults, [...defaults].reverse())).toEqual({
      grantedPermissions: [],
      deniedPermissions: [],
    })
  })
})

describe('generatePassword', () => {
  it('tire un mot de passe de la longueur demandée, sans caractère ambigu', () => {
    for (let i = 0; i < 50; i++) {
      const password = generatePassword()
      expect(password).toHaveLength(14)
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/)
    }
    expect(generatePassword(24)).toHaveLength(24)
  })

  it('ne répète pas le même mot de passe', () => {
    expect(new Set(Array.from({ length: 20 }, () => generatePassword())).size).toBe(20)
  })
})
