import { describe, it, expect } from 'vitest'
import { computeRequestHash, isValidIdempotencyKey } from '../lib/agent/idempotency.js'

describe('Agent / computeRequestHash', () => {
  it('is deterministic for equivalent objects (key order independent)', () => {
    const a = { foo: 1, bar: 'baz' }
    const b = { bar: 'baz', foo: 1 }
    expect(computeRequestHash(a)).toBe(computeRequestHash(b))
  })

  it('is deterministic for nested equivalent objects', () => {
    const a = { x: { y: 1, z: [1, 2, 3] } }
    const b = { x: { z: [1, 2, 3], y: 1 } }
    expect(computeRequestHash(a)).toBe(computeRequestHash(b))
  })

  it('changes when any value changes', () => {
    expect(computeRequestHash({ a: 1 })).not.toBe(computeRequestHash({ a: 2 }))
  })

  it('changes when a field is added', () => {
    expect(computeRequestHash({ a: 1 })).not.toBe(computeRequestHash({ a: 1, b: 2 }))
  })

  it('changes when array order changes', () => {
    // Note : on hash l'ordre des éléments d'un tableau (sémantique = liste, pas set)
    expect(computeRequestHash([1, 2, 3])).not.toBe(computeRequestHash([3, 2, 1]))
  })

  it('treats null, undefined, empty string and {} as equivalent', () => {
    const h = computeRequestHash(null)
    expect(h).toBe(computeRequestHash(undefined))
    expect(h).toBe(computeRequestHash(''))
    expect(h).toBe(computeRequestHash({}))
    expect(h).toMatch(/^[a-f0-9]{64}$/)
  })

  it('but distinguishes {} from { a: null }', () => {
    expect(computeRequestHash({})).not.toBe(computeRequestHash({ a: null }))
  })

  it('returns a 64-char hex (sha256)', () => {
    expect(computeRequestHash({ a: 1 })).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('Agent / isValidIdempotencyKey', () => {
  it('accepts UUID v4 format', () => {
    expect(isValidIdempotencyKey('e7b8c4a1-d5f3-4e1f-9c8b-2a3d4e5f6a7b')).toBe(true)
  })

  it('accepts nano-id-style keys', () => {
    expect(isValidIdempotencyKey('V1StGXR8_Z5jdHi6B-myT')).toBe(true)
  })

  it('accepts pure-alphanumeric keys', () => {
    expect(isValidIdempotencyKey('abcdefgh')).toBe(true)
    expect(isValidIdempotencyKey('a'.repeat(255))).toBe(true)
  })

  it('rejects too short', () => {
    expect(isValidIdempotencyKey('short')).toBe(false)
    expect(isValidIdempotencyKey('1234567')).toBe(false)
  })

  it('rejects too long', () => {
    expect(isValidIdempotencyKey('a'.repeat(256))).toBe(false)
  })

  it('rejects forbidden characters', () => {
    expect(isValidIdempotencyKey('bad chars!!!')).toBe(false)
    expect(isValidIdempotencyKey('with/slash')).toBe(false)
    expect(isValidIdempotencyKey('with.dot')).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isValidIdempotencyKey(123)).toBe(false)
    expect(isValidIdempotencyKey(null)).toBe(false)
    expect(isValidIdempotencyKey(undefined)).toBe(false)
  })
})
