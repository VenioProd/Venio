import { afterEach, describe, expect, it } from 'vitest'
import { assertValidWebhookUrl } from '../lib/webhooks/urls.js'
import { decryptWebhookSecret, encryptWebhookSecret, generateWebhookSecret } from '../lib/webhooks/secret.js'

const initialEnv = process.env.NODE_ENV

afterEach(() => {
  process.env.NODE_ENV = initialEnv
})

describe('validation des URL de webhook', () => {
  it('accepte une URL https et la normalise', () => {
    expect(assertValidWebhookUrl(' https://kuro.example.test/hooks/venio ')).toBe(
      'https://kuro.example.test/hooks/venio',
    )
  })

  it('accepte http://localhost et http://127.0.0.1 hors production', () => {
    process.env.NODE_ENV = 'development'
    expect(assertValidWebhookUrl('http://localhost:4000/hooks')).toBe('http://localhost:4000/hooks')
    expect(assertValidWebhookUrl('http://127.0.0.1:4000/hooks')).toBe('http://127.0.0.1:4000/hooks')
  })

  it('refuse http://localhost en production', () => {
    process.env.NODE_ENV = 'production'
    expect(() => assertValidWebhookUrl('http://localhost:4000/hooks')).toThrow(/https/i)
  })

  it('refuse une URL http externe même hors production', () => {
    process.env.NODE_ENV = 'development'
    expect(() => assertValidWebhookUrl('http://kuro.example.test/hooks')).toThrow(/https/i)
  })

  it('refuse un protocole non HTTP et une valeur non parsable', () => {
    expect(() => assertValidWebhookUrl('ftp://kuro.example.test/hooks')).toThrow(/https/i)
    expect(() => assertValidWebhookUrl('pas-une-url')).toThrow(/URL/i)
    expect(() => assertValidWebhookUrl(null)).toThrow(/URL/i)
  })
})

describe('secret d’endpoint', () => {
  it('génère 32 octets en hexadécimal, distincts à chaque appel', () => {
    const first = generateWebhookSecret()
    const second = generateWebhookSecret()
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(second).not.toBe(first)
  })

  it('chiffre et déchiffre sans perte', () => {
    const secret = generateWebhookSecret()
    const stored = encryptWebhookSecret(secret)
    expect(stored).not.toBe(secret)
    expect(stored.startsWith('v1:')).toBe(true)
    expect(decryptWebhookSecret(stored)).toBe(secret)
  })
})
