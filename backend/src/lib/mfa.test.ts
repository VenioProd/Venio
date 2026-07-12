import { describe, expect, it } from 'vitest'
import { consumeRecoveryCode, createRecoveryCodes, isMfaEnrollmentRoute, requiresMfa } from './mfa.js'

describe('MFA helpers', () => {
  it('requires MFA only for privileged administrator roles', () => {
    expect(requiresMfa('SUPER_ADMIN')).toBe(true)
    expect(requiresMfa('ADMIN')).toBe(true)
    expect(requiresMfa('MANAGER')).toBe(false)
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

  it('exempts only enrollment routes from mandatory MFA setup gating', () => {
    expect(isMfaEnrollmentRoute('/api/admin/2fa/setup')).toBe(true)
    expect(isMfaEnrollmentRoute('/api/admin/2fa/verify')).toBe(true)
    expect(isMfaEnrollmentRoute('/api/admin/2fa/status')).toBe(true)
    expect(isMfaEnrollmentRoute('/api/admin/2fa/disable')).toBe(false)
    expect(isMfaEnrollmentRoute('/api/admin/users')).toBe(false)
  })
})
