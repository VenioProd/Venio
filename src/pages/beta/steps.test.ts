import { describe, expect, it } from 'vitest'
import { splitPreconditions, toReadableStep } from './steps'

const step = (expected: string) => toReadableStep({ order: 1, instruction: 'Ouvrir /login', expected })

describe('toReadableStep', () => {
  it('laisse intact un attendu ordinaire', () => {
    const s = step('Le formulaire s’affiche')
    expect(s.expected).toBe('Le formulaire s’affiche')
    expect(s.watchOut).toBeNull()
  })

  it('sort le piege du resultat attendu', () => {
    const s = step('Les offres sont à jour. PIÈGE : les CGV servies ont une autre version.')
    expect(s.expected).toBe('Les offres sont à jour')
    expect(s.watchOut).toBe('les CGV servies ont une autre version.')
  })

  it('reconnait le piege en tete d attendu', () => {
    const s = step('PIÈGE : un compte de démo peut masquer le vrai comportement.')
    expect(s.expected).toBe('')
    expect(s.watchOut).toBe('un compte de démo peut masquer le vrai comportement.')
  })

  it('tolere les variantes d ecriture', () => {
    expect(step('Rien. PIEGE : sans accent').watchOut).toBe('sans accent')
    expect(step('Rien. attention : en minuscules').watchOut).toBe('en minuscules')
  })

  it('ne se declenche pas sur le mot piege employe normalement', () => {
    const s = step('Le formulaire évite le piège classique du double envoi')
    expect(s.watchOut).toBeNull()
    expect(s.expected).toBe('Le formulaire évite le piège classique du double envoi')
  })

  it('supporte un attendu vide', () => {
    expect(step('').expected).toBe('')
    expect(step('').watchOut).toBeNull()
  })
})

describe('splitPreconditions', () => {
  it('isole une consigne de posture du reste de la description', () => {
    const { intro, conditions } = splitPreconditions(
      'Le cœur d’usage quotidien. À faire au moins une fois sur téléphone.',
    )
    expect(intro).toBe('Le cœur d’usage quotidien.')
    expect(conditions).toEqual(['À faire au moins une fois sur téléphone.'])
  })

  it('en reconnait plusieurs', () => {
    const { conditions } = splitPreconditions(
      'Contexte neutre. À faire avec un compte neuf. Ne pas réutiliser une session admin.',
    )
    expect(conditions).toHaveLength(2)
  })

  it('rend une description ordinaire telle quelle', () => {
    const { intro, conditions } = splitPreconditions('Simple description sans consigne particulière.')
    expect(intro).toBe('Simple description sans consigne particulière.')
    expect(conditions).toEqual([])
  })

  it('supporte une description vide', () => {
    expect(splitPreconditions('')).toEqual({ intro: '', conditions: [] })
  })
})
