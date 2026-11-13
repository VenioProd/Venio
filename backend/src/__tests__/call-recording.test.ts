import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import twilio from 'twilio'
import mongoose from 'mongoose'
import { setupMongoReplSet, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import commercialRoutes from '../routes/commercial/index.js'
import telephonyRoutes from '../routes/telephony/index.js'
import { deleteProviderRecording, fetchProviderRecording, stopProviderRecording } from '../lib/telephony/rest.js'
import { closeStaleCalls, startCallPipeline, sweepRecordings } from '../lib/telephony/recording.js'
import { sweepTranscriptions } from '../lib/transcription/index.js'
import { runCallPipelineJobs } from '../lib/crmScheduler.js'
import { anonymizeLead, buildPersonalDataExport } from '../lib/crmPrivacy.js'
import Call from '../models/Call.js'
import CallAnalysis from '../models/CallAnalysis.js'
import CallTranscript from '../models/CallTranscript.js'
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import SuppressionEntry from '../models/SuppressionEntry.js'
import CrmSettings from '../models/CrmSettings.js'
import User from '../models/User.js'
import UserIdempotencyKey from '../models/UserIdempotencyKey.js'

vi.mock('../lib/notifyHelpers.js', () => ({ notifyUsers: vi.fn().mockResolvedValue(undefined) }))
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
}
// Mardi 10 h à Paris : dans la plage par défaut.
const TUESDAY_10H = new Date('2026-11-10T09:00:00Z')
const DAY_MS = 24 * 60 * 60_000

const app = express()
app.use('/api/telephony', telephonyRoutes)
app.use(express.json())
app.use('/api/commercial', commercialRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

// Faux AssemblyAI : réponses par chemin, requêtes gardées.
let assembly: Record<string, () => { status: number; body?: unknown }>
let assemblyCalls: string[]
const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  const key = `${init.method ?? 'GET'} ${new URL(url).pathname}`
  assemblyCalls.push(key)
  const reply = (assembly[key] ?? (() => ({ status: 404 })))()
  return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status })
})
const JOB_DONE = {
  status: 'completed',
  audio_duration: 42,
  utterances: [
    { channel: '1', start: 0, end: 900, text: 'Bonjour, Anna de Venio.' },
    { channel: '2', start: 1000, end: 2000, text: 'Bonjour, je vous écoute.' },
  ],
}

let repA: string
let repB: string
let cookieA: string
let cookieB: string
const as = (cookie: string) => ({
  get: (path: string) => request(app).get(`/api/commercial${path}`).set('Cookie', cookie),
  post: (path: string, body: object = {}) =>
    request(app).post(`/api/commercial${path}`).set('Cookie', cookie).send(body),
})
const sign = (path: string, params: Record<string, string>) =>
  twilio.getExpectedTwilioSignature(AUTH_TOKEN, `${PUBLIC_URL}/api/telephony/twilio${path}`, params)
const twilioPost = (path: string, params: Record<string, string>, signature = sign(path, params)) =>
  request(app).post(`/api/telephony/twilio${path}`).type('form').set('X-Twilio-Signature', signature).send(params)
const recEvent = (callId: string, RecordingStatus: string, extra: Record<string, string> = {}) =>
  twilioPost(`/recording?callId=${callId}`, {
    AccountSid: 'ACtest',
    CallSid: 'CAparent1',
    RecordingSid: 'RE1',
    RecordingStatus,
    RecordingChannels: '2',
    ...(RecordingStatus === 'completed' ? { RecordingDuration: '42' } : {}),
    ...extra,
  })

async function placeCall(leadExtra: object = {}, callSid = 'CAparent1') {
  // Ces tests enchaînent des appels laissés ouverts : la ligne unique (lot I) n'est pas leur objet.
  await mongoose.connection.collection('callerlines').deleteMany({})
  const lead = await Lead.create({
    company: 'Alpha',
    businessContact: true,
    externalRep: repA,
    contactPhone: '+33612345678',
    ...leadExtra,
  })
  const launched = await as(cookieA).post(`/leads/${lead._id}/calls`, { clientRequestId: crypto.randomUUID() })
  const callId = String(launched.body.callId)
  const voice = await twilioPost('/voice', { CallSid: callSid, From: `client:u_${repA}`, To: '', callId })
  return { lead, callId, twiml: voice.text }
}
const recording = async (callId: string) => (await Call.findById(callId).lean())!.recording
const processing = (callId: string) =>
  vi.waitFor(async () => expect((await CallTranscript.findOne({ call: callId }).lean())?.status).toBe('PROCESSING'))

