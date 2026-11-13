import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { asReqUser, resetCrmSettings, seedTeam, type Team, type TeamMember } from './crm-routes-helpers.js'

/**
 * Réglages du poste d'appel (téléphonie, enregistrement, transcription, analyse) :
 * blocs enregistrés en entier, valeurs bornées, grille de chaleur cohérente.
 */

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = authState.user
    next()
  },
}))

let app: Express
let team: Team
let CrmSettings: typeof import('../models/CrmSettings.js').default

const as = (member: TeamMember | null) => {
  authState.user = member ? asReqUser(member) : null
}

beforeAll(async () => {
  await setupMongo()
  CrmSettings = (await import('../models/CrmSettings.js')).default
  const { default: crmRoutes } = await import('../routes/admin/crm.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/crm', crmRoutes)
})
afterAll(async () => {
  authState.user = null
  await teardownMongo()
})
beforeEach(async () => {
  await clearDb()
  team = await seedTeam()
  await resetCrmSettings()
  as(team.admin)
})

const URL = '/api/admin/crm/settings'
const patch = (body: Record<string, unknown>) => request(app).patch(URL).send(body)

const grid = () => ({
  criteria: [
    { key: 'need', label: 'Besoin', max: 60, description: 'Le prospect décrit un besoin' },
    { key: 'budget', label: 'Budget', max: 30, description: '' },
    { key: 'objection', label: 'Objection', max: -20, description: 'Refus net' },
  ],
  thresholds: { tiede: 20, chaud: 50, tresChaud: 80 },
})
const analysis = (overrides: Record<string, unknown> = {}) => ({
  enabled: true,
  heatGrid: grid(),
  retentionMonths: 6,
  ...overrides,
})
const telephony = () => ({
  callingHours: { timezone: 'Europe/Paris', days: [5, 1, 3], start: '10:00', end: '19:30' },
  attemptCapPerDay: 2,
})

describe('grille de chaleur', () => {
  it('enregistre une grille cohérente en entier', async () => {
    const ok = await patch({ callAnalysis: analysis() }).expect(200)
    expect(ok.body.settings.callAnalysis.heatGrid.criteria).toHaveLength(3)
    expect(ok.body.settings.callAnalysis).toMatchObject({ retentionMonths: 6 })
    const stored = await CrmSettings.findOne().lean()
    expect(stored!.callAnalysis.heatGrid.thresholds).toMatchObject({ tiede: 20, chaud: 50, tresChaud: 80 })
  })

  it('refuse une grille incohérente, sans rien écrire', async () => {
    const bad: Array<[string, Record<string, unknown>]> = [
      ['clé en double', { criteria: [...grid().criteria, { ...grid().criteria[0] }], thresholds: grid().thresholds }],
      ['maximum nul', { criteria: [{ key: 'a', label: 'A', max: 0, description: '' }], thresholds: grid().thresholds }],
      ['seuils non croissants', { criteria: grid().criteria, thresholds: { tiede: 50, chaud: 40, tresChaud: 80 } }],
      ['aucun critère', { criteria: [], thresholds: grid().thresholds }],
      [
        'très chaud inatteignable',
        { criteria: [{ key: 'a', label: 'A', max: 40, description: '' }], thresholds: grid().thresholds },
      ],
      [
        'libellé vide',
        { criteria: [{ key: 'a', label: '  ', max: 90, description: '' }], thresholds: grid().thresholds },
      ],
    ]
    for (const [name, heatGrid] of bad) {
      const res = await patch({ callAnalysis: analysis({ heatGrid }) })
      expect(res.status, name).toBe(400)
      expect(res.body.field, name).toMatch(/^callAnalysis\./)
    }
    const stored = await CrmSettings.findOne().lean()
    expect(stored!.callAnalysis.heatGrid.criteria).toHaveLength(6)
    expect(stored!.callAnalysis.heatGrid.thresholds.tresChaud).toBe(75)
  })
})

describe('blocs entiers', () => {
  it('refuse un réglage par chemin pointé, quel que soit le bloc', async () => {
    for (const key of [
      'telephony.attemptCapPerDay',
      'telephony.callingHours.start',
      'callRecording.enabled',
      'callTranscription.language',
      'callAnalysis.enabled',
      'callAnalysis.heatGrid.thresholds.tiede',
    ]) {
      const res = await patch({ [key]: 5 }).expect(400)
      expect(res.body.error).toContain('se modifie en entier')
    }
    expect((await CrmSettings.findOne().lean())!.telephony.attemptCapPerDay).toBe(3)
  })

  it('refuse un bloc partiel, une clé inconnue et un mauvais type', async () => {
    await patch({ telephony: { attemptCapPerDay: 5 } }).expect(400)
    await patch({ telephony: { ...telephony(), extra: 1 } }).expect(400)
    await patch({ callAnalysis: { enabled: true } }).expect(400)
    await patch({ callAnalysis: 'oui' }).expect(400)
    await patch({ callTranscription: { enabled: 'oui', language: 'fr', retentionMonths: 12 } }).expect(400)
    const stored = await CrmSettings.findOne().lean()
    expect(stored!.telephony.callingHours.start).toBe('09:00')
  })
})

