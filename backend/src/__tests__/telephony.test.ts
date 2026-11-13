import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import twilio from 'twilio'
import { setupMongoReplSet, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import commercialRoutes from '../routes/commercial/index.js'
import telephonyRoutes from '../routes/telephony/index.js'
import { importCallLeads } from '../lib/callImports.js'
import { hangupProviderCall } from '../lib/telephony/rest.js'
import Call from '../models/Call.js'
import Lead from '../models/Lead.js'
import Interaction from '../models/Interaction.js'
import LeadActivity from '../models/LeadActivity.js'
import SuppressionEntry from '../models/SuppressionEntry.js'
import CrmSettings from '../models/CrmSettings.js'
import User from '../models/User.js'
import UserIdempotencyKey from '../models/UserIdempotencyKey.js'
import SyncTombstone from '../models/SyncTombstone.js'

vi.mock('../lib/notifyHelpers.js', () => ({ notifyUsers: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/telephony/rest.js', () => ({ hangupProviderCall: vi.fn().mockResolvedValue(undefined) }))

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
let repB: string
let cookieA: string
let cookieB: string
const as = (cookie: string) => ({
  get: (path: string) => request(app).get(`/api/commercial${path}`).set('Cookie', cookie),
  post: (path: string, body: object = {}) =>
    request(app).post(`/api/commercial${path}`).set('Cookie', cookie).send(body),
})
const lead = (company: string, extra: object = {}) =>
  Lead.create({ company, businessContact: true, externalRep: repA, contactPhone: '+33612345678', ...extra })
const launch = (cookie: string, leadId: unknown, clientRequestId: string = crypto.randomUUID()) =>
  as(cookie).post(`/leads/${leadId}/calls`, { clientRequestId })
const twilioPost = (path: string, params: Record<string, string>, signature?: string) =>
  request(app)
    .post(`/api/telephony/twilio${path}`)
    .type('form')
    .set(
      'X-Twilio-Signature',
      signature ?? twilio.getExpectedTwilioSignature(AUTH_TOKEN, `${PUBLIC_URL}/api/telephony/twilio${path}`, params),
    )
    .send(params)
const voice = (callId: string, from: string, callSid = 'CAparent1', extra: Record<string, string> = {}) =>
  twilioPost('/voice', { CallSid: callSid, From: `client:u_${from}`, To: '', callId, ...extra })
const status = (callId: string, CallStatus: string, extra: Record<string, string> = {}) =>
  twilioPost(`/status?callId=${callId}`, {
    CallSid: 'CAchild1',
    ParentCallSid: 'CAparent1',
    CallStatus,
    Timestamp: new Date().toUTCString(),
    ...extra,
  })
const quick = (outcome: string, extra: object = {}) => ({
  clientRequestId: crypto.randomUUID(),
  note: '',
  outcome,
  scriptTag: 'DEFAULT',
  nextActionAt: null,
  ...extra,
})

beforeAll(async () => {
  await setupMongoReplSet()
  await Promise.all(
    [Lead, Call, Interaction, LeadActivity, SuppressionEntry, CrmSettings, UserIdempotencyKey, SyncTombstone].map(
      (model) => (model as typeof Lead).init(),
    ),
  )
})
afterAll(teardownMongo)
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: TUESDAY_10H })
  Object.assign(process.env, TWILIO_ENV)
  vi.mocked(hangupProviderCall).mockClear()
  await clearDb()
  const users = await User.create([
    { name: 'Anna', email: 'anna@tel.test', passwordHash: 'unused', role: 'COMMERCIAL_EXTERNE' },
    { name: 'Bruno', email: 'bruno@tel.test', passwordHash: 'unused', role: 'COMMERCIAL_EXTERNE' },
  ])
  repA = String(users[0]!._id)
  repB = String(users[1]!._id)
  cookieA = `venio_session=${(await createSession(repA)).token}`
  cookieB = `venio_session=${(await createSession(repB)).token}`
})
afterEach(() => {
  vi.useRealTimers()
  for (const key of Object.keys(TWILIO_ENV)) delete process.env[key]
})

