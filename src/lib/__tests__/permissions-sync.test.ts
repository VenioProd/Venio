import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { PERMISSIONS, getPermissionsForRole } from '../permissions'

/**
 * Canonical list of permissions shared between front and back.
 * If you add a permission to either side, add it here too — this test
 * will catch any drift between the two files.
 */
const CANONICAL_VALUES = [
  'manage_admins',
  'manage_clients',
  'view_crm',
  'manage_crm',
  'view_messaging',
  'send_messages',
  'manage_channels',
  'view_projects',
  'edit_projects',
  'view_content',
  'edit_content',
  'view_billing',
  'manage_billing',
  'manage_tasks',
  'view_qualiopi',
  'manage_qualiopi',
  'view_tickets',
  'create_tickets',
  'manage_tickets',
  'view_accounting',
  'manage_accounting',
  'lock_accounting',
  'view_vat',
  'manage_vat',
  'export_fec',
  'manage_external_sources',
  'view_dev',
  'manage_dev',
  'view_education',
  'manage_education',
]

const CANONICAL_KEYS = [
  'MANAGE_ADMINS',
  'MANAGE_CLIENTS',
  'VIEW_CRM',
  'MANAGE_CRM',
  'VIEW_MESSAGING',
  'SEND_MESSAGES',
  'MANAGE_CHANNELS',
  'VIEW_PROJECTS',
  'EDIT_PROJECTS',
  'VIEW_CONTENT',
  'EDIT_CONTENT',
  'VIEW_BILLING',
  'MANAGE_BILLING',
  'MANAGE_TASKS',
  'VIEW_QUALIOPI',
  'MANAGE_QUALIOPI',
  'VIEW_TICKETS',
  'CREATE_TICKETS',
  'MANAGE_TICKETS',
  'VIEW_ACCOUNTING',
  'MANAGE_ACCOUNTING',
  'LOCK_ACCOUNTING',
  'VIEW_VAT',
  'MANAGE_VAT',
  'EXPORT_FEC',
  'MANAGE_EXTERNAL_SOURCES',
  'VIEW_DEV',
  'MANAGE_DEV',
  'VIEW_EDUCATION',
  'MANAGE_EDUCATION',
]

