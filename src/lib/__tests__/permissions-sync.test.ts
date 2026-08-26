import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { PERMISSIONS } from '../permissions'

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
  'view_phases',
  'manage_phases',
  'view_billing',
  'manage_billing',
  'manage_tasks',
  'view_qualiopi',
  'manage_qualiopi',
  'view_tickets',
  'create_tickets',
  'manage_tickets',
  'view_change_requests',
  'manage_change_requests',
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
  'view_webhooks',
  'manage_webhooks',
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
  'VIEW_PHASES',
  'MANAGE_PHASES',
  'VIEW_BILLING',
  'MANAGE_BILLING',
  'MANAGE_TASKS',
  'VIEW_QUALIOPI',
  'MANAGE_QUALIOPI',
  'VIEW_TICKETS',
  'CREATE_TICKETS',
  'MANAGE_TICKETS',
  'VIEW_CHANGE_REQUESTS',
  'MANAGE_CHANGE_REQUESTS',
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
  'VIEW_WEBHOOKS',
  'MANAGE_WEBHOOKS',
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
// Frontend PERMISSIONS
// --------------------------------------------------------------------------
describe('Frontend PERMISSIONS (src/lib/permissions.ts)', () => {
  const frontValues = Object.values(PERMISSIONS) as string[]
  const frontKeys = Object.keys(PERMISSIONS)

  it('has exactly 32 permissions', () => {
    expect(frontValues.length).toBe(32)
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
  const backendSrc = readFileSync(resolve(__dirname, '../../../backend/src/lib/permissions.ts'), 'utf-8')
  const { keys: backendKeys, values: backendValues } = parseBackendPermissions(backendSrc)

  it('has exactly 32 permissions', () => {
    expect(backendValues.length).toBe(32)
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

  const backendSrc = readFileSync(resolve(__dirname, '../../../backend/src/lib/permissions.ts'), 'utf-8')
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
