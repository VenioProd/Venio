import { describe, expect, it } from 'vitest'
import { serializeCommentsForTester, serializeRunsForTester, type SerializableRun } from './serialize.js'

const LEA = 'lea'
const MAX = 'max'

const baseRun = (over: Partial<SerializableRun> = {}): SerializableRun => ({
  _id: 'run1',
  tester: LEA,
  user: null,
  verdict: 'BROKEN',
  severity: 'MAJOR',
  reproducibility: 'ALWAYS',
  status: 'OPEN',
  failedStep: 2,
  title: 'Le bouton envoyer ne repond pas',
  body: 'Mon email perso lea.durand@gmail.test ne recoit rien',
  context: {
    url: 'https://x.test/devis',
    userAgent: 'Safari/17',
    viewportWidth: 390,
    viewportHeight: 844,
    isMobile: true,
  },
  attachments: [{ _id: 'a1', originalName: 'capture.png', mimeType: 'image/png', size: 1000 }],
  confirmations: [MAX],
  scenario: 's1',
  createdAt: new Date('2026-09-01T10:00:00Z'),
  ...over,
})

describe('serializeRunsForTester', () => {
  it('rend son propre retour en entier a son auteur', () => {
    const [mine] = serializeRunsForTester([baseRun()], LEA)
    expect(mine!.mine).toBe(true)
    expect(mine!.body).toContain('lea.durand@gmail.test')
    expect(mine!.attachments).toHaveLength(1)
    expect(mine!.context?.userAgent).toBe('Safari/17')
  })

  it('masque le corps du retour d un autre testeur', () => {
    const [other] = serializeRunsForTester([baseRun()], MAX)
    expect(other!.mine).toBe(false)
    expect(other!.body).toBeUndefined()
    expect(JSON.stringify(other)).not.toContain('lea.durand@gmail.test')
  })

  it('ne laisse jamais filtrer l identite de l auteur d un autre retour', () => {
    const [other] = serializeRunsForTester([baseRun()], MAX)
    expect(JSON.stringify(other)).not.toContain(LEA)
    expect(other).not.toHaveProperty('tester')
    expect(other).not.toHaveProperty('user')
  })

  it('masque le contexte technique d un autre testeur, qui l identifierait', () => {
    const [other] = serializeRunsForTester([baseRun()], MAX)
    expect(other!.context).toBeUndefined()
    expect(other!.attachments).toBeUndefined()
  })

  it('laisse assez d information pour reconnaitre le meme probleme', () => {
    const [other] = serializeRunsForTester([baseRun()], MAX)
    expect(other!.title).toBe('Le bouton envoyer ne repond pas')
    expect(other!.verdict).toBe('BROKEN')
    expect(other!.severity).toBe('MAJOR')
    expect(other!.status).toBe('OPEN')
    expect(other!.failedStep).toBe(2)
  })

  it('compte les confirmations sans nommer ceux qui les ont posees', () => {
    const [other] = serializeRunsForTester([baseRun()], MAX)
    expect(other!.confirmationCount).toBe(1)
    expect(other).not.toHaveProperty('confirmations')
  })

  it('indique au testeur s il a deja confirme ce retour', () => {
    const [seenByMax] = serializeRunsForTester([baseRun()], MAX)
    expect(seenByMax!.confirmedByMe).toBe(true)
    const [seenByOther] = serializeRunsForTester([baseRun()], 'zoe')
    expect(seenByOther!.confirmedByMe).toBe(false)
  })

  it('cache aux testeurs les verdicts rendus par l equipe', () => {
    const internal = baseRun({ _id: 'run2', tester: null, user: 'admin1' })
    expect(serializeRunsForTester([internal], MAX)).toHaveLength(0)
    expect(JSON.stringify(serializeRunsForTester([internal], MAX))).not.toContain('admin1')
  })
})

describe('serializeCommentsForTester', () => {
  const comment = (over: Record<string, unknown> = {}) => ({
    _id: 'c1',
    body: 'On regarde ca',
    visibleToTester: true,
    authorUser: 'admin1',
    authorTester: null,
    createdAt: new Date('2026-09-02T09:00:00Z'),
    ...over,
  })

  it('presente une reponse de l equipe sans nommer l admin', () => {
    const [reply] = serializeCommentsForTester([comment()], LEA)
    expect(reply!.author).toBe('team')
    expect(JSON.stringify(reply)).not.toContain('admin1')
  })

  it('marque comme sien le message du testeur qui regarde', () => {
    const [own] = serializeCommentsForTester([comment({ authorUser: null, authorTester: LEA })], LEA)
    expect(own!.author).toBe('me')
  })

  it('retient les notes internes que l equipe n a pas partagees', () => {
    expect(serializeCommentsForTester([comment({ visibleToTester: false })], LEA)).toHaveLength(0)
  })

  it('ne montre pas le message d un autre testeur', () => {
    expect(serializeCommentsForTester([comment({ authorUser: null, authorTester: MAX })], LEA)).toHaveLength(0)
  })
})