describe('téléphonie', () => {
  it('enregistre la plage, trie les jours et refuse les valeurs incohérentes', async () => {
    const ok = await patch({ telephony: telephony() }).expect(200)
    expect(ok.body.settings.telephony.callingHours.days).toEqual([1, 3, 5])
    expect(ok.body.settings.telephony).toMatchObject({ attemptCapPerDay: 2 })
    const variants: Array<Record<string, unknown>> = [
      { ...telephony(), attemptCapPerDay: 0 },
      { ...telephony(), attemptCapPerDay: 21 },
      { ...telephony(), attemptCapPerDay: 2.5 },
      { ...telephony(), callingHours: { ...telephony().callingHours, days: [] } },
      { ...telephony(), callingHours: { ...telephony().callingHours, days: [1, 1] } },
      { ...telephony(), callingHours: { ...telephony().callingHours, days: [7] } },
      { ...telephony(), callingHours: { ...telephony().callingHours, start: '20:00', end: '09:00' } },
      { ...telephony(), callingHours: { ...telephony().callingHours, start: '9h', end: '20:00' } },
      { ...telephony(), callingHours: { ...telephony().callingHours, timezone: 'Mars/Olympus' } },
    ]
    for (const body of variants) await patch({ telephony: body }).expect(400)
    expect((await CrmSettings.findOne().lean())!.telephony.attemptCapPerDay).toBe(2)
  })
})

describe('enregistrement et transcription', () => {
  const recording = (overrides: Record<string, unknown> = {}) => ({
    enabled: true,
    notice: { enabled: true, text: 'Cet appel est enregistré.' },
    keepAudioDays: 30,
    ...overrides,
  })

  it('valide l’enregistrement (le modèle arrive avec un autre lot : on ne vérifie que le contrôle)', async () => {
    await patch({ callRecording: recording() }).expect(200)
    await patch({ callRecording: recording({ keepAudioDays: -1 }) }).expect(400)
    await patch({ callRecording: recording({ keepAudioDays: 181 }) }).expect(400)
    await patch({ callRecording: recording({ keepAudioDays: 1.5 }) }).expect(400)
    await patch({ callRecording: recording({ notice: { enabled: true, text: '   ' } }) }).expect(400)
    await patch({ callRecording: recording({ notice: { enabled: true, text: 'x'.repeat(301) } }) }).expect(400)
    // Sans annonce, le texte peut rester vide.
    await patch({ callRecording: recording({ notice: { enabled: false, text: '' } }) }).expect(200)
  })

  it('valide la transcription', async () => {
    const ok = await patch({ callTranscription: { enabled: false, language: 'EN_US', retentionMonths: 24 } }).expect(
      200,
    )
    expect(ok.body.settings.callTranscription).toMatchObject({ enabled: false, language: 'en_us', retentionMonths: 24 })
    await patch({ callTranscription: { enabled: true, language: 'français', retentionMonths: 12 } }).expect(400)
    await patch({ callTranscription: { enabled: true, language: 'fr', retentionMonths: 37 } }).expect(400)
    await patch({ callTranscription: { enabled: true, language: 'fr', retentionMonths: 0 } }).expect(400)
    // Transcription en direct (lot J) : facultative, absente = coupée.
    expect(ok.body.settings.callTranscription.live).toBe(false)
    const live = await patch({ callTranscription: { enabled: true, language: 'fr', retentionMonths: 12, live: true } })
    expect(live.body.settings.callTranscription.live).toBe(true)
    await patch({ callTranscription: { enabled: true, language: 'fr', retentionMonths: 12, live: 'oui' } }).expect(400)
  })
})

describe('droits et état du serveur', () => {
  it('un non-administrateur du CRM ne modifie aucun de ces blocs', async () => {
    as(team.manager)
    await patch({ telephony: telephony() }).expect(403)
    await patch({ callAnalysis: analysis() }).expect(403)
    expect((await CrmSettings.findOne().lean())!.telephony.attemptCapPerDay).toBe(3)
  })

  it('GET indique ce que ce serveur sait faire, sans rien révéler des clés', async () => {
    const env = ['TWILIO_ACCOUNT_SID', 'ASSEMBLYAI_API_KEY', 'ANTHROPIC_API_KEY'] as const
    const saved = env.map((name) => process.env[name])
    try {
      for (const name of env) delete process.env[name]
      const off = await request(app).get(URL).expect(200)
      expect(off.body.providers).toEqual({ telephony: false, transcription: false, analysis: false })
      process.env.ASSEMBLYAI_API_KEY = 'cle-de-test'
      process.env.ANTHROPIC_API_KEY = 'cle-de-test'
      const on = await request(app).get(URL).expect(200)
      expect(on.body.providers).toEqual({ telephony: false, transcription: true, analysis: true })
      expect(JSON.stringify(on.body)).not.toContain('cle-de-test')
    } finally {
      env.forEach((name, i) => (saved[i] === undefined ? delete process.env[name] : (process.env[name] = saved[i])))
    }
  })
})
