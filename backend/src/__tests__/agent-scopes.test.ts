import { describe, it, expect } from 'vitest'
import {
  AGENT_SCOPES,
  ADMIN_WILDCARD_SCOPE,
  hasAllScopes,
  missingScopes,
  findUnknownScopes,
} from '../lib/agent/scopes.js'

describe('Agent / scopes catalogue', () => {
  it('contains all documented modules', () => {
    // Échantillon : si le catalogue change, les tests doivent suivre la doc
    const set = new Set<string>(AGENT_SCOPES)
    expect(set.has('read:crm')).toBe(true)
    expect(set.has('write:crm')).toBe(true)
    expect(set.has('read:accounting')).toBe(true)
    expect(set.has('trigger:automations')).toBe(true)
    expect(set.has('manage:backup')).toBe(true)
    expect(set.has('manage:2fa')).toBe(true)
    expect(set.has(ADMIN_WILDCARD_SCOPE)).toBe(true)
  })

  it('does NOT contain write:accounting (lecture seule en V1)', () => {
    expect(new Set<string>(AGENT_SCOPES).has('write:accounting')).toBe(false)
  })

  it('does NOT contain write:audit (immuable par nature)', () => {
    expect(new Set<string>(AGENT_SCOPES).has('write:audit')).toBe(false)
  })
})

describe('Agent / hasAllScopes', () => {
  it('returns true when required is empty', () => {
    expect(hasAllScopes([], [])).toBe(true)
    expect(hasAllScopes(['read:crm'], [])).toBe(true)
  })

  it('returns true when all required are granted', () => {
    expect(hasAllScopes(['read:crm', 'write:crm'], ['read:crm'])).toBe(true)
    expect(hasAllScopes(['read:crm', 'write:crm'], ['read:crm', 'write:crm'])).toBe(true)
  })

  it('returns false when any required is missing', () => {
    expect(hasAllScopes(['read:crm'], ['write:crm'])).toBe(false)
    expect(hasAllScopes(['read:crm'], ['read:crm', 'write:crm'])).toBe(false)
    expect(hasAllScopes([], ['read:crm'])).toBe(false)
  })

  it('admin:* grants everything', () => {
    expect(hasAllScopes([ADMIN_WILDCARD_SCOPE], ['read:crm', 'write:projects', 'manage:backup'])).toBe(
      true
    )
    expect(hasAllScopes([ADMIN_WILDCARD_SCOPE], [])).toBe(true)
  })

  it('admin:* does NOT need to be combined with other scopes', () => {
    expect(hasAllScopes([ADMIN_WILDCARD_SCOPE], ['manage:2fa'])).toBe(true)
  })
})

describe('Agent / missingScopes', () => {
  it('returns the scopes not granted', () => {
    expect(missingScopes(['read:crm'], ['read:crm', 'write:crm', 'read:projects']).sort()).toEqual([
      'read:projects',
      'write:crm',
    ])
  })

  it('returns empty when all granted', () => {
    expect(missingScopes(['read:crm', 'write:crm'], ['read:crm'])).toEqual([])
  })

  it('returns empty when admin:*', () => {
    expect(missingScopes([ADMIN_WILDCARD_SCOPE], ['manage:backup', 'manage:2fa'])).toEqual([])
  })
})

describe('Agent / findUnknownScopes', () => {
  it('returns empty for fully valid scopes', () => {
    expect(findUnknownScopes(['read:crm', 'write:projects', ADMIN_WILDCARD_SCOPE])).toEqual([])
  })

  it('returns unknown scopes', () => {
    const result = findUnknownScopes(['read:crm', 'write:accounting', 'bogus:scope'])
    expect(result.sort()).toEqual(['bogus:scope', 'write:accounting'])
  })

  it('handles non-string entries', () => {
    const result = findUnknownScopes(['read:crm', 123, null, undefined])
    expect(result).toContain('123')
    expect(result).toContain('null')
    expect(result).toContain('undefined')
  })
})
