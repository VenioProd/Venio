import { describe, expect, it } from 'vitest'
import { getVisibleNavigation } from '../rbac'
import type { User, UserRole } from '../../types/auth.types'

type RoleScenario = {
  role: UserRole
  visible: string[]
  hidden: string[]
}

const scenarios: RoleScenario[] = [
  { role: 'SUPER_ADMIN', visible: ['clients', 'crm', 'accounting', 'admin-accounts', 'agents'], hidden: [] },
  { role: 'ADMIN', visible: ['clients', 'crm', 'accounting'], hidden: ['admin-accounts', 'agents', 'qualiopi'] },
  { role: 'COMMERCIAL', visible: ['clients', 'crm', 'projects', 'tickets'], hidden: ['accounting', 'admin-accounts'] },
  { role: 'RH', visible: ['projects', 'interns', 'emails', 'qualiopi', 'tickets'], hidden: ['crm', 'accounting'] },
  { role: 'COMPTABLE', visible: ['projects', 'accounting', 'messages'], hidden: ['clients', 'crm', 'tickets'] },
  {
    role: 'VIEWER',
    visible: ['projects', 'accounting', 'tickets', 'dev'],
    hidden: ['clients', 'crm', 'admin-accounts'],
  },
  {
    role: 'STAGIAIRE',
    visible: ['crm', 'projects', 'resources', 'tickets'],
    hidden: ['clients', 'accounting', 'admin-accounts'],
  },
]

function user(role: UserRole): User {
  return {
    _id: `recipe-${role.toLowerCase()}`,
    name: `Recette ${role}`,
    email: `recipe-${role.toLowerCase()}@example.test`,
    role,
    permissions: [],
  }
}

describe('VENIO-104 — recette UI des rôles administrateur', () => {
  it.each(scenarios)('$role exposes only its expected navigation scenarios', ({ role, visible, hidden }) => {
    const itemIds = getVisibleNavigation(user(role)).map((item) => item.id)

    expect(itemIds).toEqual(expect.arrayContaining(visible))
    for (const itemId of hidden) expect(itemIds).not.toContain(itemId)
  })
})
