import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { setupMongoReplSet, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import { generateAgentToken } from '../lib/agent/tokens.js'
import commercialRoutes from '../routes/commercial/index.js'
import agentCrmRoutes from '../routes/agent/crm.js'
import agentAuth from '../routes/agent/_middleware/auth.js'
import agentIdempotency from '../routes/agent/_middleware/idempotency.js'
import Lead from '../models/Lead.js'
import Interaction from '../models/Interaction.js'
import LeadActivity from '../models/LeadActivity.js'
import User from '../models/User.js'
import AgentToken from '../models/AgentToken.js'
import AgentIdempotencyKey from '../models/AgentIdempotencyKey.js'
import UserIdempotencyKey from '../models/UserIdempotencyKey.js'
import SyncTombstone from '../models/SyncTombstone.js'
import type { ICrmSettings } from '../types/models/index.js'
import CrmSettings from '../models/CrmSettings.js'

vi.mock('../lib/notifyHelpers.js', () => ({ notifyUsers: vi.fn().mockResolvedValue(undefined) }))
const app = express()
app.use(express.json({ limit: '2mb' }))
app.use('/api/commercial', commercialRoutes)
app.use('/api/v1/agent', agentAuth, agentIdempotency, agentCrmRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})
let repA: string
let repB: string
let cookieA: string
const get = (path: string) => request(app).get(`/api/commercial${path}`).set('Cookie', cookieA)
const post = (path: string, body: object) =>
  request(app).post(`/api/commercial${path}`).set('Cookie', cookieA).send(body)
const lead = (company: string, extra: object = {}) =>
  Lead.create({ company, businessContact: true, externalRep: repA, contactPhone: '+33612345678', ...extra })
const quick = (outcome: string, extra: object = {}) => ({
  clientRequestId: crypto.randomUUID(),
  note: 'Échange rapide',
  outcome,
  scriptTag: 'DEFAULT',
  nextActionAt: null,
  ...extra,
})

beforeAll(async () => {
  await setupMongoReplSet()
  await Promise.all([
    Lead.init(),
    SyncTombstone.init(),
    Interaction.init(),
    LeadActivity.init(),
    CrmSettings.init(),
    UserIdempotencyKey.init(),
    AgentIdempotencyKey.init(),
  ])
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  const users = await User.create([
    { name: 'Anna', email: 'anna@call.test', passwordHash: 'unused', role: 'COMMERCIAL_EXTERNE' },
    { name: 'Bruno', email: 'bruno@call.test', passwordHash: 'unused', role: 'COMMERCIAL_EXTERNE' },
  ])
  repA = String(users[0]!._id)
  repB = String(users[1]!._id)
  cookieA = `venio_session=${(await createSession(repA)).token}`
})

it('cloisonne fiche, file, filtres et écriture, même après réattribution', async () => {
  const own = await lead('Alpha', { callList: 'A' })
  const other = await lead('Beta', { externalRep: repB, callList: 'B' })
  expect((await get('/calls/queue')).body.leads.map((item: { company: string }) => item.company)).toEqual(['Alpha'])
  expect((await get('/calls/filters')).body.lists).toEqual(['A'])
  expect((await get(`/leads/${other._id}`)).status).toBe(404)
  expect((await post(`/leads/${other._id}/quick-call`, quick('DO_NOT_CALL'))).status).toBe(404)
  const input = quick('NO_ANSWER')
  expect((await post(`/leads/${own._id}/quick-call`, input)).status).toBe(201)
  await Lead.updateOne({ _id: own._id }, { externalRep: repB })
  expect((await post(`/leads/${own._id}/quick-call`, input)).status).toBe(404)
  expect((await Lead.findById(other._id))!.lastCallAt).toBeNull()
})

