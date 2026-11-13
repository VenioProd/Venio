import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import twilio from 'twilio'
import { setupMongoReplSet, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import commercialRoutes from '../routes/commercial/index.js'
import telephonyRoutes from '../routes/telephony/index.js'
import { deleteProviderRecording, fetchProviderRecording, hangupProviderCall } from '../lib/telephony/rest.js'
import { validateCallAiSettings } from '../lib/callAiSettings.js'
import Call from '../models/Call.js'
import Lead from '../models/Lead.js'
import CrmSettings from '../models/CrmSettings.js'
import User from '../models/User.js'

vi.mock('../lib/notifyHelpers.js', () => ({ notifyUsers: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/telephony/rest.js', () => ({
  hangupProviderCall: vi.fn().mockResolvedValue(undefined),
  deleteProviderRecording: vi.fn().mockResolvedValue(undefined),
  stopProviderRecording: vi.fn().mockResolvedValue(undefined),
  fetchProviderRecording: vi.fn().mockResolvedValue(Buffer.from('audio')),
}))

const PUBLIC_URL = 'https://venio.test'
const AUTH_TOKEN = 'test-auth-token'
const TWILIO_ENV = {
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_API_KEY_SID: 'SKtest',
  TWILIO_API_KEY_SECRET: 'test-api-secret',
  TWILIO_AUTH_TOKEN: AUTH_TOKEN,
  TWILIO_TWIML_APP_SID: 'APtest',
  TWILIO_CALLER_ID: '+33180000000',
  TELEPHONY_PUBLIC_URL: PUBLIC_URL,
}
// Mardi 10 h à Paris : dans la plage par défaut.
const TUESDAY_10H = new Date('2026-11-10T09:00:00Z')

const app = express()
app.use('/api/telephony', telephonyRoutes)
app.use(express.json())
app.use('/api/commercial', commercialRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

let repA: string
let cookieA: string
const get = (path: string) => request(app).get(`/api/commercial${path}`).set('Cookie', cookieA)
const post = (path: string, body: object = {}) =>
  request(app).post(`/api/commercial${path}`).set('Cookie', cookieA).send(body)
const lead = (company: string, phone: string) => Lead.create({ company, externalRep: repA, contactPhone: phone })
const launch = (leadId: unknown, clientRequestId: string = crypto.randomUUID()) =>
  post(`/leads/${leadId}/calls`, { clientRequestId })
const twilioPost = (path: string, params: Record<string, string>, signature?: string) =>
  request(app)
    .post(`/api/telephony/twilio${path}`)
    .type('form')
    .set(
      'X-Twilio-Signature',
      signature ?? twilio.getExpectedTwilioSignature(AUTH_TOKEN, `${PUBLIC_URL}/api/telephony/twilio${path}`, params),
    )
    .send(params)
const voice = (callId: string, callSid: string) =>
  twilioPost('/voice', { CallSid: callSid, From: `client:u_${repA}`, To: '', callId })
const status = (callId: string, parent: string, CallStatus: string, extra: Record<string, string> = {}) =>
  twilioPost(`/status?callId=${callId}`, { CallSid: `${parent}-child`, ParentCallSid: parent, CallStatus, ...extra })
const amd = (callId: string, AnsweredBy: string, extra: Record<string, string> = {}) =>
  twilioPost(`/amd?callId=${callId}`, { CallSid: 'CAchild', AnsweredBy, MachineDetectionDuration: '2100', ...extra })

beforeAll(async () => {
  await setupMongoReplSet()
  await Promise.all([Lead, Call, CrmSettings].map((model) => (model as typeof Lead).init()))
})
afterAll(teardownMongo)
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: TUESDAY_10H })
  Object.assign(process.env, TWILIO_ENV)
  vi.clearAllMocks()
  await clearDb()
  const user = await User.create({
    name: 'Anna',
    email: 'anna@dialer.test',
    passwordHash: 'x',
    role: 'COMMERCIAL_EXTERNE',
  })
  repA = String(user._id)
  cookieA = `venio_session=${(await createSession(repA)).token}`
})
afterEach(() => {
  vi.useRealTimers()
  for (const key of Object.keys(TWILIO_ENV)) delete process.env[key]
})

it('un seul appel à la fois par utilisateur : course, rejeu, fin d’appel, lancement raté, appel jamais relié', async () => {
  const [alpha, beta, gamma] = await Promise.all([
    lead('Alpha', '+33611111111'),
    lead('Beta', '+33622222222'),
    lead('Gamma', '+33633333333'),
  ])
  // Deux lancements simultanés (deux onglets, double clic) : un seul passe.
  const key = crypto.randomUUID()
  const raced = await Promise.all([launch(alpha._id, key), launch(beta._id)])
  expect(raced.map((res) => res.status).sort()).toEqual([201, 409])
  const winner = raced.find((res) => res.status === 201)!
  expect(raced.find((res) => res.status === 409)!.body.code).toBe('CALL_IN_PROGRESS')
  expect(await Call.countDocuments()).toBe(1)
  // Le lancement rejoué rend le même appel ; un autre reste refusé tant que celui-ci occupe la ligne.
  expect((await launch(alpha._id, key)).body.callId).toBe(winner.body.callId)
  const callId = String(winner.body.callId)
  await voice(callId, 'CAp1')
  await status(callId, 'CAp1', 'in-progress')
  expect((await launch(gamma._id)).body.code).toBe('CALL_IN_PROGRESS')

  // Appel terminé : la ligne est libre.
  await status(callId, 'CAp1', 'completed', { CallDuration: '30' })
  // Un lancement refusé par une garde ne garde pas la ligne.
  await Lead.updateOne({ _id: beta._id }, { $set: { doNotCall: true } })
  expect((await launch(beta._id)).body.code).toBe('LEAD_NOT_CALLABLE')
  const next = await launch(gamma._id)
  expect(next.status).toBe(201)

  // Lancé mais jamais relié (onglet fermé avant la connexion) : au bout d'une minute, un nouveau
  // lancement l'annule, et l'opérateur ne pourra plus le relier.
  expect((await launch(alpha._id)).body.code).toBe('CALL_IN_PROGRESS')
  vi.setSystemTime(new Date(TUESDAY_10H.getTime() + 61_000))
  expect((await launch(alpha._id)).status).toBe(201)
  const orphan = (await Call.findById(next.body.callId).lean())!
  expect([orphan.status, orphan.events.at(-1)!.status]).toEqual(['CANCELED', 'SUPERSEDED'])
  expect((await voice(String(next.body.callId), 'CAp9')).text).not.toContain('<Dial')
})

