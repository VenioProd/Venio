import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import commercialRoutes from '../routes/commercial/index.js'
import CallTranscript from '../models/CallTranscript.js'
import Lead from '../models/Lead.js'
import CrmSettings from '../models/CrmSettings.js'
import User from '../models/User.js'
import {
  MAX_ATTEMPTS,
  onTranscriptDone,
  purgeTranscripts,
  requestTranscription,
  setTranscriptionAudioSource,
  sweepTranscriptions,
  type TranscriptDone,
} from '../lib/transcription/index.js'

const app = express()
app.use(express.json())
app.use('/api/commercial', commercialRoutes)

// Faux AssemblyAI : répond selon le chemin et garde trace des requêtes.
type Reply = { status: number; body?: unknown }
let routes: Record<string, () => Reply>
let calls: Array<{ method: string; url: string; body: unknown }>
const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  const method = init.method ?? 'GET'
  const path = new URL(url).pathname
  calls.push({ method, url, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body })
  const reply = (routes[`${method} ${path}`] ?? (() => ({ status: 404 })))()
  return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status })
})

const handled: TranscriptDone[] = []
onTranscriptDone(async (t) => {
  handled.push(t)
})

let repA: string
let repB: string
const ids = () => ({
  callId: new mongoose.Types.ObjectId().toString(),
  leadId: new mongoose.Types.ObjectId().toString(),
})
const audio = (channels: 1 | 2 = 2, repChannel: 0 | 1 = 0) => ({
  fetch: vi.fn(async () => Buffer.from('RIFF-audio')),
  mimeType: 'audio/wav',
  channels,
  repChannel,
})
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000)

beforeAll(async () => {
  await setupMongo()
  await CallTranscript.init()
  vi.stubGlobal('fetch', fetchMock)
})
afterAll(async () => {
  vi.unstubAllGlobals()
  await teardownMongo()
})
beforeEach(async () => {
  await clearDb()
  process.env.ASSEMBLYAI_API_KEY = 'test-key'
  calls = []
  handled.length = 0
  routes = {
    'POST /v2/upload': () => ({ status: 200, body: { upload_url: 'https://cdn.example/upload/1' } }),
    'POST /v2/transcript': () => ({ status: 200, body: { id: 'job-1' } }),
    'DELETE /v2/transcript/job-1': () => ({ status: 200, body: { id: 'job-1' } }),
  }
  const users = await User.create([
    { name: 'Anna', email: 'anna@tr.test', passwordHash: 'unused', role: 'COMMERCIAL_EXTERNE' },
    { name: 'Bruno', email: 'bruno@tr.test', passwordHash: 'unused', role: 'COMMERCIAL_EXTERNE' },
  ])
  repA = String(users[0]!._id)
  repB = String(users[1]!._id)
})
afterEach(() => setTranscriptionAudioSource(null))

it('deux canaux : un locuteur par canal selon repChannel, puis suppression chez le fournisseur', async () => {
  const { callId, leadId } = ids()
  await requestTranscription({ callId, leadId, authorId: repA, audio: audio(2, 1) })
  const submit = calls.find((c) => c.url.endsWith('/v2/transcript'))!
  expect(calls[0]!.url).toBe('https://api.eu.assemblyai.com/v2/upload')
  expect(submit.body).toEqual({ audio_url: 'https://cdn.example/upload/1', language_code: 'fr', multichannel: true })

  routes['GET /v2/transcript/job-1'] = () => ({
    status: 200,
    body: {
      status: 'completed',
      audio_duration: 42,
      utterances: [
        { channel: '1', speaker: '1', start: 0, end: 900, text: 'Allô ?' },
        { channel: '2', speaker: '2', start: 1000, end: 3000, text: 'Bonjour, Anna de Venio.' },
      ],
    },
  })
  expect(await sweepTranscriptions()).toEqual({ polled: 1, done: 1, failed: 0 })
  const t = await CallTranscript.findOne({ call: callId }).lean()
  expect(t!.status).toBe('DONE')
  expect(t!.segments.map((s) => s.speaker)).toEqual(['PROSPECT', 'REP'])
  expect(t!.providerDeletedAt).not.toBeNull()
  expect(calls.some((c) => c.method === 'DELETE')).toBe(true)
  expect(handled).toEqual([expect.objectContaining({ callId, leadId, authorId: repA, durationSec: 42 })])
})

it('audio mono : diarisation demandée, la première voix est le prospect', async () => {
  const { callId, leadId } = ids()
  await requestTranscription({ callId, leadId, authorId: repA, audio: audio(1) })
  expect(calls.find((c) => c.url.endsWith('/v2/transcript'))!.body).toMatchObject({
    speaker_labels: true,
    speakers_expected: 2,
  })
  routes['GET /v2/transcript/job-1'] = () => ({
    status: 200,
    body: {
      status: 'completed',
      utterances: [
        { speaker: 'A', start: 0, end: 500, text: 'Oui ?' },
        { speaker: 'B', start: 600, end: 900, text: 'Bonjour' },
      ],
    },
  })
  await sweepTranscriptions()
  const t = await CallTranscript.findOne({ call: callId }).lean()
  expect(t!.segments.map((s) => s.speaker)).toEqual(['PROSPECT', 'REP'])
})

it('une seule demande par appel, même en parallèle', async () => {
  const { callId, leadId } = ids()
  const results = await Promise.all(
    [1, 2, 3].map(() => requestTranscription({ callId, leadId, authorId: repA, audio: audio() })),
  )
  expect(new Set(results.map((r) => r.transcriptId)).size).toBe(1)
  expect(await CallTranscript.countDocuments({ call: callId })).toBe(1)
  expect(calls.filter((c) => c.url.endsWith('/v2/upload'))).toHaveLength(1)
})

