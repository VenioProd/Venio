import { describe, it, expect } from 'vitest'
import {
  generateAgentToken,
  verifyAgentToken,
  isValidTokenFormat,
  extractPrefix,
  TOKEN_PREFIX,
  TOKEN_PREFIX_DISPLAY_CHARS,
} from '../lib/agent/tokens.js'

describe('Agent / token generation', () => {
  it('generates a token with vno_pat_ prefix + 32 base62 chars', async () => {
    const { plain, hash, prefix } = await generateAgentToken()
    expect(plain).toMatch(/^vno_pat_[A-Za-z0-9]{32}$/)
    expect(hash).toMatch(/^\$2[ab]\$/)
    expect(prefix.length).toBe(TOKEN_PREFIX_DISPLAY_CHARS)
    expect(prefix.startsWith(TOKEN_PREFIX)).toBe(true)
    expect(plain.startsWith(prefix)).toBe(true)
  })

  it('generates distinct tokens each call', async () => {
    const a = await generateAgentToken()
    const b = await generateAgentToken()
    expect(a.plain).not.toBe(b.plain)
    expect(a.hash).not.toBe(b.hash)
    expect(a.prefix).not.toBe(b.prefix) // les 4 chars discriminants diffèrent
  })
})

describe('Agent / token verification', () => {
  it('verifyAgentToken returns true for the same token', async () => {
    const { plain, hash } = await generateAgentToken()
    await expect(verifyAgentToken(plain, hash)).resolves.toBe(true)
  })

  it('verifyAgentToken returns false when token is altered', async () => {
    const { plain, hash } = await generateAgentToken()
    const tampered = plain.slice(0, -1) + (plain.endsWith('A') ? 'B' : 'A')
    await expect(verifyAgentToken(tampered, hash)).resolves.toBe(false)
  })

  it('verifyAgentToken returns false for wrong hash', async () => {
    const a = await generateAgentToken()
    const b = await generateAgentToken()
    await expect(verifyAgentToken(a.plain, b.hash)).resolves.toBe(false)
  })

  it('verifyAgentToken returns false for malformed input', async () => {
    const { hash } = await generateAgentToken()
    await expect(verifyAgentToken('not-a-token', hash)).resolves.toBe(false)
    await expect(verifyAgentToken('', hash)).resolves.toBe(false)
    await expect(verifyAgentToken(null, hash)).resolves.toBe(false)
    await expect(verifyAgentToken(undefined, hash)).resolves.toBe(false)
    await expect(verifyAgentToken(123 as unknown as string, hash)).resolves.toBe(false)
  })

  it('verifyAgentToken returns false for malformed hash', async () => {
    const { plain } = await generateAgentToken()
    await expect(verifyAgentToken(plain, '')).resolves.toBe(false)
    await expect(verifyAgentToken(plain, null as unknown as string)).resolves.toBe(false)
    // Hash non bcrypt → bcrypt.compare retourne false (ne throw pas grâce au try/catch)
    await expect(verifyAgentToken(plain, 'garbage')).resolves.toBe(false)
  })
})

describe('Agent / token format validation', () => {
  it('isValidTokenFormat accepts valid tokens', () => {
    expect(isValidTokenFormat('vno_pat_aB3xY9mN2pQ7rS5tU1vW8zA4cD6eF0gH')).toBe(true)
  })

  it('isValidTokenFormat rejects bad prefix', () => {
    expect(isValidTokenFormat('vno_live_aB3xY9mN2pQ7rS5tU1vW8zA4cD6eF0gH')).toBe(false)
  })

  it('isValidTokenFormat rejects wrong length', () => {
    expect(isValidTokenFormat('vno_pat_short')).toBe(false)
    expect(isValidTokenFormat('vno_pat_' + 'a'.repeat(31))).toBe(false)
    expect(isValidTokenFormat('vno_pat_' + 'a'.repeat(33))).toBe(false)
  })

  it('isValidTokenFormat rejects non-base62 chars', () => {
    expect(isValidTokenFormat('vno_pat_' + '!'.repeat(32))).toBe(false)
    expect(isValidTokenFormat('vno_pat_' + '-'.repeat(32))).toBe(false)
  })

  it('isValidTokenFormat rejects non-strings', () => {
    expect(isValidTokenFormat(123)).toBe(false)
    expect(isValidTokenFormat(null)).toBe(false)
    expect(isValidTokenFormat(undefined)).toBe(false)
    expect(isValidTokenFormat({})).toBe(false)
  })

  it('extractPrefix returns the first 12 chars of a valid token', async () => {
    const { plain, prefix } = await generateAgentToken()
    expect(extractPrefix(plain)).toBe(prefix)
    expect(extractPrefix(plain).length).toBe(TOKEN_PREFIX_DISPLAY_CHARS)
  })

  it('extractPrefix throws on invalid format', () => {
    expect(() => extractPrefix('bad')).toThrow()
  })
})