beforeAll(async () => {
  await setupMongoReplSet()
  await Promise.all(
    [Lead, Call, CallTranscript, CallAnalysis, LeadActivity, SuppressionEntry, CrmSettings, UserIdempotencyKey].map(
      (model) => (model as typeof Lead).init(),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  startCallPipeline()
})
afterAll(async () => {
  vi.unstubAllGlobals()
  await teardownMongo()
})
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: TUESDAY_10H })
  Object.assign(process.env, ENV)
  delete process.env.ANTHROPIC_API_KEY
  vi.mocked(stopProviderRecording).mockReset().mockResolvedValue(undefined)
  vi.mocked(deleteProviderRecording).mockReset().mockResolvedValue(undefined)
  vi.mocked(fetchProviderRecording).mockReset().mockResolvedValue(Buffer.from('ID3-audio'))
  fetchMock.mockClear()
  assemblyCalls = []
  assembly = {
    'POST /v2/upload': () => ({ status: 200, body: { upload_url: 'https://cdn.example/u/1' } }),
    'POST /v2/transcript': () => ({ status: 200, body: { id: 'job-1' } }),
    'GET /v2/transcript/job-1': () => ({ status: 200, body: { status: 'processing' } }),
    'DELETE /v2/transcript/job-1': () => ({ status: 200, body: {} }),
  }
  await clearDb()
  const users = await User.create([
    { name: 'Anna', email: 'anna@rec.test', passwordHash: 'unused', role: 'COMMERCIAL_EXTERNE' },
    { name: 'Bruno', email: 'bruno@rec.test', passwordHash: 'unused', role: 'COMMERCIAL_EXTERNE' },
  ])
  repA = String(users[0]!._id)
  repB = String(users[1]!._id)
  cookieA = `venio_session=${(await createSession(repA)).token}`
  cookieB = `venio_session=${(await createSession(repB)).token}`
})
afterEach(() => {
  vi.useRealTimers()
  for (const key of Object.keys(ENV)) delete process.env[key]
})

it('chaîne : double piste à la décroche avec annonce, transcript, audio effacé seulement une fois le transcript obtenu, puis analyse', async () => {
  const { callId, twiml } = await placeCall()
  expect(twiml).toContain('record="record-from-answer-dual"')
  expect(twiml).toContain(`recordingStatusCallback="${PUBLIC_URL}/api/telephony/twilio/recording?callId=${callId}"`)
  expect(twiml).toContain('recordingStatusCallbackEvent="in-progress completed absent"')
  expect(twiml).toContain(`url="${PUBLIC_URL}/api/telephony/twilio/notice?callId=${callId}"`)
  const notice = await twilioPost(`/notice?callId=${callId}`, { CallSid: 'CAchild1', ParentCallSid: 'CAparent1' })
  expect(notice.text).toContain('<Say language="fr-FR">Cet appel est enregistré et transcrit')

  await recEvent(callId, 'in-progress').expect(204)
  expect((await as(cookieA).get(`/calls/${callId}`)).body.recording).toEqual({ status: 'RECORDING', objection: false })
  await recEvent(callId, 'completed').expect(204)
  await processing(callId)
  // Audio lu chez l'opérateur, en double piste ; le commercial est le canal 1 (appel parent).
  expect(fetchProviderRecording).toHaveBeenCalledWith(expect.objectContaining({ region: 'ie1' }), 'RE1', 2)
  expect((await CallTranscript.findOne({ call: callId }).lean())!.repChannel).toBe(0)

  // Transcript pas encore obtenu : l'audio reste, quel que soit le nombre de balayages.
  await sweepTranscriptions()
  await sweepRecordings()
  await sweepRecordings(new Date(Date.now() + 365 * DAY_MS))
  expect(deleteProviderRecording).not.toHaveBeenCalled()
  expect((await recording(callId))!.status).toBe('READY')

  assembly['GET /v2/transcript/job-1'] = () => ({ status: 200, body: JOB_DONE })
  await sweepTranscriptions()
  expect(deleteProviderRecording).toHaveBeenCalledWith(expect.anything(), 'RE1')
  expect((await recording(callId))!.status).toBe('DELETED')
  const transcript = await as(cookieA).get(`/calls/${callId}/transcript`)
  expect(transcript.body.segments.map((s: { speaker: string }) => s.speaker)).toEqual(['REP', 'PROSPECT'])
  // L'analyse est créée (sans clé Claude, elle échoue explicitement).
  await vi.waitFor(async () => expect((await CallAnalysis.findOne({ call: callId }).lean())?.status).toBe('FAILED'))

  // Rappel rejoué : aucun nouvel envoi, aucun changement.
  await recEvent(callId, 'completed').expect(204)
  expect(assemblyCalls.filter((key) => key === 'POST /v2/upload')).toHaveLength(1)
  expect((await recording(callId))!.status).toBe('DELETED')
})

