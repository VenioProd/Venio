import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import http, { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import twilio from 'twilio'
import WebSocket, { WebSocketServer } from 'ws'
import { setupMongoReplSet, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import commercialRoutes from '../routes/commercial/index.js'
import telephonyRoutes from '../routes/telephony/index.js'
import { liveTranscriptRoutes } from '../lib/liveTranscription/routes.js'
import { attachLiveTranscriptionServer } from '../lib/liveTranscription/streamServer.js'
import { getLiveSession, LIVE_STREAM_PATH, stopAllLiveSessions } from '../lib/liveTranscription/index.js'
import { stopTwilioStream } from '../lib/liveTranscription/twilioStream.js'
import Call from '../models/Call.js'
import CrmSettings from '../models/CrmSettings.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'

vi.mock('../lib/notifyHelpers.js', () => ({ notifyUsers: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/telephony/rest.js', () => ({
  hangupProviderCall: vi.fn(),
  stopProviderRecording: vi.fn(),
  deleteProviderRecording: vi.fn(),
  fetchProviderRecording: vi.fn(),
}))
vi.mock('../lib/liveTranscription/twilioStream.js', () => ({ stopTwilioStream: vi.fn().mockResolvedValue(undefined) }))

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
// Mardi 10 h à Paris : dans la plage d'appel par défaut.
const TUESDAY_10H = new Date('2026-11-10T09:00:00Z')
const WAIT = { timeout: 4000, interval: 50 }

const app = express()
app.use('/api/telephony', telephonyRoutes)
app.use(express.json())
app.use('/api/commercial', liveTranscriptRoutes.rep)
app.use('/api/commercial', commercialRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})
let server: Server
let port: number

// Faux AssemblyAI en continu : chaque séance garde son URL, sa clé, son audio et ses messages.
interface ProviderSession {
  url: URL
  auth: string | undefined
  audio: Buffer[]
  messages: string[]
  socket: WebSocket
  closed: boolean
}
let provider: WebSocketServer
let providerSessions: ProviderSession[]

let repA: string
let cookieA: string
let cookieB: string

const sign = (path: string, params: Record<string, string>) =>
  twilio.getExpectedTwilioSignature(AUTH_TOKEN, `${PUBLIC_URL}/api/telephony/twilio${path}`, params)
const twilioPost = (path: string, params: Record<string, string>) =>
  request(app)
    .post(`/api/telephony/twilio${path}`)
    .type('form')
    .set('X-Twilio-Signature', sign(path, params))
    .send(params)
const streamSignature = twilio.getExpectedTwilioSignature(AUTH_TOKEN, `wss://venio.test${LIVE_STREAM_PATH}`, {})

async function setLive(live: boolean) {
  await CrmSettings.getSettings()
  await CrmSettings.updateOne({}, { $set: { 'callTranscription.live': live } })
}

async function placeCall(callSid = 'CAparent1') {
  const lead = await Lead.create({ company: 'Alpha', externalRep: repA, contactPhone: '+33612345678' })
  const launched = await request(app)
    .post(`/api/commercial/leads/${lead._id}/calls`)
    .set('Cookie', cookieA)
    .send({ clientRequestId: crypto.randomUUID() })
  const callId = String(launched.body.callId)
  const voice = await twilioPost('/voice', { CallSid: callSid, From: `client:u_${repA}`, To: '', callId })
  const token = /<Parameter name="token" value="([^"]+)"\/>/.exec(voice.text)?.[1] ?? ''
  return { callId, twiml: voice.text, token }
}

