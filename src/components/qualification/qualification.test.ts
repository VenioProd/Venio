import { describe, expect, it } from 'vitest'
import {
  initialState,
  isValidUrl,
  normalizeUrl,
  note,
  parsePreset,
  reco,
  releve,
  toPayload,
  toQualification,
  validateStep,
  MSG,
} from './qualification'
import type { QualificationState } from './qualification'

const withState = (p: Partial<QualificationState>): QualificationState => ({ ...initialState(), ...p })

describe('reco', () => {
  it('reste vide sans besoin', () => {
    expect(reco(initialState())).toEqual([])
  })

  it('propose la formule choisie pour un site, sinon une piste générique', () => {
    expect(reco(withState({ need: ['site'] }))).toEqual(['Site web'])
    expect(reco(withState({ need: ['refonte'] }))).toEqual(['Refonte du site'])
    expect(reco(withState({ need: ['site'], formule: 'business' }))).toEqual(['Site · formule Business'])
  })

  it('déduit les pistes de communication des points de blocage', () => {
    expect(reco(withState({ need: ['com'], pain: ['clair', 'reseaux', 'pub'] }))).toEqual([
      'Diagnostic de communication',
      'Positionnement et messages',
      'Plan de communication',
      'Acquisition et mesure',
    ])
  })

  it('ajoute le développement sur mesure pour un outil ou la formule Sur mesure, sans doublon', () => {
    expect(reco(withState({ need: ['outil'] }))).toEqual(['Développement sur mesure'])
    expect(reco(withState({ need: ['site', 'outil'], formule: 'mesure' }))).toEqual([
      'Site · formule Sur mesure',
      'Développement sur mesure',
    ])
  })

  it('couvre la marque et le besoin flou', () => {
    expect(reco(withState({ need: ['marque', 'flou'] }))).toEqual([
      'Marque : nom, voix, système',
      'Conseil : un état des lieux écrit',
    ])
  })
})

describe('note (remarques franches)', () => {
  it('prévient qu’un petit budget ne suffit pas pour un outil ou une grosse formule', () => {
    expect(note(withState({ need: ['outil'], budget: 'b1' }))).toContain('un outil du marché')
    expect(note(withState({ need: ['site'], formule: 'boutique', budget: 'b1' }))).toContain('un outil du marché')
    expect(note(withState({ need: ['site'], formule: 'vitrine', budget: 'b1' }))).toBe('')
  })

  it('recommande le diagnostic avant la publicité quand le budget est court', () => {
    expect(note(withState({ need: ['com'], pain: ['pub'], budget: 'b1' }))).toContain('on commence par le diagnostic')
  })

  it('reste honnête sur l’urgence et sur un budget inconnu', () => {
    expect(note(withState({ quand: 'urgent' }))).toContain("Moins d'un mois")
    expect(note(withState({ budget: 'b0' }))).toContain('prix ferme')
    expect(note(withState({ budget: 'b3', quand: '3m' }))).toBe('')
  })
})

describe('releve', () => {
  it('résume les réponses et laisse les lignes vides à « — »', () => {
    const rows = releve(
      withState({
        need: ['site', 'com'],
        formule: 'vitrine',
        pain: ['clair', 'pub'],
        taille: '2-10',
        activite: ' Cabinet ',
      }),
    )
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]))
    expect(byLabel.Besoin).toBe('Un nouveau site, Mieux communiquer')
    expect(byLabel['Précisions']).toBe('Site : Vitrine · 2 points de blocage')
    expect(byLabel.Entreprise).toBe('Cabinet · 2 à 10 personnes')
    expect(byLabel.Budget).toBe('')
  })
})

describe('validation', () => {
  it('exige au moins un besoin à l’étape 1', () => {
    expect(validateStep(0, initialState())).toEqual({ message: MSG.need, fields: [] })
    expect(validateStep(0, withState({ need: ['flou'] }))).toBeNull()
  })

  it('valide les coordonnées dans l’ordre : prénom, e-mail, consentement', () => {
    expect(validateStep(4, withState({}))?.message).toBe(MSG.prenom)
    expect(validateStep(4, withState({ prenom: 'Ana', email: 'ana@exemple' }))).toEqual({
      message: MSG.email,
      fields: ['email'],
    })
    expect(validateStep(4, withState({ prenom: 'Ana', email: 'ana@exemple.fr' }))?.message).toBe(MSG.consent)
    expect(validateStep(4, withState({ prenom: 'Ana', email: 'ana@exemple.fr', consent: true }))).toBeNull()
  })

  it('signale les deux champs en défaut quand prénom et e-mail manquent', () => {
    expect(validateStep(4, withState({ consent: true }))?.fields).toEqual(['prenom', 'email'])
  })

  it('accepte une adresse de site sans protocole mais refuse un texte quelconque', () => {
    expect(isValidUrl('')).toBe(true)
    expect(isValidUrl('exemple.fr')).toBe(true)
    expect(isValidUrl('https://exemple.fr/page')).toBe(true)
    expect(isValidUrl('pas une adresse')).toBe(false)
    expect(isValidUrl('javascript:alert(1)')).toBe(false)
    expect(normalizeUrl(' exemple.fr ')).toBe('https://exemple.fr')
    expect(validateStep(1, withState({ siteUrl: 'n importe quoi' }))?.fields).toEqual(['siteUrl'])
  })
})

describe('parsePreset', () => {
  it('lit les besoins séparés par des virgules et ignore l’inconnu et les doublons', () => {
    expect(parsePreset('?besoin=site,com,nimporte,site')).toEqual({ need: ['site', 'com'], formule: null })
  })

  it('coche « site » quand seule une formule est fournie', () => {
    expect(parsePreset('?formule=business')).toEqual({ need: ['site'], formule: 'business' })
    expect(parsePreset('?besoin=outil&formule=mesure')).toEqual({ need: ['site', 'outil'], formule: 'mesure' })
    expect(parsePreset('?formule=inconnue')).toEqual({ need: [], formule: null })
  })
})

describe('payload', () => {
  it('ne garde que les réponses des besoins encore cochés', () => {
    const q = toQualification(
      withState({
        need: ['com'],
        formule: 'business',
        pain: ['pub'],
        marque: 'nom',
        outilnow: ['papier'],
        flou: 'bla',
        budget: 'b2',
        siteUrl: 'exemple.fr',
      }),
    )
    expect(q).toEqual({ need: ['com'], pain: ['pub'], budget: 'b2', siteUrl: 'https://exemple.fr' })
  })

  it('assemble un payload compatible avec POST /api/contact', () => {
    const payload = toPayload(
      withState({ need: ['site', 'outil'], prenom: ' Ana ', nom: '', email: ' ana@exemple.fr ', consent: true }),
      { startedAt: 42, website: '' },
    )
    expect(payload).toMatchObject({
      firstName: 'Ana',
      lastName: '',
      email: 'ana@exemple.fr',
      phone: '',
      subject: 'Qualification : Un nouveau site, Un outil métier',
      consent: true,
      website: '',
      startedAt: 42,
      qualification: { need: ['site', 'outil'] },
    })
  })
})