it('opposition en cours d’appel : arrêt, audio effacé, aucun transcript ; rejouable ; vaut aussi après l’appel', async () => {
  const { callId } = await placeCall()
  await recEvent(callId, 'in-progress')
  const stopped = await as(cookieA).post(`/calls/${callId}/recording/stop`).expect(200)
  expect(stopped.body.recording).toEqual({ status: 'STOPPED', objection: true })
  expect(stopProviderRecording).toHaveBeenCalledWith(expect.anything(), 'CAparent1', 'RE1')
  // Twilio n'efface qu'un enregistrement terminé : l'effacement suit le rappel `completed`.
  await recEvent(callId, 'completed').expect(204)
  expect(deleteProviderRecording).toHaveBeenCalledWith(expect.anything(), 'RE1')
  expect((await as(cookieB).post(`/calls/${callId}/recording/stop`)).status).toBe(404)
  expect((await as(cookieA).post(`/calls/${callId}/recording/stop`)).body.recording).toEqual({
    status: 'DELETED',
    objection: true,
  })
  await sweepRecordings()
  await sweepTranscriptions()
  expect(await CallTranscript.countDocuments()).toBe(0)
  expect(fetchProviderRecording).not.toHaveBeenCalled()
  expect(assemblyCalls).toEqual([])

  // Après l'appel, transcript en cours : audio, transcript et travail chez le fournisseur effacés.
  const later = await placeCall({ company: 'Beta', contactPhone: '+33698765432' }, 'CAparent2')
  await twilioPost(`/recording?callId=${later.callId}`, {
    CallSid: 'CAparent2',
    RecordingSid: 'RE2',
    RecordingStatus: 'completed',
    RecordingChannels: '2',
    RecordingDuration: '30',
  })
  await processing(later.callId)
  await as(cookieA).post(`/calls/${later.callId}/recording/stop`).expect(200)
  expect(deleteProviderRecording).toHaveBeenCalledWith(expect.anything(), 'RE2')
  expect(assemblyCalls).toContain('DELETE /v2/transcript/job-1')
  expect(await CallTranscript.countDocuments({ call: later.callId })).toBe(0)
  expect(await CallAnalysis.countDocuments()).toBe(0)
})

it('rappel d’enregistrement : signature forgée refusée, rejoué sans effet, rattaché au mauvais appel ignoré', async () => {
  const { callId } = await placeCall()
  const params = { CallSid: 'CAparent1', RecordingSid: 'RE1', RecordingStatus: 'completed', RecordingChannels: '2' }
  await twilioPost(`/recording?callId=${callId}`, params, 'forged').expect(403)
  // Autre appel parent, ou autre enregistrement sur cet appel : ignorés.
  await recEvent(callId, 'in-progress', { CallSid: 'CAother' }).expect(204)
  expect((await recording(callId))!.status).toBe('NONE')
  await recEvent(callId, 'in-progress').expect(204)
  await recEvent(callId, 'completed', { RecordingSid: 'RE9' }).expect(204)
  expect((await recording(callId))!.status).toBe('RECORDING')

  await recEvent(callId, 'completed').expect(204)
  await processing(callId)
  const before = await Call.findById(callId).lean()
  await recEvent(callId, 'completed').expect(204)
  await recEvent(callId, 'in-progress').expect(204)
  await sweepRecordings()
  expect((await Call.findById(callId).lean())!.recording).toEqual(before!.recording)
  expect(assemblyCalls.filter((key) => key === 'POST /v2/transcript')).toHaveLength(1)
})