/** Le flux que Twilio ouvrirait : poignée de main signée, puis `connected` et `start`. */
async function openStream(
  start: { callId: string; token: string; callSid?: string },
  signature = streamSignature,
): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${LIVE_STREAM_PATH}`, {
    headers: { 'X-Twilio-Signature': signature },
  })
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', reject)
  })
  socket.send(JSON.stringify({ event: 'connected', protocol: 'Call', version: '1.0.0' }))
  socket.send(
    JSON.stringify({
      event: 'start',
      streamSid: 'MZ1',
      start: {
        streamSid: 'MZ1',
        accountSid: 'ACtest',
        callSid: start.callSid ?? 'CAparent1',
        tracks: ['inbound', 'outbound'],
        customParameters: { callId: start.callId, token: start.token },
        mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 },
      },
    }),
  )
  return socket
}

/** 100 ms d'audio µ-law par piste (cinq messages de 20 ms), d'un octet reconnaissable. */
function sendAudio(socket: WebSocket, track: 'inbound' | 'outbound', byte: number) {
  for (let chunk = 0; chunk < 5; chunk++) {
    const payload = Buffer.alloc(160, byte).toString('base64')
    socket.send(JSON.stringify({ event: 'media', streamSid: 'MZ1', media: { track, chunk: String(chunk), payload } }))
  }
}

/** Abonné SSE réel : garde les événements reçus. */
function openLive(callId: string, cookie: string) {
  const events: { event: string; data: Record<string, unknown> }[] = []
  let ended = false
  const ready = new Promise<number>((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: `/api/commercial/calls/${callId}/live`, headers: { Cookie: cookie } },
      (res) => {
        resolve(res.statusCode ?? 0)
        let buffer = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          buffer += chunk
          let cut
          while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, cut)
            buffer = buffer.slice(cut + 2)
            const event = /^event: (.+)$/m.exec(block)?.[1]
            const data = /^data: (.+)$/m.exec(block)?.[1]
            if (event && data) events.push({ event, data: JSON.parse(data) })
          }
        })
        res.on('end', () => (ended = true))
      },
    )
    closers.push(() => req.destroy())
  })
  return { ready, events, isEnded: () => ended }
}
const closers: (() => void)[] = []

const sessionFor = (byte: number) =>
  providerSessions.find((session) => session.audio.some((chunk) => chunk[0] === byte))

beforeAll(async () => {
  await setupMongoReplSet()
  await Promise.all([Lead, Call, CrmSettings].map((model) => (model as typeof Lead).init()))
  server = createServer(app)
  attachLiveTranscriptionServer(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
  provider = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  provider.on('connection', (socket, req) => {
    const session: ProviderSession = {
      url: new URL(req.url ?? '/', 'ws://provider'),
      auth: req.headers.authorization,
      audio: [],
      messages: [],
      socket,
      closed: false,
    }
    providerSessions.push(session)
    socket.on('message', (data, isBinary) =>
      isBinary ? session.audio.push(data as Buffer) : session.messages.push(String(data)),
    )
    socket.on('close', () => (session.closed = true))
  })
  await new Promise((resolve) => provider.once('listening', resolve))
})
afterAll(async () => {
  provider.close()
  server.close()
  await teardownMongo()
})
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: TUESDAY_10H })
  Object.assign(process.env, ENV, {
    ASSEMBLYAI_STREAMING_URL: `ws://127.0.0.1:${(provider.address() as AddressInfo).port}/v3/ws`,
  })
  providerSessions = []
  vi.mocked(stopTwilioStream).mockClear()
  await clearDb()
  const users = await User.create([
    { name: 'Anna', email: 'anna@live.test', passwordHash: 'unused', role: 'COMMERCIAL_EXTERNE' },
    { name: 'Bruno', email: 'bruno@live.test', passwordHash: 'unused', role: 'COMMERCIAL_EXTERNE' },
  ])
  repA = String(users[0]!._id)
  cookieA = `venio_session=${(await createSession(repA)).token}`
  cookieB = `venio_session=${(await createSession(String(users[1]!._id))).token}`
})
afterEach(() => {
  stopAllLiveSessions()
  for (const close of closers.splice(0)) close()
  vi.useRealTimers()
  for (const key of [...Object.keys(ENV), 'ASSEMBLYAI_STREAMING_URL']) delete process.env[key]
})

