import { afterEach, describe, expect, it } from 'vitest'
import {
  consumeRecoveryCode,
  createRecoveryCodes,
  createTotpSecret,
  isMfaEnabled,
  isMfaEnrollmentRoute,
  requiresMfa,
} from './mfa.js'

afterEach(() => {
  delete process.env.MFA_ENABLED
})

describe('MFA helpers', () => {
  it('requires MFA only for privileged administrator roles once the feature is on', () => {
    process.env.MFA_ENABLED = 'true'
    expect(requiresMfa('SUPER_ADMIN')).toBe(true)
    expect(requiresMfa('ADMIN')).toBe(true)
    expect(requiresMfa('MANAGER')).toBe(false)
  })

  it('is disabled by default, so no role is ever asked for a second factor', () => {
    expect(isMfaEnabled()).toBe(false)
    expect(requiresMfa('SUPER_ADMIN')).toBe(false)
    expect(requiresMfa('ADMIN')).toBe(false)
  })

  it('reads the switch at call time rather than at module load', () => {
    process.env.MFA_ENABLED = 'true'
    expect(requiresMfa('ADMIN')).toBe(true)
    process.env.MFA_ENABLED = 'false'
    expect(requiresMfa('ADMIN')).toBe(false)
  })

  it('creates recovery codes that are single-use and never persisted in clear text', async () => {
    const { codes, hashes } = await createRecoveryCodes(2)
    expect(codes).toHaveLength(2)
    expect(hashes).toHaveLength(2)
    expect(hashes.join(' ')).not.toContain(codes[0])

    const firstUse = await consumeRecoveryCode(hashes, codes[0])
    expect(firstUse.valid).toBe(true)
    expect(firstUse.hashes).toHaveLength(1)

    const replay = await consumeRecoveryCode(firstUse.hashes, codes[0])
    expect(replay.valid).toBe(false)
  })

  it('creates a TOTP secret using only RFC 4648 base32 characters', () => {
    const secret = createTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
  })

  it('exempts only enrollment routes from mandatory MFA setup gating', () => {
    expect(isMfaEnrollmentRoute('/api/admin/2fa/setup')).toBe(true)
    expect(isMfaEnrollmentRoute('/api/admin/2fa/verify')).toBe(true)
    expect(isMfaEnrollmentRoute('/api/admin/2fa/status')).toBe(true)
    expect(isMfaEnrollmentRoute('/api/admin/2fa/disable')).toBe(false)
    expect(isMfaEnrollmentRoute('/api/admin/users')).toBe(false)
  })
})