it('sans variables Twilio : 503 TELEPHONY_DISABLED, et le poste d’appel marche comme avant', async () => {
  for (const key of Object.keys(TWILIO_ENV)) delete process.env[key]
  const item = await lead('Alpha')
  expect((await as(cookieA).get('/calls/config')).body).toMatchObject({ enabled: false, callerId: null })
  expect((await as(cookieA).post('/calls/token')).body.code).toBe('TELEPHONY_DISABLED')
  const launched = await launch(cookieA, item._id)
  expect([launched.status, launched.body.code]).toEqual([503, 'TELEPHONY_DISABLED'])
  expect((await voice(String(item._id), repA)).status).toBe(503)
  expect((await as(cookieA).get('/calls/queue')).body.leads).toHaveLength(1)
  expect((await as(cookieA).post(`/leads/${item._id}/quick-call`, quick('NO_ANSWER'))).status).toBe(201)
})

it('émet un jeton court à l’identité du commercial, sans numéro', async () => {
  const res = await as(cookieA).post('/calls/token')
  expect(res.body.identity).toBe(`u_${repA}`)
  expect(Date.parse(res.body.expiresAt) - Date.now()).toBe(600_000)
  const payload = JSON.parse(Buffer.from(res.body.token.split('.')[1], 'base64url').toString())
  expect(payload.grants).toEqual({
    identity: `u_${repA}`,
    voice: { outgoing: { application_sid: 'APtest' } },
  })
})

it('lance par lead, idempotent, et cloisonne lancement, lecture et raccrocher (404)', async () => {
  const own = await lead('Alpha')
  const other = await lead('Beta', { externalRep: repB, contactPhone: '+33698765432' })
  const key = crypto.randomUUID()
  const first = await launch(cookieA, own._id, key)
  expect(first.status).toBe(201)
  expect((await launch(cookieA, own._id, key)).body.callId).toBe(first.body.callId)
  const sibling = await lead('Gamma', { contactPhone: '+33611111111' })
  expect((await launch(cookieA, sibling._id, key)).body.code).toBe('IDEMPOTENCY_CONFLICT')
  expect((await launch(cookieA, other._id)).status).toBe(404)
  expect(await Call.countDocuments()).toBe(1)
  expect(await Call.findById(first.body.callId).lean()).toMatchObject({ to: '+33612345678', from: '+33180000000' })

  expect((await as(cookieB).get(`/calls/${first.body.callId}`)).status).toBe(404)
  expect((await as(cookieB).post(`/calls/${first.body.callId}/hangup`)).status).toBe(404)
  expect((await as(cookieA).get(`/calls/${first.body.callId}`)).body.status).toBe('CREATED')
  await Lead.updateOne({ _id: own._id }, { externalRep: repB })
  expect((await as(cookieA).get(`/calls/${first.body.callId}`)).status).toBe(404)
  expect((await launch(cookieA, own._id, key)).status).toBe(404)
})

it('refuse un numéro opposé quel que soit le commercial : appel, file et import', async () => {
  const fromB = await lead('Beta', { externalRep: repB, contactPhone: '+33 6 12 34 56 78' })
  expect((await as(cookieB).post(`/leads/${fromB._id}/quick-call`, quick('DO_NOT_CALL'))).status).toBe(201)
  expect(await SuppressionEntry.findOne({ phoneNormalized: '+33612345678' }).lean()).toMatchObject({
    reason: 'OPPOSITION',
    createdBy: fromB.externalRep,
  })

  const own = await lead('Alpha', { contactPhone: '06 12 34 56 78' })
  await lead('Gamma', { contactPhone: '+33611111111' })
  const res = await launch(cookieA, own._id)
  expect([res.status, res.body.code]).toEqual([409, 'PHONE_SUPPRESSED'])
  const queue = await as(cookieA).get('/calls/queue')
  expect(queue.body.leads.map((item: { company: string }) => item.company)).toEqual(['Gamma'])
  const report = await importCallLeads({
    businessContact: true,
    externalRep: repA,
    leads: [
      { company: 'Delta', contactPhone: '0612345678' },
      { company: 'Epsilon', contactPhone: '0622222222' },
    ],
  })
  expect(report).toMatchObject({ created: 1, rejected: 1, errors: [{ row: 1, reason: 'PHONE_SUPPRESSED' }] })
})