it('TwiML : flux des deux voix seulement si le réglage est actif et l’appel enregistré ; sinon le navigateur ne se reconnecte pas (204)', async () => {
  await setLive(false)
  const off = await placeCall('CAoff')
  expect(off.twiml).not.toContain('<Start>')
  expect(await openLive(off.callId, cookieA).ready).toBe(204)

  await setLive(true)
  const on = await placeCall('CAon')
  expect(on.twiml).toContain(
    `<Response><Start><Stream url="wss://venio.test${LIVE_STREAM_PATH}" track="both_tracks" name="venio-live">` +
      `<Parameter name="callId" value="${on.callId}"/>`,
  )
  expect(on.token).not.toBe('')
  expect(on.twiml).toContain('record="record-from-answer-dual"')

  // Appel non enregistré (enregistrement coupé) : pas de direct, le prospect n'a pas été prévenu.
  await CrmSettings.updateOne({}, { $set: { 'callRecording.enabled': false } })
  expect((await placeCall('CAunrecorded')).twiml).not.toContain('<Start>')
})

it('flux Twilio : signature forgée refusée ; jeton ou appel parent faux, fermé sans rien ouvrir chez le fournisseur', async () => {
  await setLive(true)
  const { callId, token } = await placeCall()
  await expect(openStream({ callId, token }, 'forged')).rejects.toThrow(/403/)

  for (const start of [
    { callId, token: 'faux' },
    { callId, token, callSid: 'CAother' },
  ]) {
    const socket = await openStream(start)
    await vi.waitFor(() => expect(socket.readyState).toBe(WebSocket.CLOSED), WAIT)
  }
  expect(getLiveSession(callId)).toBeUndefined()
  expect(providerSessions).toHaveLength(0)
})

it('direct : rien chez le fournisseur avant la décroche, deux séances européennes µ-law, texte au seul auteur, jamais en base, effacé à la fin', async () => {
  await setLive(true)
  const { callId, token } = await placeCall()
  const live = openLive(callId, cookieA)
  expect(await live.ready).toBe(200)
  expect(await openLive(callId, cookieB).ready).toBe(404)

  const socket = await openStream({ callId, token })
  await vi.waitFor(() => expect(getLiveSession(callId)?.status).toBe('WAITING'), WAIT)
  sendAudio(socket, 'inbound', 1)
  sendAudio(socket, 'outbound', 2)
  await new Promise((resolve) => setTimeout(resolve, 1200))
  expect(providerSessions).toHaveLength(0)

  await twilioPost(`/status?callId=${callId}`, { CallStatus: 'in-progress', ParentCallSid: 'CAparent1' }).expect(204)
  await vi.waitFor(() => expect(providerSessions).toHaveLength(2), WAIT)
  for (const session of providerSessions) {
    expect(session.auth).toBe('test-key')
    expect(Object.fromEntries(session.url.searchParams)).toMatchObject({
      encoding: 'pcm_mulaw',
      sample_rate: '8000',
      speech_model: 'universal-streaming-multilingual',
    })
  }
  // Le « allô » d'avant la décroche est relayé, chaque voix dans sa séance.
  await vi.waitFor(() => expect(sessionFor(1) && sessionFor(2)).toBeTruthy(), WAIT)
  expect(sessionFor(1)).not.toBe(sessionFor(2))
  expect(sessionFor(1)!.audio.every((chunk) => chunk.every((byte) => byte === 1))).toBe(true)

  sessionFor(2)!.socket.send(
    JSON.stringify({ type: 'Turn', turn_order: 0, transcript: 'Oui bonjour', end_of_turn: false }),
  )
  sessionFor(2)!.socket.send(
    JSON.stringify({ type: 'Turn', turn_order: 0, transcript: 'Oui, bonjour.', end_of_turn: true }),
  )
  sessionFor(1)!.socket.send(
    JSON.stringify({ type: 'Turn', turn_order: 0, transcript: 'Anna de Venio', end_of_turn: true }),
  )
  await vi.waitFor(() => expect(live.events.filter((e) => e.event === 'segment')).toHaveLength(3), WAIT)
  expect(live.events.filter((e) => e.event === 'segment').map((e) => e.data)).toMatchObject([
    { id: 'PROSPECT-0', speaker: 'PROSPECT', text: 'Oui bonjour', final: false },
    { id: 'PROSPECT-0', speaker: 'PROSPECT', text: 'Oui, bonjour.', final: true },
    { id: 'REP-0', speaker: 'REP', text: 'Anna de Venio', final: true },
  ])
  // Un navigateur rechargé retrouve le texte courant.
  const reloaded = openLive(callId, cookieA)
  await vi.waitFor(() => expect(reloaded.events.filter((e) => e.event === 'segment')).toHaveLength(2), WAIT)

  // Rien en base : aucun document ne contient le texte.
  const db = mongoose.connection.db!
  for (const { name } of await db.listCollections().toArray()) {
    const docs = await db.collection(name).find().toArray()
    expect(JSON.stringify(docs)).not.toMatch(/bonjour|Anna de Venio/i)
  }

  socket.send(JSON.stringify({ event: 'stop', streamSid: 'MZ1', stop: { callSid: 'CAparent1' } }))
  await vi.waitFor(() => expect(live.isEnded()).toBe(true), WAIT)
  expect(live.events.slice(-2)).toEqual([
    { event: 'clear', data: {} },
    { event: 'state', data: { status: 'ENDED' } },
  ])
  await vi.waitFor(() => expect(providerSessions.every((session) => session.closed)).toBe(true), WAIT)
  expect(providerSessions.every((session) => session.messages.includes('{"type":"Terminate"}'))).toBe(true)
  expect(getLiveSession(callId)).toBeUndefined()
  expect(stopTwilioStream).not.toHaveBeenCalled()
})