it('enregistre note, script, durée, relance et statut une seule fois', async () => {
  const item = await lead('Alpha')
  const settings = (await CrmSettings.getSettings()).toObject<ICrmSettings>()
  await CrmSettings.updateSettings({
    callScriptTags: ['SCRIPT_A'],
    callOutcomes: settings.callOutcomes.map((item) => ({
      ...item,
      value: item.effect === 'MEETING' ? 'APPOINTMENT' : item.value,
    })),
  })
  expect((await post(`/leads/${item._id}/quick-call`, quick('CALLBACK'))).status).toBe(400)
  const payload = quick('APPOINTMENT', {
    scriptTag: 'SCRIPT_A',
    durationSec: 42,
    nextActionAt: new Date(Date.now() + 86400000).toISOString(),
  })
  const first = await post(`/leads/${item._id}/quick-call`, payload)
  expect(first.status).toBe(201)
  expect((await post(`/leads/${item._id}/quick-call`, payload)).body).toEqual(first.body)
  expect((await post(`/leads/${item._id}/quick-call`, { ...payload, note: 'Modifiée' })).status).toBe(409)
  const stored = await Lead.findById(item._id)
  expect(stored?.status).toBe('DEMO')
  expect(stored?.lastCallOutcome).toBe('APPOINTMENT')
  expect(stored?.interactionsCount).toBe(1)
  expect(stored?.lastInteractionAt).toBeTruthy()
  expect(stored?.nextActionAt?.toISOString()).toBe(payload.nextActionAt)
  expect(await Interaction.countDocuments({ subjectId: item._id })).toBe(1)
  expect(await LeadActivity.countDocuments({ leadId: item._id, type: 'STATUS_CHANGE' })).toBe(1)
  expect(await Interaction.findOne({ subjectId: item._id }).lean()).toMatchObject({
    kind: 'CALL',
    body: 'Échange rapide',
    outcome: 'APPOINTMENT',
    scriptTag: 'SCRIPT_A',
    durationSec: 42,
  })
  const undoPath = `/api/commercial/leads/${item._id}/quick-call/${first.body.interactionId}/undo`
  const cookieB = `venio_session=${(await createSession(repB)).token}`
  expect((await request(app).post(undoPath).set('Cookie', cookieB)).status).toBe(404)
  expect((await request(app).post(undoPath).set('Cookie', cookieA)).status).toBe(200)
  expect(await Lead.findById(item._id).lean()).toMatchObject({
    status: 'LEAD',
    statusChangedAt: null,
    lastCallAt: null,
    lastCallOutcome: null,
    lastContactAt: null,
    nextActionAt: null,
    interactionsCount: 0,
    lastInteractionAt: null,
  })
  expect(await Interaction.countDocuments({ subjectId: item._id })).toBe(0)
  expect(await LeadActivity.countDocuments({ leadId: item._id, type: 'STATUS_CHANGE' })).toBe(0)
  expect(await SyncTombstone.exists({ entityType: 'interactions', entityId: first.body.interactionId })).toBeTruthy()
  await Lead.updateOne({ _id: item._id }, { closingHandoff: { at: new Date(), by: repA } })
  expect((await post(`/leads/${item._id}/quick-call`, quick('NO_ANSWER', { scriptTag: 'SCRIPT_A' }))).status).toBe(409)
})

