import { describe, expect, it } from 'vitest'
import { createBetaTesterToken, hashBetaTesterToken, isValidBetaTesterToken } from './tokens.js'

describe('jetons de testeur beta', () => {
  it('produit un secret url-safe de 256 bits', () => {
    const token = createBetaTesterToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('ne produit jamais deux fois le meme secret', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => createBetaTesterToken()))
    expect(tokens.size).toBe(50)
  })

  it('hache de maniere deterministe sans laisser fuiter le secret', () => {
    const token = createBetaTesterToken()
    const hash = hashBetaTesterToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(hashBetaTesterToken(token))
    expect(hash).not.toContain(token)
  })

  it('donne des empreintes distinctes a des secrets distincts', () => {
    expect(hashBetaTesterToken(createBetaTesterToken())).not.toBe(hashBetaTesterToken(createBetaTesterToken()))
  })

  it('rejette toute forme qui ne correspond pas au secret attendu', () => {
    expect(isValidBetaTesterToken(createBetaTesterToken())).toBe(true)
    expect(isValidBetaTesterToken('')).toBe(false)
    expect(isValidBetaTesterToken('trop-court')).toBe(false)
    expect(isValidBetaTesterToken('a'.repeat(44))).toBe(false)
    expect(isValidBetaTesterToken('a'.repeat(42) + '+')).toBe(false)
    expect(isValidBetaTesterToken(null)).toBe(false)
    expect(isValidBetaTesterToken(42)).toBe(false)
  })
})
