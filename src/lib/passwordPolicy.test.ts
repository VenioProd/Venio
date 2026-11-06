import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, passwordIssue, passwordStrength } from './passwordPolicy'

const identity = { email: 'jeanne.martin@example.test', name: 'Jeanne Martin' }

describe('politique de mot de passe (miroir navigateur)', () => {
  it('exige 12 caractères', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12)
    expect(passwordIssue('Kx7!pQ2#vL9')).toBe('tooShort')
    expect(passwordIssue('Kx7!pQ2#vL9m')).toBeNull()
  })

  it('refuse les mots de passe courants, les suites et les répétitions', () => {
    for (const weak of ['Password2026!!', 'azerty123456', '123456789012', 'abcdefghijkl', 'aaaaaaaaaaaa']) {
      expect(passwordIssue(weak)).toBe('tooCommon')
    }
  })

  it("refuse l'e-mail ou le nom du compte", () => {
    expect(passwordIssue('jeanne.martin!2026', identity)).toBe('containsIdentity')
    expect(passwordIssue('Super-MARTIN-cle-77', identity)).toBe('containsIdentity')
    expect(passwordIssue('Gentiane-Orbite-58', identity)).toBeNull()
  })

  it('note la robustesse de 0 (hors politique) à 4', () => {
    expect(passwordStrength('')).toBe(0)
    expect(passwordStrength('azerty')).toBe(0)
    expect(passwordStrength('gentianeorbite')).toBeGreaterThanOrEqual(1)
    expect(passwordStrength('Gentiane-Orbite-58-Basalte!')).toBe(4)
  })
})
