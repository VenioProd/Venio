import { describe, expect, it } from 'vitest'
import { canAdministerCrm } from '../crmAccess'
import type { User } from '../../types/auth.types'

const as = (role: string) => ({ _id: 'u', role }) as unknown as User

describe('canAdministerCrm', () => {
  it('autorise uniquement SUPER_ADMIN et ADMIN, comme administersCrm côté serveur', () => {
    expect(canAdministerCrm(as('SUPER_ADMIN'))).toBe(true)
    expect(canAdministerCrm(as('ADMIN'))).toBe(true)
    for (const role of [
      'MANAGER',
      'COMMERCIAL',
      'STAGIAIRE',
      'VIEWER',
      'COMPTABLE',
      'RH',
      'CLIENT',
      'COMMERCIAL_EXTERNE',
    ]) {
      expect(canAdministerCrm(as(role))).toBe(false)
    }
  })

  it('refuse un utilisateur absent', () => {
    expect(canAdministerCrm(null)).toBe(false)
    expect(canAdministerCrm(undefined)).toBe(false)
  })
})