it('opposition en cours d’appel : flux, séances et texte coupés aussitôt, arrêt demandé à Twilio', async () => {
  await setLive(true)
  const { callId, token } = await placeCall()
  const live = openLive(callId, cookieA)
  await live.ready
  const socket = await openStream({ callId, token })
  await twilioPost(`/status?callId=${callId}`, { CallStatus: 'in-progress', ParentCallSid: 'CAparent1' }).expect(204)
  await vi.waitFor(() => expect(providerSessions).toHaveLength(2), WAIT)
  sendAudio(socket, 'outbound', 2)
  await vi.waitFor(() => expect(sessionFor(2)).toBeTruthy(), WAIT)
  sessionFor(2)!.socket.send(
    JSON.stringify({ type: 'Turn', turn_order: 0, transcript: 'Je refuse', end_of_turn: true }),
  )
  await vi.waitFor(() => expect(live.events.some((e) => e.event === 'segment')).toBe(true), WAIT)

  await request(app).post(`/api/commercial/calls/${callId}/recording/stop`).set('Cookie', cookieA).expect(200)
  await vi.waitFor(() => expect(live.isEnded()).toBe(true), WAIT)
  expect(live.events.slice(-2)).toEqual([
    { event: 'clear', data: {} },
    { event: 'state', data: { status: 'ENDED' } },
  ])
  await vi.waitFor(() => expect(socket.readyState).toBe(WebSocket.CLOSED), WAIT)
  await vi.waitFor(() => expect(providerSessions.every((session) => session.closed)).toBe(true), WAIT)
  // Coupure franche : pas de fin de séance négociée, plus aucun audio relayé.
  expect(providerSessions.some((session) => session.messages.includes('{"type":"Terminate"}'))).toBe(false)
  expect(stopTwilioStream).toHaveBeenCalledWith(expect.objectContaining({ accountSid: 'ACtest' }), 'CAparent1', 'MZ1')
  expect(getLiveSession(callId)).toBeUndefined()
  expect(await openLive(callId, cookieA).ready).toBe(204)
})
