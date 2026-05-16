import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { computeSignature, verifySignature } from '../lib/external/hmac.js'
import { generateApiKey, verifyApiKey, generateWebhookSecret } from '../lib/external/apiKey.js'

describe('Accounting / External / HMAC', () => {
  const secret = 'venio_webhook_secret_xxxxxxxxxxxxxxxxxxxxxxxxxx'
  const timestamp = '1747393200'
  const body = JSON.stringify({ externalId: 'TX1', amount: 1200, vatRate: 20 })

  it('compute signature in Stripe-like format (sha256=<hex>)', () => {
    const sig = computeSignature(timestamp, Buffer.from(body), secret)
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/)
  })

  it('verifySignature returns true for valid signature', () => {
    const sig = computeSignature(timestamp, Buffer.from(body), secret)
    expect(verifySignature(timestamp, Buffer.from(body), secret, sig)).toBe(true)
  })

  it('verifySignature returns false for tampered body', () => {
    const sig = computeSignature(timestamp, Buffer.from(body), secret)
    const tampered = JSON.stringify({ externalId: 'TX1', amount: 9999, vatRate: 20 })
    expect(verifySignature(timestamp, Buffer.from(tampered), secret, sig)).toBe(false)
  })

  it('verifySignature returns false for wrong secret', () => {
    const sig = computeSignature(timestamp, Buffer.from(body), secret)
    expect(verifySignature(timestamp, Buffer.from(body), 'wrong_secret', sig)).toBe(false)
  })

  it('verifySignature returns false for malformed signature', () => {
    expect(verifySignature(timestamp, Buffer.from(body), secret, 'sha256=invalidhex')).toBe(false)
    expect(verifySignature(timestamp, Buffer.from(body), secret, 'bad_format')).toBe(false)
  })
})

describe('Accounting / External / API Key', () => {
  it('generateApiKey produces vno_live_<32 hex> + bcrypt hash', async () => {
    const { plain, hash, prefix } = await generateApiKey()
    expect(plain).toMatch(/^vno_live_[a-f0-9]{32}$/)
    expect(hash).toMatch(/^\$2[ab]\$/)
    expect(prefix.length).toBeGreaterThan(0)
    expect(plain.startsWith(prefix)).toBe(true)
  })

  it('verifyApiKey returns true for correct key', async () => {
    const { plain, hash } = await generateApiKey()
    await expect(verifyApiKey(plain, hash)).resolves.toBe(true)
  })

  it('verifyApiKey returns false for wrong key', async () => {
    const { hash } = await generateApiKey()
    await expect(verifyApiKey('vno_live_fake_xxxxxxxxxxxxxxxxxxxxxxxx', hash)).resolves.toBe(false)
  })

  it('generateWebhookSecret returns 64-char hex string', () => {
    const s = generateWebhookSecret()
    expect(s).toMatch(/^[a-f0-9]{64}$/)
    // Distinct secrets each call
    expect(s).not.toBe(generateWebhookSecret())
  })
})

describe('Accounting / CSV Export', () => {
  it('escapes special characters and adds UTF-8 BOM', async () => {
    const { buildCsv } = await import('../lib/accounting/csvExport.js')
    const csv = buildCsv(
      ['Code', 'Libellé', 'Débit'],
      [
        ['411000', 'Clients', 1200],
        ['44571', 'TVA "collectée"; 20%', 200],
      ]
    )
    // BOM UTF-8
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    // Header separator ;
    expect(csv).toContain('Code;Libellé;Débit')
    // Escape quotes (doubled) and wrap field with ; or " in quotes
    expect(csv).toContain('"TVA ""collectée""; 20%"')
  })
})

describe('Accounting / FEC date format', () => {
  it('formats dates AAAAMMJJ without separator', () => {
    const date = new Date('2026-05-16T10:30:00Z')
    const formatted = date.toISOString().slice(0, 10).replace(/-/g, '')
    expect(formatted).toBe('20260516')
    expect(formatted).toHaveLength(8)
  })
})

describe('crypto.timingSafeEqual basics', () => {
  it('returns true for equal buffers', () => {
    const a = Buffer.from('hello')
    const b = Buffer.from('hello')
    expect(crypto.timingSafeEqual(a, b)).toBe(true)
  })

  it('returns false for different buffers', () => {
    const a = Buffer.from('hello')
    const b = Buffer.from('hellp')
    expect(crypto.timingSafeEqual(a, b)).toBe(false)
  })
})