it('messagerie détectée : raccroché aussitôt, résultat messagerie suggéré, aucun audio gardé ; rejouable', async () => {
  // Audio conservé 30 jours : l'enregistrement est actif même sans transcription configurée.
  const settings = await CrmSettings.getSettings()
  await CrmSettings.updateSettings({
    callRecording: { ...settings.toObject().callRecording, keepAudioDays: 30 },
  } as never)
  const item = await lead('Alpha', '+33611111111')
  const callId = String((await launch(item._id)).body.callId)
  const twiml = (await voice(callId, 'CAp1')).text
  expect(twiml).toContain('machineDetection="Enable"')
  expect(twiml).toContain(`amdStatusCallback="${PUBLIC_URL}/api/telephony/twilio/amd?callId=${callId}"`)
  await status(callId, 'CAp1', 'in-progress')
  await twilioPost(`/recording?callId=${callId}`, {
    CallSid: 'CAp1',
    RecordingSid: 'RE1',
    RecordingStatus: 'in-progress',
  })

  expect((await amd(callId, 'machine_start', {}).set('X-Twilio-Signature', 'forged')).status).toBe(403)
  expect((await amd(callId, 'machine_start', { ParentCallSid: 'CAintrus' })).status).toBe(204)
  expect((await Call.findById(callId).lean())!.answeredBy).toBe('UNKNOWN')

  expect((await amd(callId, 'machine_start')).status).toBe(204)
  await vi.waitFor(() => expect(hangupProviderCall).toHaveBeenCalledWith(expect.anything(), 'CAp1'))
  await amd(callId, 'machine_start')
  await amd(callId, 'human')
  expect(hangupProviderCall).toHaveBeenCalledTimes(1)

  // L'opérateur livre l'audio capté avant le raccrochage : effacé, jamais lu ni transcrit.
  await status(callId, 'CAp1', 'completed', { CallDuration: '4' })
  await twilioPost(`/recording?callId=${callId}`, {
    CallSid: 'CAp1',
    RecordingSid: 'RE1',
    RecordingStatus: 'completed',
    RecordingChannels: '2',
    RecordingDuration: '4',
  })
  expect(deleteProviderRecording).toHaveBeenCalledWith(expect.anything(), 'RE1')
  expect(fetchProviderRecording).not.toHaveBeenCalled()
  const read = (await get(`/calls/${callId}`)).body
  expect(read).toMatchObject({ answeredBy: 'MACHINE', suggestedOutcome: 'VOICEMAIL' })
  expect(read.recording.status).toBe('DELETED')
  expect((await get(`/calls/${callId}/recording`)).status).toBe(404)
})

it('humain détecté : rien ne coupe ; détection coupée dans les réglages : pas d’AMD', async () => {
  const item = await lead('Alpha', '+33611111111')
  const first = String((await launch(item._id)).body.callId)
  await voice(first, 'CAp1')
  await amd(first, 'human')
  expect((await Call.findById(first).lean())!.answeredBy).toBe('HUMAN')
  expect(hangupProviderCall).not.toHaveBeenCalled()
  await status(first, 'CAp1', 'completed', { CallDuration: '60' })

  const settings = await CrmSettings.getSettings()
  const telephony = {
    ...settings.toObject().telephony,
    dialer: { voicemailDetection: false, previewDelaySec: 0, powerDelaySec: 5 },
  }
  validateCallAiSettings({ telephony })
  await CrmSettings.updateSettings({ telephony } as never)
  expect((await get('/calls/config')).body.dialer).toEqual({
    voicemailDetection: false,
    previewDelaySec: 0,
    powerDelaySec: 5,
  })
  const second = String((await launch(item._id)).body.callId)
  expect((await voice(second, 'CAp2')).text).not.toContain('machineDetection')
})

it('réglages du dialer : bornés, facultatifs pour les écrans qui ne les envoient pas', () => {
  const callingHours = { timezone: 'Europe/Paris', days: [1, 2, 3, 4, 5], start: '09:00', end: '20:00' }
  expect(() => validateCallAiSettings({ telephony: { callingHours, attemptCapPerDay: 3 } })).not.toThrow()
  const dialer = { voicemailDetection: true, previewDelaySec: 10, powerDelaySec: 61 }
  expect(() => validateCallAiSettings({ telephony: { callingHours, attemptCapPerDay: 3, dialer } })).toThrow(
    /telephony\.dialer\.powerDelaySec/,
  )
})