it('applique la plage horaire et le plafond par numéro et par jour', async () => {
  const own = await lead('Alpha')
  vi.setSystemTime(new Date('2026-11-14T10:00:00Z')) // samedi
  expect((await launch(cookieA, own._id)).body.code).toBe('OUTSIDE_CALLING_HOURS')
  vi.setSystemTime(new Date('2026-11-10T19:30:00Z')) // mardi 20 h 30 à Paris
  expect((await launch(cookieA, own._id)).body.code).toBe('OUTSIDE_CALLING_HOURS')
  vi.setSystemTime(TUESDAY_10H)

  await CrmSettings.updateSettings({ 'telephony.attemptCapPerDay': 2 } as never)
  // Chaque tentative est raccrochée avant la suivante : un seul appel à la fois (lot I).
  const attempt = async () => {
    const res = await launch(cookieA, own._id)
    if (res.status === 201) await as(cookieA).post(`/calls/${res.body.callId}/hangup`)
    return res
  }
  expect((await attempt()).status).toBe(201)
  expect((await attempt()).status).toBe(201)
  const capped = await launch(cookieA, own._id)
  expect([capped.status, capped.body.code]).toEqual([409, 'ATTEMPT_CAP_REACHED'])
  // Le plafond vaut pour le numéro, pas pour la fiche ni le commercial.
  const same = await lead('Beta', { externalRep: repB, contactPhone: '0612345678' })
  expect((await launch(cookieB, same._id)).body.code).toBe('ATTEMPT_CAP_REACHED')
  vi.setSystemTime(new Date('2026-11-11T09:00:00Z'))
  expect((await launch(cookieA, own._id)).status).toBe(201)
})

it('voice : signature vérifiée, appel relié à l’identité du jeton, numéro relu sur le lead', async () => {
  const own = await lead('Alpha')
  const { callId } = (await launch(cookieA, own._id)).body

  expect((await twilioPost('/voice', { CallSid: 'CAx', From: `client:u_${repA}`, callId }, 'forged')).status).toBe(403)
  const stolen = await voice(callId, repB)
  expect(stolen.text).not.toContain('<Dial')
  expect(await Call.findById(callId).lean()).toMatchObject({ status: 'CREATED', providerCallSid: null })

  // Le navigateur ne choisit pas le numéro : un `To` posté est ignoré.
  const ok = await voice(callId, repA, 'CAparent1', { To: '+33999999999', phone: '+33999999999' })
  expect(ok.type).toBe('text/xml')
  expect(ok.text).toContain('<Dial callerId="+33180000000" answerOnBridge="true" timeLimit="3600">')
  expect(ok.text).toContain(`statusCallback="${PUBLIC_URL}/api/telephony/twilio/status?callId=${callId}"`)
  expect(ok.text).toContain('>+33612345678</Number>')
  expect(ok.text).not.toContain('+33999999999')
  expect((await voice(callId, repA)).text).toBe(ok.text)
  expect((await voice(callId, repA, 'CAother')).text).not.toContain('<Dial')

  // Garde repassée à la mise en relation : un numéro opposé entre-temps est refusé.
  await status(callId, 'completed', { CallDuration: '5' })
  const second = await lead('Beta', { contactPhone: '+33622222222' })
  const late = (await launch(cookieA, second._id)).body.callId
  await SuppressionEntry.create({ phoneNormalized: '+33622222222', reason: 'MANUAL' })
  expect((await voice(late, repA, 'CAparent2')).text).not.toContain('<Dial')
  expect((await Call.findById(late).lean())!.status).toBe('CANCELED')
})