it('reprend une demande restée en plan, et abandonne après un nombre borné d’essais', async () => {
  routes['POST /v2/upload'] = () => ({ status: 503 })
  const first = ids()
  await requestTranscription({ ...first, authorId: repA, audio: audio() })
  let t = await CallTranscript.findOne({ call: first.callId }).lean()
  expect(t).toMatchObject({ status: 'PENDING', attempts: 1, error: 'UPLOAD_FAILED (HTTP 503)' })

  // Bail en cours : le balayage n'y touche pas.
  expect(await sweepTranscriptions()).toEqual({ polled: 0, done: 0, failed: 0 })
  routes['POST /v2/upload'] = () => ({ status: 200, body: { upload_url: 'https://cdn.example/upload/1' } })
  const source = audio()
  setTranscriptionAudioSource(async () => source)
  await sweepTranscriptions(later(30))
  t = await CallTranscript.findOne({ call: first.callId }).lean()
  expect(t).toMatchObject({ status: 'PROCESSING', providerJobId: 'job-1', error: '' })
  expect(source.fetch).toHaveBeenCalledOnce()

  // Sans source d'audio, chaque balayage compte un essai, puis l'échec est définitif.
  setTranscriptionAudioSource(null)
  routes['POST /v2/upload'] = () => ({ status: 503 })
  const second = ids()
  await requestTranscription({ ...second, authorId: repA, audio: audio() })
  for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
    await CallTranscript.updateOne({ call: second.callId }, { $set: { leaseUntil: new Date(0) } })
    routes['GET /v2/transcript/job-1'] = () => ({ status: 200, body: { status: 'processing' } })
    await sweepTranscriptions()
  }
  t = await CallTranscript.findOne({ call: second.callId }).lean()
  expect(t).toMatchObject({ status: 'FAILED', attempts: MAX_ATTEMPTS, error: 'AUDIO_UNAVAILABLE' })
})

it('purge les transcripts arrivés à échéance, garde les autres', async () => {
  await CrmSettings.create({ callTranscription: { retentionMonths: 3 } })
  const kept = ids()
  const gone = ids()
  await requestTranscription({ ...kept, authorId: repA, audio: audio() })
  await requestTranscription({ ...gone, authorId: repA, audio: audio() })
  const created = await CallTranscript.findOne({ call: kept.callId }).lean()
  expect(created!.purgeAt.getTime() - created!.createdAt.getTime()).toBeGreaterThan(85 * 86_400_000)
  await CallTranscript.updateOne({ call: gone.callId }, { $set: { purgeAt: new Date(Date.now() - 1000) } })

  expect(await purgeTranscripts()).toEqual({ purged: 1 })
  expect(await CallTranscript.exists({ call: gone.callId })).toBeNull()
  expect(await CallTranscript.exists({ call: kept.callId })).not.toBeNull()
  expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1)
})

it('le transcript n’est lisible que par l’auteur de l’appel', async () => {
  const { callId } = ids()
  // La lecture exige aussi que le lead soit dans le périmètre de l'auteur (vague 2).
  const leadId = String((await Lead.create({ company: 'Alpha', externalRep: repA }))._id)
  await CallTranscript.create({
    call: callId,
    lead: leadId,
    author: repA,
    language: 'fr',
    status: 'DONE',
    channels: 2,
    segments: [{ speaker: 'REP', startMs: 0, endMs: 10, text: 'Bonjour' }],
    durationSec: 12,
    purgeAt: later(60),
  })
  const as = async (user: string, id = callId) =>
    request(app)
      .get(`/api/commercial/calls/${id}/transcript`)
      .set('Cookie', `venio_session=${(await createSession(user)).token}`)

  const own = await as(repA)
  expect(own.status).toBe(200)
  expect(own.body).toEqual({
    status: 'DONE',
    language: 'fr',
    segments: [{ speaker: 'REP', startMs: 0, endMs: 10, text: 'Bonjour' }],
    durationSec: 12,
  })
  expect((await as(repB)).status).toBe(404)
  expect((await as(repA, 'pas-un-id')).status).toBe(404)
})

it('sans clé : transcript SKIPPED, aucun appel au fournisseur', async () => {
  delete process.env.ASSEMBLYAI_API_KEY
  const { callId, leadId } = ids()
  const source = audio()
  await requestTranscription({ callId, leadId, authorId: repA, audio: source })
  const t = await CallTranscript.findOne({ call: callId }).lean()
  expect(t).toMatchObject({ status: 'SKIPPED', error: 'NOT_CONFIGURED' })
  expect(source.fetch).not.toHaveBeenCalled()
  expect(await sweepTranscriptions()).toEqual({ polled: 0, done: 0, failed: 0 })
  expect(calls).toHaveLength(0)
})

it('point d’accès hors UE : transcript SKIPPED, rien n’est envoyé (traitement en Europe exigé)', async () => {
  process.env.ASSEMBLYAI_BASE_URL = 'https://api.assemblyai.com'
  try {
    const { callId, leadId } = ids()
    const source = audio()
    await requestTranscription({ callId, leadId, authorId: repA, audio: source })
    const t = await CallTranscript.findOne({ call: callId }).lean()
    expect(t).toMatchObject({ status: 'SKIPPED', error: 'NOT_CONFIGURED' })
    expect(source.fetch).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  } finally {
    delete process.env.ASSEMBLYAI_BASE_URL
  }
})