it('audio conservé : relayé à son auteur seulement, purgé à l’échéance ; liste des appels cloisonnée', async () => {
  await CrmSettings.updateSettings({
    callRecording: { enabled: true, notice: { enabled: false, text: '' }, keepAudioDays: 30 },
  } as never)
  const { lead, callId, twiml } = await placeCall()
  expect(twiml).not.toContain('url=')
  await recEvent(callId, 'completed')
  await processing(callId)
  assembly['GET /v2/transcript/job-1'] = () => ({ status: 200, body: JOB_DONE })
  await sweepTranscriptions()
  expect(deleteProviderRecording).not.toHaveBeenCalled()

  const audio = await as(cookieA).get(`/calls/${callId}/recording`).expect(200)
  expect(audio.headers['content-type']).toBe('audio/mpeg')
  expect(Buffer.from(audio.body).toString()).toBe('ID3-audio')
  expect((await as(cookieB).get(`/calls/${callId}/recording`)).status).toBe(404)

  const list = await as(cookieA).get(`/leads/${lead._id}/calls`).expect(200)
  expect(list.body.calls).toEqual([
    expect.objectContaining({
      _id: callId,
      recording: { status: 'READY', objection: false, audio: 'PLAYABLE' },
      transcriptStatus: 'DONE',
    }),
  ])
  expect((await as(cookieB).get(`/leads/${lead._id}/calls`)).status).toBe(404)

  await sweepRecordings(new Date(Date.now() + 29 * DAY_MS))
  expect(deleteProviderRecording).not.toHaveBeenCalled()
  await sweepRecordings(new Date(Date.now() + 31 * DAY_MS))
  expect(deleteProviderRecording).toHaveBeenCalledWith(expect.anything(), 'RE1')
  expect((await as(cookieA).get(`/calls/${callId}/recording`)).status).toBe(404)
})

it('audio relayé par plages : une seule lecture chez l’opérateur, cache vidé à l’opposition du prospect', async () => {
  await CrmSettings.updateSettings({
    callRecording: { enabled: true, notice: { enabled: false, text: '' }, keepAudioDays: 30 },
  } as never)
  const { callId } = await placeCall()
  await recEvent(callId, 'completed')
  await processing(callId)
  vi.mocked(fetchProviderRecording).mockClear()

  const head = await as(cookieA).get(`/calls/${callId}/recording`).set('Range', 'bytes=0-2').expect(206)
  expect(head.headers['cache-control']).toBe('no-store')
  expect(head.headers['content-range']).toBe('bytes 0-2/9')
  expect(Buffer.from(head.body).toString()).toBe('ID3')
  const tail = await as(cookieA).get(`/calls/${callId}/recording`).set('Range', 'bytes=3-').expect(206)
  expect(Buffer.from(tail.body).toString()).toBe('-audio')
  await as(cookieA).get(`/calls/${callId}/recording`).expect(200)
  expect(fetchProviderRecording).toHaveBeenCalledTimes(1)

  await as(cookieA).post(`/calls/${callId}/recording/stop`).expect(200)
  expect((await as(cookieA).get(`/calls/${callId}/recording`)).status).toBe(404)
  // Un autre auteur ne passe jamais par le cache : le périmètre est vérifié avant.
  expect((await as(cookieB).get(`/calls/${callId}/recording`)).status).toBe(404)
})

it('relais refusé quand l’audio n’est pas conservé ; retry crée l’analyse manquante pour l’auteur seulement', async () => {
  const { lead, callId } = await placeCall()
  await recEvent(callId, 'completed')
  await processing(callId)
  expect((await as(cookieA).get(`/calls/${callId}/recording`)).status).toBe(404)
  // Gardé le temps du transcript puis supprimé : la liste le dit, au lieu d’un audio « conservé ».
  const waiting = await as(cookieA).get(`/leads/${lead._id}/calls`).expect(200)
  expect(waiting.body.calls[0].recording).toEqual({ status: 'READY', objection: false, audio: 'AWAITING_TRANSCRIPT' })

  await CallTranscript.updateOne({ call: callId }, { $set: { status: 'DONE', segments: [] } })
  expect((await as(cookieB).post(`/calls/${callId}/analysis/retry`)).status).toBe(404)
  const retried = await as(cookieA).post(`/calls/${callId}/analysis/retry`).expect(202)
  expect(retried.body.analysis.status).toBe('PENDING')
  expect(await CallAnalysis.countDocuments({ call: callId })).toBe(1)
})

it('fiche retenue (callHold) : absente de la file et refusée au lancement', async () => {
  const held = await Lead.create({
    company: 'Retenue',
    businessContact: true,
    externalRep: repA,
    contactPhone: '+33611111111',
    callHold: {
      at: new Date(),
      reason: 'OPT_OUT_DETECTED',
      analysis: new mongoose.Types.ObjectId(),
      call: new mongoose.Types.ObjectId(),
    },
  })
  const free = await Lead.create({
    company: 'Libre',
    businessContact: true,
    externalRep: repA,
    contactPhone: '+33622222222',
  })
  const queue = await as(cookieA).get('/calls/queue').expect(200)
  expect(queue.body.leads.map((item: { _id: string }) => item._id)).toEqual([String(free._id)])
  const launched = await as(cookieA).post(`/leads/${held._id}/calls`, { clientRequestId: crypto.randomUUID() })
  expect(launched.status).toBe(409)
  expect(launched.body.code).toBe('LEAD_NOT_CALLABLE')
})