it('états : rejouables sans effet, jamais à reculons, résultat suggéré', async () => {
  const own = await lead('Alpha')
  const { callId } = (await launch(cookieA, own._id)).body
  await voice(callId, repA)
  expect((await status(callId, 'ringing', {}).set('X-Twilio-Signature', 'forged')).status).toBe(403)
  for (const step of ['initiated', 'ringing', 'in-progress']) expect((await status(callId, step)).status).toBe(204)
  await status(callId, 'completed', { CallDuration: '42' })
  const events = (await Call.findById(callId).lean())!.events.length
  await status(callId, 'completed', { CallDuration: '42' })
  await status(callId, 'ringing')
  await status(callId, 'no-answer', { ParentCallSid: 'CAintrus' })
  const stored = (await Call.findById(callId).lean())!
  expect(stored.events).toHaveLength(events)
  expect(stored).toMatchObject({ status: 'COMPLETED', durationSec: 42 })
  expect((await as(cookieA).get(`/calls/${callId}`)).body).toMatchObject({
    status: 'COMPLETED',
    suggestedOutcome: null,
  })

  const missed = (await launch(cookieA, own._id)).body.callId
  await voice(missed, repA, 'CAparent2')
  await twilioPost(`/status?callId=${missed}`, {
    CallSid: 'CAchild2',
    ParentCallSid: 'CAparent2',
    CallStatus: 'no-answer',
  })
  expect((await as(cookieA).get(`/calls/${missed}`)).body).toMatchObject({
    status: 'NO_ANSWER',
    durationSec: 0,
    suggestedOutcome: 'NO_ANSWER',
  })
})

it('raccrocher : annule avant la mise en relation, sinon coupe chez l’opérateur', async () => {
  const own = await lead('Alpha')
  const early = (await launch(cookieA, own._id)).body.callId
  expect((await as(cookieA).post(`/calls/${early}/hangup`)).body.status).toBe('CANCELED')
  expect((await voice(early, repA)).text).not.toContain('<Dial')
  const live = (await launch(cookieA, own._id)).body.callId
  await voice(live, repA, 'CAparent2')
  await as(cookieA).post(`/calls/${live}/hangup`)
  expect(hangupProviderCall).toHaveBeenCalledWith(expect.objectContaining({ accountSid: 'ACtest' }), 'CAparent2')
})

it('quick-call avec callId : heure et durée de l’appel, et l’annulation ne laisse rien d’orphelin', async () => {
  const own = await lead('Alpha')
  const { callId } = (await launch(cookieA, own._id)).body
  await voice(callId, repA)
  vi.setSystemTime(new Date(TUESDAY_10H.getTime() + 5000))
  await status(callId, 'in-progress')
  vi.setSystemTime(new Date(TUESDAY_10H.getTime() + 60_000))
  await status(callId, 'completed', { CallDuration: '55' })
  const answeredAt = (await Call.findById(callId).lean())!.answeredAt!

  vi.setSystemTime(new Date(TUESDAY_10H.getTime() + 90_000))
  const logged = await as(cookieA).post(
    `/leads/${own._id}/quick-call`,
    quick('DO_NOT_CALL', { callId, durationSec: 999 }),
  )
  expect(logged.status).toBe(201)
  expect(await Interaction.findById(logged.body.interactionId).lean()).toMatchObject({
    occurredAt: answeredAt,
    durationSec: 55,
  })
  expect(String((await Call.findById(callId).lean())!.interaction)).toBe(logged.body.interactionId)
  expect(await SuppressionEntry.exists({ phoneNormalized: '+33612345678' })).toBeTruthy()
  const again = await as(cookieA).post(`/leads/${own._id}/quick-call`, quick('NO_ANSWER', { callId }))
  expect(again.status).toBe(409)

  const undo = await as(cookieA).post(`/leads/${own._id}/quick-call/${logged.body.interactionId}/undo`)
  expect(undo.status).toBe(200)
  expect((await Call.findById(callId).lean())!.interaction).toBeNull()
  expect(await SuppressionEntry.exists({ phoneNormalized: '+33612345678' })).toBeNull()
  expect((await as(cookieA).post(`/leads/${own._id}/quick-call`, quick('NO_ANSWER', { callId }))).status).toBe(201)
})