// --------------------------------------------------------------------------
// Helper: parse backend PERMISSIONS from source (avoids ESM import issues in
// jsdom environment — the backend uses Node ESM which Vitest can't resolve
// directly from the frontend test runner).
// --------------------------------------------------------------------------
function parseBackendPermissions(src: string): { keys: string[]; values: string[] } {
  // Extract the { ... } block of the PERMISSIONS object
  const block = src.match(/PERMISSIONS[^=]*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  const keys: string[] = []
  const values: string[] = []
  // Match lines like:  KEY: 'value',   (with optional comments between entries)
  const entryRe = /^\s*([A-Z_]+)\s*:\s*'([a-z_]+)'/gm
  let m: RegExpExecArray | null
  while ((m = entryRe.exec(block)) !== null) {
    keys.push(m[1])
    values.push(m[2])
  }
  return { keys, values }
}

// --------------------------------------------------------------------------
// Helper: parse a ROLE_PERMISSIONS map from a source file.
// Recognises:
//   ROLE: new Set([PERMISSIONS.FOO, PERMISSIONS.BAR, ...])
//   ROLE: new Set(Object.values(PERMISSIONS))   (sentinel: ALL)
//   ROLE: new Set([])  /  new Set<...>([])      (empty)
// Returns Record<ROLE, string[]> where strings are PERMISSION KEYS
// (e.g. 'VIEW_TICKETS'), or the sentinel '__ALL__' when the role
// receives every permission via Object.values(PERMISSIONS).
// --------------------------------------------------------------------------
function parseRolePermissions(src: string): Record<string, string[]> {
  const block = src.match(/ROLE_PERMISSIONS[^=]*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  const result: Record<string, string[]> = {}
  // Match: ROLE_NAME: new Set( ... ),  — the body is non-greedy up to the
  // closing paren that precedes a comma+newline or the next role entry.
  const roleRe = /^\s*([A-Z_]+)\s*:\s*new Set(?:<[^>]+>)?\s*\(([\s\S]*?)\)\s*,?\s*$/gm
  let m: RegExpExecArray | null
  while ((m = roleRe.exec(block)) !== null) {
    const role = m[1]
    const body = m[2].trim()
    if (/Object\.values\s*\(\s*PERMISSIONS\s*\)/.test(body)) {
      result[role] = ['__ALL__']
      continue
    }
    if (body === '[]' || /^\[\s*\]$/.test(body)) {
      result[role] = []
      continue
    }
    const perms: string[] = []
    const permRe = /PERMISSIONS\.([A-Z_]+)/g
    let pm: RegExpExecArray | null
    while ((pm = permRe.exec(body)) !== null) perms.push(pm[1])
    result[role] = perms
  }
  return result
}

// --------------------------------------------------------------------------
// Frontend PERMISSIONS
// --------------------------------------------------------------------------
describe('Frontend PERMISSIONS (src/lib/permissions.ts)', () => {
  const frontValues = Object.values(PERMISSIONS) as string[]
  const frontKeys = Object.keys(PERMISSIONS)

  it('has exactly 30 permissions', () => {
    expect(frontValues.length).toBe(30)
  })

  it('values match the canonical list exactly (same set, same cardinality)', () => {
    expect(new Set(frontValues)).toEqual(new Set(CANONICAL_VALUES))
    expect(frontValues.length).toBe(CANONICAL_VALUES.length)
  })

  it('keys match the canonical key list exactly', () => {
    expect(new Set(frontKeys)).toEqual(new Set(CANONICAL_KEYS))
    expect(frontKeys.length).toBe(CANONICAL_KEYS.length)
  })
})

// --------------------------------------------------------------------------
// Backend PERMISSIONS (parsed from source file)
// --------------------------------------------------------------------------
describe('Backend PERMISSIONS (backend/src/lib/permissions.ts)', () => {
  const backendSrc = readFileSync(
    resolve(__dirname, '../../../backend/src/lib/permissions.ts'),
    'utf-8',
  )
  const { keys: backendKeys, values: backendValues } = parseBackendPermissions(backendSrc)

  it('has exactly 30 permissions', () => {
    expect(backendValues.length).toBe(30)
  })

  it('values match the canonical list exactly (same set, same cardinality)', () => {
    expect(new Set(backendValues)).toEqual(new Set(CANONICAL_VALUES))
    expect(backendValues.length).toBe(CANONICAL_VALUES.length)
  })

  it('keys match the canonical key list exactly', () => {
    expect(new Set(backendKeys)).toEqual(new Set(CANONICAL_KEYS))
    expect(backendKeys.length).toBe(CANONICAL_KEYS.length)
  })
})

// --------------------------------------------------------------------------
// Cross-check: front values === back values (no drift)
// --------------------------------------------------------------------------
describe('Front/back synchronization', () => {
  const frontValues = Object.values(PERMISSIONS) as string[]

  const backendSrc = readFileSync(
    resolve(__dirname, '../../../backend/src/lib/permissions.ts'),
    'utf-8',
  )
  const { keys: backendKeys, values: backendValues } = parseBackendPermissions(backendSrc)
  const frontKeys = Object.keys(PERMISSIONS)

  it('has identical permission values in both files', () => {
    expect(new Set(frontValues)).toEqual(new Set(backendValues))
  })

  it('has identical permission keys in both files', () => {
    expect(new Set(frontKeys)).toEqual(new Set(backendKeys))
  })

  it('no permission value present only in frontend', () => {
    const backSet = new Set(backendValues)
    const frontOnly = frontValues.filter((v) => !backSet.has(v))
    expect(frontOnly).toEqual([])
  })

  it('no permission value present only in backend', () => {
    const frontSet = new Set(frontValues)
    const backOnly = backendValues.filter((v) => !frontSet.has(v))
    expect(backOnly).toEqual([])
  })
})

// --------------------------------------------------------------------------
// ROLE_PERMISSIONS — make sure every role grants the same set of permissions
// in front and back. This catches drift such as "ADMIN gained MANAGE_TICKETS
// in the backend but not in the frontend", which is silent today and easy to
// miss in code review.
// --------------------------------------------------------------------------
describe('Front/back ROLE_PERMISSIONS synchronization', () => {
  const frontendSrc = readFileSync(
    resolve(__dirname, '../permissions.ts'),
    'utf-8',
  )
  const backendSrc = readFileSync(
    resolve(__dirname, '../../../backend/src/lib/permissions.ts'),
    'utf-8',
  )

  const frontRoles = parseRolePermissions(frontendSrc)
  const backRoles = parseRolePermissions(backendSrc)

  // Roles defined in both (intersection). Some roles (e.g. AGENT) only exist
  // backend-side because frontend never holds an AGENT user.
  const commonRoles = Object.keys(backRoles).filter((r) => r in frontRoles)

  it('parsed at least the standard admin role set in both files', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'COMPTABLE', 'RH', 'COMMERCIAL', 'VIEWER', 'STAGIAIRE', 'CLIENT']) {
      expect(frontRoles, `frontend missing role ${role}`).toHaveProperty(role)
      expect(backRoles, `backend missing role ${role}`).toHaveProperty(role)
    }
  })

  for (const role of ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'COMPTABLE', 'RH', 'COMMERCIAL', 'VIEWER', 'STAGIAIRE', 'CLIENT']) {
    it(`role ${role}: front and back grant the same permissions`, () => {
      const front = new Set(frontRoles[role] ?? [])
      const back = new Set(backRoles[role] ?? [])
      expect({ role, perms: [...back].sort() }).toEqual({ role, perms: [...front].sort() })
    })
  }

  // Defensive: catch backend-only roles that quietly hold permissions which
  // never round-trip to the frontend (e.g. AGENT). We don't require them in
  // the frontend, but we surface the list so it's visible in test output.
  it('reports backend-only roles (informational)', () => {
    const backOnly = Object.keys(backRoles).filter((r) => !(r in frontRoles))
    // Today: AGENT is backend-only and intentional. Update this list if a
    // new backend-only role is added — the assertion fails loudly otherwise.
    expect(backOnly.sort()).toEqual(['AGENT'])
  })

  // Smoke-check the runtime API of getPermissionsForRole against the parser.
  // If the parser disagrees with the actual exported Set, both fail together.
  it('getPermissionsForRole(ADMIN) matches parsed frontend ADMIN set', () => {
    const expected = (frontRoles.ADMIN ?? []).map((k) => (PERMISSIONS as Record<string, string>)[k])
    expect(new Set(getPermissionsForRole('ADMIN'))).toEqual(new Set(expected))
  })

  it('commonRoles non-empty (parser sanity)', () => {
    expect(commonRoles.length).toBeGreaterThanOrEqual(8)
  })
})