it('anonymisation : ni audio, ni transcript, ni analyse, ni numéro ; l’export contenait appels, transcripts et analyses', async () => {
  const { lead, callId } = await placeCall({ contactEmail: 'ana@alpha.test' })
  await Lead.updateOne({ _id: lead._id }, { $set: { doNotCall: true } })
  await recEvent(callId, 'completed')
  await processing(callId)
  await CallAnalysis.create({
    call: callId,
    lead: lead._id,
    author: repA,
    model: 'm',
    promptVersion: 'v',
    callDate: new Date(),
    purgeAt: new Date(Date.now() + 365 * DAY_MS),
  })
  await LeadActivity.create({
    leadId: lead._id,
    type: 'CALL_OPT_OUT_HOLD',
    label: 'x',
    payload: { callId, quote: 'Ne me rappelez plus, Ana Dupont.' },
  })

  const exported = await buildPersonalDataExport(lead._id)
  expect(exported?.calls).toHaveLength(1)
  expect(exported?.callTranscripts).toHaveLength(1)
  expect(exported?.callAnalyses).toHaveLength(1)

  await anonymizeLead((await Lead.findById(lead._id))!, { actor: null, source: 'admin', reason: 'REQUEST' })
  expect(deleteProviderRecording).toHaveBeenCalledWith(expect.anything(), 'RE1')
  expect((await recording(callId))!.status).toBe('DELETED')
  expect(await CallTranscript.countDocuments()).toBe(0)
  expect(assemblyCalls).toContain('DELETE /v2/transcript/job-1')
  expect(await CallAnalysis.countDocuments()).toBe(0)
  const calls = await Call.find({ lead: lead._id }).lean()
  expect(JSON.stringify(calls)).not.toContain('612345678')
  const activity = await LeadActivity.findOne({ leadId: lead._id, type: 'CALL_OPT_OUT_HOLD' }).lean()
  expect(activity?.payload).toEqual({ callId })
  // L'opposition survit à l'anonymisation : le numéro passe dans la liste.
  expect(await SuppressionEntry.exists({ phoneNormalized: '+33612345678' })).toBeTruthy()
})

it('sans variables d’environnement : rien n’est enregistré et rien ne casse', async () => {
  for (const key of Object.keys(ENV)) delete process.env[key]
  expect((await as(cookieA).get('/calls/config')).body.recording).toEqual({ enabled: false, notice: false })
  const lead = await Lead.create({
    company: 'Alpha',
    businessContact: true,
    externalRep: repA,
    contactPhone: '+33612345678',
  })
  const stale = await Call.create({
    lead: lead._id,
    author: repA,
    to: '+33612345678',
    from: '+33180000000',
    clientRequestId: crypto.randomUUID(),
    attemptDay: '2026-11-10',
    attemptNo: 1,
  })
  await Call.collection.updateOne({ _id: stale._id }, { $set: { createdAt: new Date(Date.now() - 60 * 60_000) } })
  await expect(runCallPipelineJobs()).resolves.toBeUndefined()
  expect((await Call.findById(stale._id).lean())!.status).toBe('CANCELED')
  expect(await closeStaleCalls()).toEqual({ closed: 0 })
  expect((await as(cookieA).post(`/calls/${stale._id}/recording/stop`)).body.recording).toEqual({
    status: 'NONE',
    objection: true,
  })
  expect((await as(cookieA).get(`/leads/${lead._id}/calls`)).body.calls).toHaveLength(1)
  await anonymizeLead((await Lead.findById(lead._id))!, { actor: null, source: 'admin', reason: 'REQUEST' })

  // Twilio sans transcription et sans conservation : l'enregistrement ne servirait à rien, il n'a pas lieu.
  Object.assign(process.env, ENV)
  delete process.env.ASSEMBLYAI_API_KEY
  const { twiml } = await placeCall({ company: 'Beta', contactPhone: '+33698765432' })
  expect(twiml).toContain('<Dial')
  expect(twiml).not.toContain('record=')
  expect(fetchMock).not.toHaveBeenCalled()
})
