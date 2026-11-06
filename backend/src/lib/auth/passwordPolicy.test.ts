import { describe, expect, it } from 'vitest'
import {
  checkPasswordPolicy,
  MIN_PASSWORD_LENGTH,
  passwordNeedsUpgrade,
  passwordPolicyError,
} from './passwordPolicy.js'

const identity = { email: 'jeanne.martin@example.test', name: 'Jeanne Martin' }

function codeOf(password: unknown, who: { email?: string; name?: string } = identity) {
  const verdict = checkPasswordPolicy(password, who)
  return verdict.ok ? 'OK' : verdict.code
}

describe('password policy (VENIO-117)', () => {
  it('requires at least 12 characters', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12)
    expect(codeOf('Kx7!pQ2#vL9')).toBe('PASSWORD_TOO_SHORT')
    expect(codeOf('Kx7!pQ2#vL9m')).toBe('OK')
    expect(codeOf('')).toBe('PASSWORD_REQUIRED')
    expect(codeOf(undefined)).toBe('PASSWORD_REQUIRED')
    expect(codeOf('x'.repeat(129))).toBe('PASSWORD_TOO_LONG')
  })

  it('counts characters rather than UTF-16 units', () => {
    expect(codeOf('🦊🦊🦊🦊🦊🦊🌲🌲🌲🌲🌲')).toBe('PASSWORD_TOO_SHORT')
  })

  it('rejects the most common passwords and their decorated variants', () => {
    for (const weak of [
      'password1234',
      'Password2026!!',
      'motdepasse123',
      'Azerty123456',
      'qwertyuiop12',
      '123456789012',
      'Admin2026!Admin',
      'Bienvenue2026',
      'Venio-2026-2026',
    ]) {
      expect(codeOf(weak)).toBe('PASSWORD_TOO_COMMON')
    }
  })

  it('rejects sequences and repetitions', () => {
    expect(codeOf('abcdefghijkl')).toBe('PASSWORD_TOO_COMMON')
    expect(codeOf('987654321098')).toBe('PASSWORD_TOO_COMMON')
    expect(codeOf('aaaaaaaaaaaa')).toBe('PASSWORD_TOO_COMMON')
    expect(codeOf('abababababab')).toBe('PASSWORD_TOO_COMMON')
  })

  it("rejects passwords containing the account's e-mail or name, accents and case ignored", () => {
    expect(codeOf('jeanne.martin!2026')).toBe('PASSWORD_CONTAINS_IDENTITY')
    expect(codeOf('Super-MARTIN-cle-77')).toBe('PASSWORD_CONTAINS_IDENTITY')
    expect(codeOf('JéAnNe-du-77-sud', identity)).toBe('PASSWORD_CONTAINS_IDENTITY')
    expect(codeOf('Gentiane-Orbite-58')).toBe('OK')
    // Sans identité connue, seul le contrôle générique s'applique.
    expect(codeOf('jeanne.martin!2026', {})).toBe('OK')
  })

  it('accepts long passphrases', () => {
    expect(codeOf('cheval correct agrafe pile')).toBe('OK')
  })

  it('flags weak existing passwords for upgrade and builds an HTTP error body', () => {
    expect(passwordNeedsUpgrade('azerty', identity)).toBe(true)
    expect(passwordNeedsUpgrade('Gentiane-Orbite-58', identity)).toBe(false)
    expect(passwordPolicyError('court', identity)).toEqual({
      code: 'PASSWORD_TOO_SHORT',
      error: 'Le mot de passe doit contenir au moins 12 caractères.',
    })
    expect(passwordPolicyError('Gentiane-Orbite-58', identity)).toBeNull()
  })
})
