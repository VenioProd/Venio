import { describe, expect, it } from 'vitest'
import { TOTP } from 'otpauth'
import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  generateTotp,
  generateTotpSecret,
  hotp,
  matchTotpStep,
  totpStep,
} from './totp.js'

// Secret des vecteurs de test de la RFC 6238 (annexe B), SHA-1 : « 12345678901234567890 ».
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'))

describe('base32 (RFC 4648)', () => {
  it('encodes the RFC 6238 reference secret', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  })

  it('round-trips arbitrary bytes and tolerates case, spaces and padding', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255])
    const encoded = base32Encode(bytes)
    expect(base32Decode(encoded)).toEqual(bytes)
    expect(base32Decode(` ${encoded.toLowerCase().replace(/(.{4})/g, '$1 ')}==`)).toEqual(bytes)
  })

  it('rejects characters outside the alphabet', () => {
    expect(() => base32Decode('ABC1')).toThrow()
  })

  it('generates 160-bit secrets of 32 base32 characters', () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32Decode(secret)).toHaveLength(20)
    expect(generateTotpSecret()).not.toBe(secret)
  })
})

describe('HOTP / TOTP', () => {
  it('matches the RFC 4226 HOTP test vectors', () => {
    const expected = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ]
    expected.forEach((code, counter) => expect(hotp(RFC_SECRET, counter)).toBe(code))
  })

  it('matches the RFC 6238 SHA-1 vectors (last 6 digits)', () => {
    const vectors: Array<[number, string]> = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
      [20000000000, '353130'],
    ]
    for (const [seconds, code] of vectors) expect(generateTotp(RFC_SECRET, seconds * 1000)).toBe(code)
  })

  it('agrees with the codes of a standard authenticator implementation', () => {
    const secret = generateTotpSecret()
    const reference = new TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 })
    const at = Date.UTC(2026, 10, 6, 12, 0, 0)
    expect(generateTotp(secret, at)).toBe(reference.generate({ timestamp: at }))
  })

  it('accepts the previous, current and next step only', () => {
    const at = 1_800_000_000_000
    const step = totpStep(at)
    for (const delta of [-1, 0, 1]) {
      expect(matchTotpStep(RFC_SECRET, generateTotp(RFC_SECRET, at + delta * 30_000), { atMs: at })).toBe(step + delta)
    }
    expect(matchTotpStep(RFC_SECRET, generateTotp(RFC_SECRET, at - 60_000), { atMs: at })).toBeNull()
    expect(matchTotpStep(RFC_SECRET, generateTotp(RFC_SECRET, at + 60_000), { atMs: at })).toBeNull()
  })

  it('normalises spaces and rejects malformed codes or secrets', () => {
    const at = 1_800_000_000_000
    const code = generateTotp(RFC_SECRET, at)
    expect(matchTotpStep(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, { atMs: at })).not.toBeNull()
    expect(matchTotpStep(RFC_SECRET, '12345', { atMs: at })).toBeNull()
    expect(matchTotpStep(RFC_SECRET, 'abcdef', { atMs: at })).toBeNull()
    expect(matchTotpStep(RFC_SECRET, undefined, { atMs: at })).toBeNull()
    expect(matchTotpStep('', code, { atMs: at })).toBeNull()
    expect(matchTotpStep('not base32!', code, { atMs: at })).toBeNull()
  })

  it('builds an otpauth URI understood by authenticator apps', () => {
    const uri = new URL(buildOtpauthUri(RFC_SECRET, 'jeanne@example.test'))
    expect(uri.protocol).toBe('otpauth:')
    expect(uri.host).toBe('totp')
    expect(decodeURIComponent(uri.pathname)).toBe('/Venio:jeanne@example.test')
    expect(uri.searchParams.get('secret')).toBe(RFC_SECRET)
    expect(uri.searchParams.get('issuer')).toBe('Venio')
    expect(uri.searchParams.get('digits')).toBe('6')
    expect(uri.searchParams.get('period')).toBe('30')
  })
})
