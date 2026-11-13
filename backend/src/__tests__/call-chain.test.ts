import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import twilio from 'twilio'
import { setupMongoReplSet, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import commercialRoutes from '../routes/commercial/index.js'
import adminCallDeskRoutes from '../routes/admin/callDesk.js'
import adminCrmRoutes from '../routes/admin/crm.js'
import telephonyRoutes from '../routes/telephony/index.js'
import { deleteProviderRecording, fetchProviderRecording, stopProviderRecording } from '../lib/telephony/rest.js'
import { startCallPipeline, sweepRecordings } from '../lib/telephony/recording.js'
import { sweepTranscriptions } from '../lib/transcription/index.js'
import Call from '../models/Call.js'
import CallAnalysis from '../models/CallAnalysis.js'
import CallTranscript from '../models/CallTranscript.js'
import CrmSettings from '../models/CrmSettings.js'
import Interaction from '../models/Interaction.js'
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import PersonalTask from '../models/PersonalTask.js'
import SuppressionEntry from '../models/SuppressionEntry.js'
import SyncTombstone from '../models/SyncTombstone.js'
import User from '../models/User.js'
import UserIdempotencyKey from '../models/UserIdempotencyKey.js'

/**
 * Recette de bout en bout du poste d'appel (lot H) : les routes réelles, du
 * lancement d'un appel jusqu'à la fiche mise à jour. Fournisseurs simulés en
 * local : Twilio (signatures calculées avec un faux jeton, API REST simulée),
 * AssemblyAI (faux `fetch` par chemin), Claude (faux service Messages sur
 * 127.0.0.1, le vrai SDK et son parseur sont exercés).
 */

vi.mock('../lib/notifyHelpers.js', () => ({
  notifyUsers: vi.fn().mockResolvedValue(undefined),
  notifySuperAdmins: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/telephony/rest.js', () => ({
  hangupProviderCall: vi.fn(),
  stopProviderRecording: vi.fn(),
  deleteProviderRecording: vi.fn(),
  fetchProviderRecording: vi.fn(),
}))

const PUBLIC_URL = 'https://venio.test'
const AUTH_TOKEN = 'test-auth-token'
const ENV = {
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_API_KEY_SID: 'SKtest',
  TWILIO_API_KEY_SECRET: 'test-api-secret',
  TWILIO_AUTH_TOKEN: AUTH_TOKEN,
  TWILIO_TWIML_APP_SID: 'APtest',
  TWILIO_CALLER_ID: '+33180000000',
  TELEPHONY_PUBLIC_URL: PUBLIC_URL,
  ASSEMBLYAI_API_KEY: 'test-key',
  ANTHROPIC_API_KEY: 'sk-ant-test-simule',
}
// Mardi 10 h à Paris : dans la plage d'appel par défaut.
const TUESDAY_10H = new Date('2026-11-10T09:00:00Z')
const DAY_MS = 86_400_000
const AUDIO = Buffer.from('ID3-audio-de-test-0123456789')

const app = express()
app.use('/api/telephony', telephonyRoutes)
app.use(express.json())
app.use('/api/commercial', commercialRoutes)
app.use('/api/admin/call-desk', adminCallDeskRoutes)
app.use('/api/admin/crm', adminCrmRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

// ── Faux AssemblyAI : un travail par appel, terminé quand le test le décide ──
const UTTERANCES = [
  { channel: '1', start: 0, end: 3000, text: 'Bonjour, ici Venio. Vous avez un projet de site ?' },
  { channel: '2', start: 3000, end: 9000, text: 'Oui, on veut refondre notre boutique en ligne.' },
  { channel: '2', start: 9000, end: 13000, text: 'On a prévu un budget de 15 000 euros.' },
  { channel: '2', start: 13000, end: 16000, text: "C'est moi qui signe de toute façon." },
]
let jobs: Map<string, 'processing' | 'completed'>
let assemblyCalls: string[]
const realFetch = globalThis.fetch
const fetchMock = vi.fn(async (input: string | URL | globalThis.Request, init: RequestInit = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (url.hostname !== 'api.eu.assemblyai.com') return realFetch(input, init)
  const key = `${init.method ?? 'GET'} ${url.pathname}`
  assemblyCalls.push(key)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  if (key === 'POST /v2/upload') return json({ upload_url: 'https://cdn.example/u/1' })
  if (key === 'POST /v2/transcript') {
    const id = `job-${jobs.size + 1}`
    jobs.set(id, 'processing')
    return json({ id })
  }
  const id = url.pathname.split('/').pop()!
  if (key.startsWith('DELETE ')) return json({})
  if (jobs.get(id) !== 'completed') return json({ status: 'processing' })
  return json({ status: 'completed', audio_duration: 16, utterances: UTTERANCES })
})
const finishTranscripts = async () => {
  for (const id of jobs.keys()) jobs.set(id, 'completed')
  await sweepTranscriptions()
}

// ── Faux service Messages de Claude ──
const later = () => new Date(Date.now() + 3 * DAY_MS).toISOString()
const modelOutput = () => ({
  summary: 'Refonte de boutique en ligne, budget 15 k€, décideur au bout du fil.',
  suggestedOutcome: null,
  optOut: { detected: false, quote: null },
  fields: [
    { key: 'budget', value: 15000, confidence: 'HIGH', quote: 'On a prévu un budget de 15 000 euros.' },
    {
      key: 'qualification.need',
      value: 'Refonte de la boutique',
      confidence: 'HIGH',
      quote: 'refondre notre boutique',
    },
    { key: 'sector', value: 'Commerce en ligne', confidence: 'MEDIUM', quote: 'notre boutique en ligne' },
  ],
  heat: {
    criteria: [
      { key: 'need', points: 25, quote: 'refondre notre boutique en ligne' },
      { key: 'budget', points: 15, quote: 'budget de 15 000 euros' },
      { key: 'decisionMaker', points: 15, quote: "C'est moi qui signe" },
    ],
  },
  actions: [{ type: 'CALL', label: 'Rappeler pour le rendez-vous', dueAt: later(), reason: 'Rappel convenu' }],
})
let claudeRequests = 0
const claude = http.createServer((req, res) => {
  req.resume()
  req.on('end', () => {
    claudeRequests += 1
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        id: `msg_${claudeRequests}`,
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: JSON.stringify(modelOutput()) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
    )
  })
})

// ── Acteurs ──
type Who = { id: string; cookie: string }
let rep: Who
let admin: Who
const space = (base: '/api/commercial' | '/api/admin/call-desk' | '/api/admin/crm', who: Who) => ({
  get: (path: string) => request(app).get(`${base}${path}`).set('Cookie', who.cookie),
  post: (path: string, body: object = {}) => request(app).post(`${base}${path}`).set('Cookie', who.cookie).send(body),
  patch: (path: string, body: object) => request(app).patch(`${base}${path}`).set('Cookie', who.cookie).send(body),
})
const commercial = (who: Who) => space('/api/commercial', who)
const team = (who: Who) => space('/api/admin/call-desk', who)

// ── Ce que fait Twilio, requêtes signées avec le faux jeton ──
const twilioPost = (path: string, params: Record<string, string>) =>
  request(app)
    .post(`/api/telephony/twilio${path}`)
    .type('form')
    .set(
      'X-Twilio-Signature',
      twilio.getExpectedTwilioSignature(AUTH_TOKEN, `${PUBLIC_URL}/api/telephony/twilio${path}`, params),
    )
    .send(params)

/** Un appel passé par le navigateur, côté opérateur : mise en relation, décroche, enregistrement. */
async function dial(who: Who, callId: string) {
  const parent = `CA${callId.slice(-10)}`
  const child = `CB${callId.slice(-10)}`
  const voice = await twilioPost('/voice', { CallSid: parent, From: `client:u_${who.id}`, To: '', callId }).expect(200)
  const state = (CallStatus: string, extra: Record<string, string> = {}) =>
    twilioPost(`/status?callId=${callId}`, { CallSid: child, ParentCallSid: parent, CallStatus, ...extra }).expect(204)
  const recording = (RecordingStatus: string) =>
    twilioPost(`/recording?callId=${callId}`, {
      AccountSid: 'ACtest',
      CallSid: parent,
      RecordingSid: `RE${callId.slice(-10)}`,
      RecordingStatus,
      RecordingChannels: '2',
      ...(RecordingStatus === 'completed' ? { RecordingDuration: '95' } : {}),
    }).expect(204)
  await state('ringing')
  await state('in-progress')
  await recording('in-progress')
  return {
    twiml: voice.text,
    recordingSid: `RE${callId.slice(-10)}`,
    hangUp: async () => {
      await state('completed', { CallDuration: '95' })
      await recording('completed')
    },
  }
}

/** Lancement par l'écran, appel opérateur, fin, transcript puis analyse prête. */
async function callThrough(base: typeof commercial, who: Who, leadId: string) {
  const launched = await base(who).post(`/leads/${leadId}/calls`, { clientRequestId: crypto.randomUUID() }).expect(201)
  const callId = String(launched.body.callId)
  const operator = await dial(who, callId)
  expect((await base(who).get(`/calls/${callId}`)).body).toMatchObject({
    status: 'IN_PROGRESS',
    recording: { status: 'RECORDING', objection: false },
  })
  await operator.hangUp()
  await vi.waitFor(async () =>
    expect((await CallTranscript.findOne({ call: callId }).lean())?.status).toBe('PROCESSING'),
  )
  await finishTranscripts()
  await vi.waitFor(async () => expect((await CallAnalysis.findOne({ call: callId }).lean())?.status).toBe('READY'))
  return { callId, ...operator }
}

/** Ce qu'envoie l'écran de relecture : tout accepter sauf ce qui n'est pas acceptable. */
function applyAll(
  analysis: { output: { fields: Array<{ key: string }>; actions: Array<{ id: string }> } },
  keys: string[],
) {
  return {
    clientRequestId: crypto.randomUUID(),
    fields: analysis.output.fields.map((field) => ({
      key: field.key,
      action: keys.includes(field.key) ? 'ACCEPT' : 'IGNORE',
    })),
    heat: { action: 'ACCEPT' },
    actions: analysis.output.actions.map((action) => ({ id: action.id, action: 'ACCEPT' })),
  }
}

beforeAll(async () => {
  await setupMongoReplSet()
  await Promise.all(
    [
      Lead,
      Call,
      CallAnalysis,
      CallTranscript,
      Interaction,
      LeadActivity,
      PersonalTask,
      SuppressionEntry,
      CrmSettings,
      UserIdempotencyKey,
      SyncTombstone,
    ].map((model) => (model as typeof Lead).init()),
  )
  await new Promise<void>((resolve) => claude.listen(0, '127.0.0.1', resolve))
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(claude.address() as AddressInfo).port}`
  vi.stubGlobal('fetch', fetchMock)
  startCallPipeline()
})
afterAll(async () => {
  vi.unstubAllGlobals()
  delete process.env.ANTHROPIC_BASE_URL
  await new Promise((resolve) => claude.close(resolve))
  await teardownMongo()
})
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: TUESDAY_10H })
  Object.assign(process.env, ENV)
  vi.mocked(stopProviderRecording).mockReset().mockResolvedValue(undefined)
  vi.mocked(deleteProviderRecording).mockReset().mockResolvedValue(undefined)
  vi.mocked(fetchProviderRecording).mockReset().mockResolvedValue(AUDIO)
  jobs = new Map()
  assemblyCalls = []
  claudeRequests = 0
  await clearDb()
  const users = await User.create([
    { name: 'Rita Externe', email: 'rita@chaine.test', passwordHash: 'unused', role: 'COMMERCIAL_EXTERNE' },
    { name: 'Alice Closer', email: 'alice@chaine.test', passwordHash: 'unused', role: 'ADMIN' },
  ])
  ;[rep, admin] = await Promise.all(
    users.map(async (user) => ({
      id: String(user._id),
      cookie: `venio_session=${(await createSession(String(user._id))).token}`,
    })),
  )
  await CrmSettings.updateSettings({ defaultCloserId: admin.id } as never)
})
afterEach(() => {
  vi.useRealTimers()
  for (const key of Object.keys(ENV)) delete process.env[key]
})

const newLead = () =>
  Lead.create({
    company: 'Boutique Alpha',
    businessContact: true,
    contactName: 'Mme Alpha',
    contactPhone: '06 12 34 56 78',
    externalRep: rep.id,
    assignedTo: rep.id,
    createdBy: rep.id,
    status: 'CONTACTED',
  })

it('externe : appel, mise en relation, transcript, analyse, validation ; fiche mise à jour, historique écrit, audio effacé', async () => {
  const lead = await newLead()
  const leadId = String(lead._id)
  const { callId, twiml, recordingSid } = await callThrough(commercial, rep, leadId)
  // Le numéro vient de la fiche ; l'annonce d'enregistrement et la double piste sont demandées.
  expect(twiml).toContain('<Number')
  expect(twiml).toContain('+33612345678</Number>')
  expect(twiml).toContain('record="record-from-answer-dual"')
  expect(twiml).toContain(`/api/telephony/twilio/notice?callId=${callId}`)

  // Ce que lit l'écran après l'appel : état final, résultat consigné relié à l'appel.
  expect((await commercial(rep).get(`/calls/${callId}`)).body).toMatchObject({
    status: 'COMPLETED',
    durationSec: 95,
    recording: { status: 'DELETED', objection: false },
  })
  const outcome = await commercial(rep)
    .post(`/leads/${leadId}/quick-call`, {
      clientRequestId: crypto.randomUUID(),
      outcome: 'CALLBACK',
      nextActionAt: later(),
      callId,
    })
    .expect(201)
  expect((await Call.findById(callId).lean())!.interaction).toEqual(
    (await Interaction.findById(outcome.body.interactionId).lean())!._id,
  )
  expect((await Interaction.findById(outcome.body.interactionId).lean())!.durationSec).toBe(95)

  // Liste, transcript, analyse : les formes que les écrans lisent.
  const list = (await commercial(rep).get(`/leads/${leadId}/calls`).expect(200)).body.calls
  expect(list).toEqual([
    expect.objectContaining({
      _id: callId,
      status: 'COMPLETED',
      recording: { status: 'DELETED', objection: false },
      transcriptStatus: 'DONE',
      analysisStatus: 'READY',
    }),
  ])
  expect(list[0]).not.toHaveProperty('author')
  const transcript = (await commercial(rep).get(`/calls/${callId}/transcript`).expect(200)).body
  expect(transcript.segments.map((s: { speaker: string }) => s.speaker)).toEqual([
    'REP',
    'PROSPECT',
    'PROSPECT',
    'PROSPECT',
  ])
  const read = (await commercial(rep).get(`/calls/${callId}/analysis`).expect(200)).body
  expect(read.acceptableKeys).not.toContain('sector')
  expect(read.current.callHold).toBeNull()

  // Validation par l'humain : seule écriture sur la fiche.
  const applied = await commercial(rep)
    .post(`/calls/${callId}/analysis/apply`, applyAll(read.analysis, read.acceptableKeys))
    .expect(200)
  // Le secteur revient à l'équipe : ignoré par l'externe, l'analyse est appliquée en partie.
  expect(applied.body.analysis.status).toBe('PARTIAL')
  const after = (await Lead.findById(leadId).lean())!
  expect(after.budget).toBe(15000)
  expect(after.qualification?.need).toBe('Refonte de la boutique')
  expect(after.leadTemperature).toBe('CHAUD')
  expect(after.sector ?? '').toBe('')
  const history = await LeadActivity.findOne({ leadId, type: 'CALL_ANALYSIS_APPLIED' }).lean()
  expect(String(history!.actorId)).toBe(rep.id)

  // Audio : effacé chez l'opérateur une fois le transcript obtenu, plus jamais relayé.
  expect(deleteProviderRecording).toHaveBeenCalledWith(expect.anything(), recordingSid)
  await commercial(rep).get(`/calls/${callId}/recording`).expect(404)
  expect(claudeRequests).toBe(1)
})

it('équipe : le closer relit l’appel de l’externe sur la fiche transmise, appelle à son tour et valide', async () => {
  const lead = await newLead()
  const leadId = String(lead._id)
  const { callId: repCall } = await callThrough(commercial, rep, leadId)
  await commercial(rep).post(`/leads/${leadId}/ready-to-close`, {}).expect(200)

  // L'externe garde la lecture, perd l'écriture ; l'équipe lit son appel, nommé.
  const repRead = (await commercial(rep).get(`/calls/${repCall}/analysis`).expect(200)).body
  const refused = await commercial(rep).post(`/calls/${repCall}/analysis/apply`, applyAll(repRead.analysis, []))
  expect(refused.status).toBe(409)
  expect(refused.body.code).toBe('LEAD_HANDED_OFF')
  expect((await team(admin).get('/calls/queue').expect(200)).body.leads.map((l: { _id: string }) => l._id)).toEqual([
    leadId,
  ])
  const before = (await team(admin).get(`/leads/${leadId}/calls`).expect(200)).body.calls
  expect(before).toEqual([
    expect.objectContaining({ _id: repCall, own: false, author: { _id: rep.id, name: 'Rita Externe' } }),
  ])

  // L'équipe valide l'analyse restée à relire, champs d'équipe compris.
  const teamRead = (await team(admin).get(`/calls/${repCall}/analysis`).expect(200)).body
  expect(teamRead.acceptableKeys).toContain('sector')
  await team(admin)
    .post(`/calls/${repCall}/analysis/apply`, applyAll(teamRead.analysis, teamRead.acceptableKeys))
    .expect(200)
  expect((await Lead.findById(leadId).lean())!.sector).toBe('Commerce en ligne')

  // Puis le closer appelle depuis la fiche : même chaîne, à son nom.
  await Lead.updateOne({ _id: leadId }, { $unset: { nextActionAt: 1 } })
  const { callId, recordingSid } = await callThrough(team, admin, leadId)
  const mine = (await team(admin).get(`/calls/${callId}/analysis`).expect(200)).body
  await Lead.updateOne({ _id: leadId }, { budget: null })
  await team(admin)
    .post(`/calls/${callId}/analysis/apply`, applyAll(mine.analysis, ['budget']))
    .expect(200)
  expect((await Lead.findById(leadId).lean())!.budget).toBe(15000)
  const histories = await LeadActivity.find({ leadId, type: 'CALL_ANALYSIS_APPLIED' }).sort({ _id: 1 }).lean()
  expect(histories.map((row) => String(row.actorId))).toEqual([admin.id, admin.id])
  expect(deleteProviderRecording).toHaveBeenCalledWith(expect.anything(), recordingSid)
  const calls = (await team(admin).get(`/leads/${leadId}/calls`).expect(200)).body.calls
  expect(calls.map((call: { _id: string; own: boolean }) => [call._id, call.own])).toEqual([
    [callId, true],
    [repCall, false],
  ])
  // L'externe ne voit jamais l'appel du closer.
  await commercial(rep).get(`/calls/${callId}`).expect(404)
})

it('opposition en cours d’appel : arrêt, audio effacé, ni transcript ni analyse, rien ne subsiste', async () => {
  const lead = await newLead()
  const leadId = String(lead._id)
  const launched = await commercial(rep).post(`/leads/${leadId}/calls`, { clientRequestId: crypto.randomUUID() })
  const callId = String(launched.body.callId)
  const operator = await dial(rep, callId)

  const stopped = await commercial(rep).post(`/calls/${callId}/recording/stop`).expect(200)
  expect(stopped.body).toEqual({ recording: { status: 'STOPPED', objection: true } })
  expect(stopProviderRecording).toHaveBeenCalledWith(expect.anything(), `CA${callId.slice(-10)}`, operator.recordingSid)
  await commercial(rep).post(`/calls/${callId}/recording/stop`).expect(200)
  await operator.hangUp()
  expect(deleteProviderRecording).toHaveBeenCalledWith(expect.anything(), operator.recordingSid)

  // Les balayages du planificateur ne relancent rien.
  await sweepRecordings(new Date(Date.now() + DAY_MS))
  await sweepTranscriptions()
  expect(assemblyCalls).toEqual([])
  expect(fetchProviderRecording).not.toHaveBeenCalled()
  expect(claudeRequests).toBe(0)
  expect(await CallTranscript.countDocuments({ call: callId })).toBe(0)
  expect(await CallAnalysis.countDocuments({ call: callId })).toBe(0)
  expect((await Call.findById(callId).lean())!.recording).toMatchObject({ status: 'DELETED', objection: true })

  await commercial(rep).get(`/calls/${callId}/transcript`).expect(404)
  await commercial(rep).get(`/calls/${callId}/analysis`).expect(404)
  await commercial(rep).get(`/calls/${callId}/recording`).expect(404)
  await commercial(rep).post(`/calls/${callId}/analysis/retry`).expect(404)
  expect((await commercial(rep).get(`/leads/${leadId}/calls`)).body.calls).toEqual([
    expect.objectContaining({
      _id: callId,
      recording: { status: 'DELETED', objection: true },
      transcriptStatus: null,
      analysisStatus: null,
    }),
  ])
})

it('réglages : l’enregistrement réglé par l’écran est relu et s’applique à l’appel suivant (annonce, conservation, lecture par plages)', async () => {
  const crm = space('/api/admin/crm', admin)
  const callRecording = { enabled: true, notice: { enabled: false, text: '' }, keepAudioDays: 30 }
  await crm.patch('/settings', { callRecording }).expect(200)
  expect((await crm.get('/settings').expect(200)).body.settings.callRecording).toMatchObject(callRecording)
  expect((await commercial(rep).get('/calls/config')).body.recording).toEqual({ enabled: true, notice: false })

  const lead = await newLead()
  const { callId, twiml } = await callThrough(commercial, rep, String(lead._id))
  expect(twiml).toContain('record="record-from-answer-dual"')
  expect(twiml).not.toContain('/notice?')
  // Audio conservé 30 jours : pas effacé, relayé sans cache public et lisible par plages.
  expect(deleteProviderRecording).not.toHaveBeenCalled()
  const kept = (await Call.findById(callId).lean())!.recording!
  expect(kept.status).toBe('READY')
  expect(kept.deleteAt!.getTime() - Date.now()).toBeGreaterThan(30 * DAY_MS - 60_000)
  const whole = await commercial(rep).get(`/calls/${callId}/recording`).expect(200)
  expect(whole.headers).toMatchObject({
    'content-type': 'audio/mpeg',
    'cache-control': 'no-store',
    'accept-ranges': 'bytes',
  })
  const part = await commercial(rep)
    .get(`/calls/${callId}/recording`)
    .set('Range', 'bytes=4-8')
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => done(null, Buffer.concat(chunks)))
    })
    .expect(206)
  expect(part.headers['content-range']).toBe(`bytes 4-8/${AUDIO.length}`)
  expect((part.body as Buffer).toString()).toBe(AUDIO.subarray(4, 9).toString())
  await commercial(rep).get(`/calls/${callId}/recording`).set('Range', `bytes=${AUDIO.length}-`).expect(416)

  // Échéance passée : effacé, plus relayé.
  await sweepRecordings(new Date(Date.now() + 31 * DAY_MS))
  expect(deleteProviderRecording).toHaveBeenCalledTimes(1)
})