it('ordonne la file par curseur et exclut refus, mauvais numéros, relances futures et closing', async () => {
  const past = new Date(Date.now() - 86400_000)
  const list = { callList: 'Salon', project: 'VENIO' }
  const due = await lead('Relance due', { ...list, nextActionAt: past })
  const beforeCall = Date.now()
  expect((await post(`/leads/${due._id}/quick-call`, quick('NO_ANSWER'))).status).toBe(201)
  const retried = await Lead.findById(due._id)
  expect(retried!.nextActionAt!.getTime()).toBeGreaterThanOrEqual(beforeCall + 240 * 60000)
  expect(retried!.lastContactAt).toBeNull()
  await lead('Relance', { ...list, nextActionAt: past })
  // Lead antérieur à l'import : le champ n'existe pas en base.
  await Lead.collection.updateOne({ company: 'Relance' }, { $unset: { extraInfo: '' } })
  await lead('Vierge', list)
  await lead('Archivé', { ...list, archivedAt: past })
  await lead('Opposé par le CRM', { ...list, doNotContact: true })
  const voicemail = await lead('Messagerie', list)
  expect((await post(`/leads/${voicemail._id}/quick-call`, quick('VOICEMAIL'))).status).toBe(201)
  await lead('Déjà appelé', { ...list, lastCallAt: past, lastCallOutcome: 'NO_ANSWER' })
  await Lead.updateOne({ _id: voicemail._id }, { nextActionAt: null })
  const wrong = await lead('Mauvais numéro', list)
  expect((await post(`/leads/${wrong._id}/quick-call`, quick('WRONG_NUMBER'))).status).toBe(201)
  expect((await Lead.findById(wrong._id))!.phoneInvalid).toBe(true)
  expect((await post(`/leads/${wrong._id}/quick-call`, quick('NO_ANSWER'))).status).toBe(409)
  await lead('Sans téléphone', { ...list, contactPhone: '   ' })
  // Numéro propre : un refus inscrit le numéro en opposition pour toutes les fiches qui le portent.
  const blocked = await lead('Refus', { ...list, contactPhone: '+33699999999' })
  const refusal = quick('DO_NOT_CALL')
  const [refused, replayed] = await Promise.all([
    post(`/leads/${blocked._id}/quick-call`, refusal),
    post(`/leads/${blocked._id}/quick-call`, refusal),
  ])
  expect(refused.status).toBe(201)
  expect(replayed.body).toEqual(refused.body)
  await Lead.updateOne({ _id: blocked._id }, { status: 'CONTACTED', lastCallOutcome: 'NO_ANSWER', nextActionAt: past })
  await lead('Demain', { ...list, nextActionAt: new Date(Date.now() + 86400_000) })
  await lead('Autre liste', { ...list, callList: 'Web' })
  await lead('Autre projet', { ...list, project: 'ARROW' })
  await lead('Transmis', { ...list, closingHandoff: { at: past, by: repA } })
  const first = await get('/calls/queue?callList=Salon&project=VENIO&limit=2')
  expect(first.body.leads.map((item: { company: string }) => item.company)).toEqual(['Relance', 'Vierge'])
  expect(first.body.leads[0].extraInfo).toEqual({})
  const second = await get(
    `/calls/queue?callList=Salon&project=VENIO&limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
  )
  expect(second.body.leads.map((item: { company: string }) => item.company)).toEqual(['Messagerie', 'Déjà appelé'])
  expect(second.body.nextCursor).toBeNull()
  expect((await post(`/leads/${voicemail._id}/interactions`, { kind: 'CALL', body: 'Rappel consigné' })).status).toBe(
    201,
  )
  expect((await Lead.findById(voicemail._id))?.lastCallOutcome).toBeNull()

  expect(
    (
      await post(
        `/leads/${blocked._id}/quick-call`,
        quick('CALLBACK', { nextActionAt: new Date(Date.now() + 3600000).toISOString() }),
      )
    ).status,
  ).toBe(409)
  await Lead.updateOne({ _id: wrong._id }, { $set: { contactPhone: '+33634567890' } })
  expect((await Lead.findById(wrong._id))!.phoneInvalid).toBe(false)
  expect((await post(`/leads/${wrong._id}/quick-call`, quick('WRONG_NUMBER'))).status).toBe(201)
  const corrected = await Lead.findById(wrong._id)
  corrected!.contactPhone = '+33645678901'
  await corrected!.save()
  expect(corrected!.phoneInvalid).toBe(false)
})

it('importe un CSV mappé avec dédoublonnage normalisé et rapport idempotent', async () => {
  await lead('Existant', { contactPhone: '06 12 34 56 78' })
  await lead('Autre commercial', { externalRep: repB, contactPhone: '+33623456789' })
  const key = crypto.randomUUID()
  const payload = {
    csv: '"Société";"Mobile";"Commentaire";"Site"\nDoublon;0033 6 12 34 56 78;doublon;\nCréé;06 23 45 67 89;"ligne 1\nligne 2";https://example.com\nBis;+33 6 23 45 67 89;doublon;\n\nRejet;abc;invalide;',
    mapping: { company: 'Société', contactPhone: 'Mobile', notes: 'Commentaire' },
    callList: 'Salon',
    project: 'VENIO',
    externalRep: repB,
    businessContact: true,
  }
  const send = () =>
    request(app).post('/api/commercial/calls/import').set('Cookie', cookieA).set('Idempotency-Key', key).send(payload)
  const first = await send()
  expect(first.status).toBe(201)
  expect(first.body).toMatchObject({ created: 1, duplicates: 2, rejected: 1 })
  expect((await send()).body).toEqual(first.body)
  expect(first.body.errors).toEqual([{ row: 7, reason: 'INVALID_PHONE' }])
  expect(await Lead.findOne({ company: 'Créé' }).lean()).toMatchObject({
    externalRep: new mongoose.Types.ObjectId(repA),
    contactPhone: '+33623456789',
    notes: 'ligne 1\nligne 2',
    extraInfo: { Site: 'https://example.com' },
    callList: 'Salon',
    project: 'VENIO',
  })
  expect(await Lead.countDocuments({ externalRep: repA })).toBe(2)
})

it('importe en JSON via le scope agent avec Idempotency-Key et rattachement explicite', async () => {
  const token = await generateAgentToken()
  await AgentToken.create({ name: 'Test local', prefix: token.prefix, tokenHash: token.hash, scopes: ['write:crm'] })
  const key = crypto.randomUUID()
  const payload = {
    externalRep: repB,
    region: 'BE',
    callList: 'Agent',
    businessContact: true,
    leads: [{ company: 'BE lead', contactPhone: '02 555 01 23', extraInfo: { Segment: 'B2B' } }],
  }
  const send = (body = payload, idempotencyKey = key) =>
    request(app)
      .post('/api/v1/agent/leads/import')
      .set('Authorization', `Bearer ${token.plain}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
  const [first, simultaneous] = await Promise.all([send(), send()])
  expect(first.status).toBe(201)
  expect(simultaneous.body).toEqual(first.body)
  expect(await AgentIdempotencyKey.countDocuments({ key })).toBe(1)
  expect((await send()).body).toEqual(first.body)
  expect((await send({ ...payload, callList: 'Modifiée' })).status).toBe(409)
  expect(await Lead.countDocuments({ externalRep: repB })).toBe(1)
  expect(await Lead.findOne({ externalRep: repB }).lean()).toMatchObject({
    contactPhone: '+3225550123',
    phoneCountry: 'BE',
    businessContact: true,
    extraInfo: { Segment: 'B2B' },
  })
  expect((await get('/calls/queue')).body.leads).toEqual([])
  expect((await send({ ...payload, externalRep: repA }, crypto.randomUUID())).body.created).toBe(1)
  expect(
    (await request(app).post('/api/v1/agent/leads/import').set('Authorization', `Bearer ${token.plain}`).send(payload))
      .status,
  ).toBe(400)
})
