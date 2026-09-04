import { describe, expect, it } from 'vitest'
import { sanitizeReportedUrl } from './sanitizeUrl.js'

describe('sanitizeReportedUrl', () => {
  it('refuse une URL qui porte le lien secret d un testeur', () => {
    expect(sanitizeReportedUrl('https://venio.paris/beta/xo8RLoJ3GQvbp8w93O49MC9jOVXTuWEPBttGW9AKE8Y')).toBeNull()
  })

  it('refuse aussi quand le lien est suivi d autre chose', () => {
    expect(
      sanitizeReportedUrl('http://localhost:5501/beta/xo8RLoJ3GQvbp8w93O49MC9jOVXTuWEPBttGW9AKE8Y?x=1#bas'),
    ).toBeNull()
  })

  it('laisse passer l URL du site reellement teste', () => {
    expect(sanitizeReportedUrl('https://exemple.fr/contact')).toBe('https://exemple.fr/contact')
  })

  it('retire un jeton glisse dans la query ou le fragment', () => {
    expect(sanitizeReportedUrl('https://exemple.fr/contact?token=abc123')).toBe('https://exemple.fr/contact')
    expect(sanitizeReportedUrl('https://exemple.fr/contact?utm=x#section')).toBe('https://exemple.fr/contact?utm=x')
  })

  it('refuse ce qui n est pas une adresse http', () => {
    expect(sanitizeReportedUrl('javascript:alert(1)')).toBeNull()
    expect(sanitizeReportedUrl('pas une url')).toBeNull()
    expect(sanitizeReportedUrl('')).toBeNull()
    expect(sanitizeReportedUrl(null)).toBeNull()
    expect(sanitizeReportedUrl(42)).toBeNull()
  })

  it('borne la longueur conservee', () => {
    const long = `https://exemple.fr/${'a'.repeat(900)}`
    expect(sanitizeReportedUrl(long)!.length).toBeLessThanOrEqual(500)
  })
})
