import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearScenarioProgress, pickScenarioToResume, readProgress, writeChecked, writeDraft } from './progress'

const TESTER = 'lea'
const SCENARIO = 's1'

beforeEach(() => {
  // Le stub d'un test précédent doit tomber avant qu'on touche au vrai stockage.
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('progression du testeur', () => {
  it('part de rien quand le testeur n a jamais rien coche', () => {
    expect(readProgress(TESTER, SCENARIO)).toEqual({ checked: [], draft: null })
  })

  it('retient les etapes cochees d une session a l autre', () => {
    writeChecked(TESTER, SCENARIO, [1, 3])
    expect(readProgress(TESTER, SCENARIO).checked).toEqual([1, 3])
  })

  it('retient un retour a moitie redige', () => {
    writeDraft(TESTER, SCENARIO, { verdict: 'BROKEN', title: 'Le bouton', body: 'Rien ne se passe' })
    expect(readProgress(TESTER, SCENARIO).draft).toMatchObject({ verdict: 'BROKEN', title: 'Le bouton' })
  })

  it('ne melange pas deux demarches', () => {
    writeChecked(TESTER, 's1', [1])
    writeChecked(TESTER, 's2', [2, 3])
    expect(readProgress(TESTER, 's1').checked).toEqual([1])
    expect(readProgress(TESTER, 's2').checked).toEqual([2, 3])
  })

  it('ne melange pas deux testeurs sur le meme poste', () => {
    writeChecked('lea', SCENARIO, [1])
    writeChecked('max', SCENARIO, [4, 5])
    expect(readProgress('lea', SCENARIO).checked).toEqual([1])
    expect(readProgress('max', SCENARIO).checked).toEqual([4, 5])
  })

  it('oublie tout une fois le verdict rendu', () => {
    writeChecked(TESTER, SCENARIO, [1, 2])
    writeDraft(TESTER, SCENARIO, { verdict: 'WORKS', title: '', body: '' })
    clearScenarioProgress(TESTER, SCENARIO)
    expect(readProgress(TESTER, SCENARIO)).toEqual({ checked: [], draft: null })
  })

  it('survit a un stockage indisponible sans casser la page', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
      removeItem: () => {
        throw new Error('SecurityError')
      },
    })
    expect(() => writeChecked(TESTER, SCENARIO, [1])).not.toThrow()
    expect(readProgress(TESTER, SCENARIO)).toEqual({ checked: [], draft: null })
  })

  it('ignore un contenu corrompu au lieu de planter', () => {
    window.localStorage.setItem('venio-beta:lea:s1', '{pas du json')
    expect(readProgress(TESTER, SCENARIO)).toEqual({ checked: [], draft: null })
  })

  it('ignore des etapes qui ne sont pas des nombres', () => {
    window.localStorage.setItem('venio-beta:lea:s1', JSON.stringify({ checked: ['a', 2, null] }))
    expect(readProgress(TESTER, SCENARIO).checked).toEqual([2])
  })
})

describe('reprendre là où on s’est arrêté', () => {
  const scenarios = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }]

  it('rouvre la demarche commencee plutot que la premiere de la liste', () => {
    expect(pickScenarioToResume(scenarios, new Set(), { b: [1] })).toBe('b')
  })

  it('prefere la premiere non testee quand rien n est commence', () => {
    expect(pickScenarioToResume(scenarios, new Set(['a']), {})).toBe('b')
  })

  it('ignore une demarche commencee puis rendue', () => {
    expect(pickScenarioToResume(scenarios, new Set(['b']), { b: [1] })).toBe('a')
  })

  it('n ouvre rien quand tout a ete rendu', () => {
    expect(pickScenarioToResume(scenarios, new Set(['a', 'b', 'c']), {})).toBeNull()
  })

  it('reprend la plus avancee quand plusieurs sont commencees', () => {
    expect(pickScenarioToResume(scenarios, new Set(), { a: [1], c: [1, 2, 3] })).toBe('c')
  })
})
