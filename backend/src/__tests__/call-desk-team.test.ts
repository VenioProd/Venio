import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import twilio from 'twilio'
import { setupMongoReplSet, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import commercialRoutes from '../routes/commercial/index.js'
import adminCallDeskRoutes from '../routes/admin/callDesk.js'
import telephonyRoutes from '../routes/telephony/index.js'
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
import { FIELD_KEYS } from '../lib/callAnalysis/schema.js'

vi.mock('../lib/notifyHelpers.js', () => ({
  notifyUsers: vi.fn().mockResolvedValue(undefined),
  notifySuperAdmins: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/telephony/rest.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/telephony/rest.js')>()),
  hangupProviderCall: vi.fn().mockResolvedValue(undefined),
  fetchProviderRecording: vi.fn().mockResolvedValue(Buffer.from('audio-mp3')),
}))

/**
 * Poste d'appel de l'équipe (lot G1) : une garde par test. Le périmètre de
 * l'équipe est son périmètre d'écriture du CRM, hors listes d'appel des
 * externes non transmises ; l'externe ne change pas.
 */
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
app.use('/api/admin/call-desk', adminCallDeskRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

type Who = { id: string; cookie: string }
let rep: Who // commercial externe
let admin: Who // écrit sur tout le CRM
let com: Who // commercial interne : écrit sur ses fiches seulement
let stagiaire: Who // VIEW_CRM sans MANAGE_CRM
let compta: Who // ni VIEW_CRM ni MANAGE_CRM

const at = (space: 'team' | 'rep', who: Who) => {
  const base = space === 'team' ? '/api/admin/call-desk' : '/api/commercial'
  return {
    get: (path: string) => request(app).get(`${base}${path}`).set('Cookie', who.cookie),
    post: (path: string, body: object = {}) => request(app).post(`${base}${path}`).set('Cookie', who.cookie).send(body),
  }
}
const team = (who: Who) => at('team', who)
const commercial = (who: Who) => at('rep', who)
const launch = (who: Who, leadId: unknown, space: 'team' | 'rep' = 'team') =>
  at(space, who).post(`/leads/${leadId}/calls`, { clientRequestId: crypto.randomUUID() })
const voice = (callId: string, from: string, callSid = `CA${crypto.randomUUID().slice(0, 8)}`) => {
  const params = { CallSid: callSid, From: `client:u_${from}`, To: '', callId }
  return request(app)
    .post('/api/telephony/twilio/voice')
    .type('form')
    .set(
      'X-Twilio-Signature',
      twilio.getExpectedTwilioSignature(AUTH_TOKEN, `${PUBLIC_URL}/api/telephony/twilio/voice`, params),
    )
    .send(params)
}
const queueIds = async (who: Who, query = '') =>
  ((await team(who).get(`/calls/queue${query}`)).body.leads as Array<{ _id: string }>).map((lead) => String(lead._id))

const future = () => new Date(Date.now() + 3 * 86400_000).toISOString()
const OUTPUT = () => ({
  summary: 'Le prospect veut une boutique en ligne.',
  suggestedOutcome: null,
  optOut: { detected: false, quote: null, quoteVerified: false },
  fields: [
    {
      key: 'sector',
      value: 'Restauration',
      confidence: 'HIGH',
      quote: 'Nous sommes un restaurant',
      quoteVerified: true,
    },
    {
      key: 'qualification.need',
      value: 'Une boutique',
      confidence: 'HIGH',
      quote: 'Il nous faut une boutique',
      quoteVerified: true,
    },
  ],
  heat: { score: 40, level: 'TIEDE', criteria: [] },
  actions: [{ id: 'a1', type: 'TASK', label: 'Préparer le devis', dueAt: future(), reason: 'Devis demandé' }],
})

/** Appel terminé, avec son transcript et son analyse prête à relire, au nom de `author`. */
async function finishedCall(author: Who, lead: { _id: unknown; contactPhone?: string }) {
  const call = await Call.create({
    lead: lead._id,
    author: author.id,
    to: lead.contactPhone ?? '+33600000000',
    from: TWILIO_ENV.TWILIO_CALLER_ID,
    clientRequestId: crypto.randomUUID(),
    attemptDay: '2026-11-09',
    attemptNo: 1,
    status: 'COMPLETED',
    answeredAt: new Date(Date.now() - 3600_000),
    durationSec: 95,
    recording: { status: 'READY', sid: 'REtest', channels: 2 },
  })
  const purgeAt = new Date(Date.now() + 365 * 86400_000)
  await CallTranscript.create({
    call: call._id,
    lead: lead._id,
    author: author.id,
    language: 'fr',
    channels: 2,
    status: 'DONE',
    segments: [{ speaker: 'PROSPECT', startMs: 0, endMs: 2000, text: 'Nous sommes un restaurant' }],
    purgeAt,
  })
  const analysis = await CallAnalysis.create({
    call: call._id,
    lead: lead._id,
    author: author.id,
    status: 'READY',
    output: OUTPUT(),
    callDate: new Date(),
    purgeAt,
  })
  return { call, analysis }
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
})
afterAll(teardownMongo)
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: TUESDAY_10H })
  Object.assign(process.env, TWILIO_ENV)
  await clearDb()
  const roles = [
    ['Rita', 'COMMERCIAL_EXTERNE'],
    ['Alice', 'ADMIN'],
    ['Carl', 'COMMERCIAL'],
    ['Sam', 'STAGIAIRE'],
    ['Cécile', 'COMPTABLE'],
  ] as const
  const who: Who[] = []
  for (const [name, role] of roles) {
    const user = await User.create({ name, email: `${name.toLowerCase()}@equipe.test`, passwordHash: 'unused', role })
    who.push({ id: String(user._id), cookie: `venio_session=${(await createSession(String(user._id))).token}` })
  }
  ;[rep, admin, com, stagiaire, compta] = who as [Who, Who, Who, Who, Who]
  await CrmSettings.updateSettings({ defaultCloserId: admin.id, callRecording: { keepAudioDays: 30 } } as never)
})
afterEach(() => {
  vi.useRealTimers()
  for (const key of Object.keys(TWILIO_ENV)) delete process.env[key]
})

const teamLead = (owner: Who, phone: string, extra: object = {}) =>
  Lead.create({ company: `Fiche ${phone}`, contactPhone: phone, assignedTo: owner.id, createdBy: owner.id, ...extra })
const repListLead = (phone: string, extra: object = {}) =>
  Lead.create({
    company: `Liste ${phone}`,
    contactPhone: phone,
    externalRep: rep.id,
    callList: 'Liste Rita',
    assignedTo: rep.id,
    createdBy: rep.id,
    ...extra,
  })

it('périmètre d’écriture : hors périmètre 404 ; sans MANAGE_CRM pas d’appel ; sans VIEW_CRM rien', async () => {
  const mine = await teamLead(com, '+33611111111')
  const others = await teamLead(admin, '+33622222222')
  const { call } = await finishedCall(admin, others)

  // La file : ses fiches par défaut, tout son périmètre d'écriture avec mine=0.
  expect(await queueIds(com)).toEqual([String(mine._id)])
  expect(await queueIds(com, '?mine=0')).toEqual([String(mine._id)])
  expect(await queueIds(admin)).toEqual([String(others._id)])
  expect((await queueIds(admin, '?mine=0')).sort()).toEqual([String(mine._id), String(others._id)].sort())

  // Le commercial interne n'écrit pas sur la fiche d'Alice : ni appel, ni lecture, ni validation.
  expect((await launch(com, others._id)).status).toBe(404)
  expect((await team(com).get(`/leads/${others._id}/calls`)).status).toBe(404)
  for (const path of [
    `/calls/${call._id}`,
    `/calls/${call._id}/transcript`,
    `/calls/${call._id}/analysis`,
    `/calls/${call._id}/recording`,
  ])
    expect((await team(com).get(path)).status).toBe(404)
  const apply = { clientRequestId: crypto.randomUUID(), fields: [{ key: 'sector', action: 'ACCEPT' }] }
  expect((await team(com).post(`/calls/${call._id}/analysis/apply`, apply)).status).toBe(404)
  expect((await team(com).post(`/calls/${call._id}/analysis/reject`)).status).toBe(404)
  expect((await team(com).post(`/calls/${call._id}/recording/stop`)).status).toBe(404)
  expect((await CallAnalysis.findById((await CallAnalysis.findOne({ call: call._id }))!._id))!.status).toBe('READY')

  // Sa propre fiche : appel, résultat rapide relié à l'appel (écrit par applyLeadChange).
  const launched = await launch(com, mine._id)
  expect(launched.status).toBe(201)
  const quick = await team(com).post(`/leads/${mine._id}/quick-call`, {
    clientRequestId: crypto.randomUUID(),
    outcome: 'NO_ANSWER',
    scriptTag: 'DEFAULT',
    callId: launched.body.callId,
  })
  expect(quick.status).toBe(201)
  expect(String((await Call.findById(launched.body.callId))!.interaction)).toBe(String(quick.body.interactionId))
  expect((await Lead.findById(mine._id))!.lastCallOutcome).toBe('NO_ANSWER')

  // VIEW_CRM sans MANAGE_CRM : lit la file, n'appelle pas.
  expect((await team(stagiaire).get('/calls/queue')).status).toBe(200)
  expect((await team(stagiaire).post('/calls/token')).status).toBe(403)
  expect((await launch(stagiaire, mine._id)).status).toBe(403)
  expect((await team(stagiaire).post(`/leads/${mine._id}/quick-call`, {})).status).toBe(403)
  // Ni VIEW_CRM ni MANAGE_CRM : rien.
  for (const path of [
    '/calls/queue',
    '/calls/config',
    '/calls/settings',
    `/calls/${call._id}`,
    `/leads/${mine._id}/calls`,
  ])
    expect((await team(compta).get(path)).status).toBe(403)
})

it('liste d’un externe : invisible de l’équipe avant le passage, lisible après ; l’externe garde la lecture, perd l’écriture', async () => {
  const listed = await repListLead('+33633333333')
  const { call } = await finishedCall(rep, listed)
  const callPaths = [
    `/calls/${call._id}`,
    `/calls/${call._id}/transcript`,
    `/calls/${call._id}/analysis`,
    `/calls/${call._id}/recording`,
  ]

  // Avant le passage au closer : rien, même pour un administrateur.
  expect(await queueIds(admin, '?mine=0')).toEqual([])
  expect((await team(admin).get(`/leads/${listed._id}/calls`)).status).toBe(404)
  for (const path of callPaths) expect((await team(admin).get(path)).status).toBe(404)
  expect(
    (await team(admin).post(`/calls/${call._id}/analysis/apply`, { clientRequestId: crypto.randomUUID() })).status,
  ).toBe(404)
  expect((await launch(admin, listed._id)).status).toBe(404)
  // Fiche saisie par l'externe hors liste d'appel : l'équipe la voit dans le CRM, pas ses appels.
  const own = await Lead.create({ company: 'Saisie Rita', contactPhone: '+33655555555', externalRep: rep.id })
  const { call: ownCall } = await finishedCall(rep, own)
  expect((await team(admin).get(`/leads/${own._id}/calls`)).body.calls).toEqual([])
  for (const suffix of ['', '/transcript', '/analysis', '/recording'])
    expect((await team(admin).get(`/calls/${ownCall._id}${suffix}`)).status).toBe(404)

  // Passage au closer (Alice, réglage du CRM).
  expect((await commercial(rep).post(`/leads/${listed._id}/ready-to-close`)).status).toBe(200)

  const list = await team(admin).get(`/leads/${listed._id}/calls`)
  expect(list.status).toBe(200)
  expect(list.body.calls).toEqual([
    expect.objectContaining({
      _id: String(call._id),
      transcriptStatus: 'DONE',
      analysisStatus: 'READY',
      author: { _id: rep.id, name: 'Rita' },
      own: false,
    }),
  ])
  for (const path of callPaths) expect((await team(admin).get(path)).status).toBe(200)
  const analysis = await team(admin).get(`/calls/${call._id}/analysis`)
  expect(analysis.body.acceptableKeys).toEqual([...FIELD_KEYS])
  expect(analysis.body.current).toHaveProperty('sector')
  // Carl n'écrit pas sur la fiche transmise à Alice : toujours rien.
  for (const path of callPaths) expect((await team(com).get(path)).status).toBe(404)

  // L'externe lit toujours, mais n'écrit plus.
  for (const path of [`/calls/${call._id}`, `/calls/${call._id}/transcript`, `/calls/${call._id}/analysis`])
    expect((await commercial(rep).get(path)).status).toBe(200)
  const repApply = await commercial(rep).post(`/calls/${call._id}/analysis/apply`, {
    clientRequestId: crypto.randomUUID(),
    fields: [{ key: 'qualification.need', action: 'ACCEPT' }],
  })
  expect(repApply.body.code).toBe('LEAD_HANDED_OFF')
  expect((await commercial(rep).post(`/calls/${call._id}/analysis/reject`)).body.code).toBe('LEAD_HANDED_OFF')
  expect((await launch(rep, listed._id, 'rep')).body.code).toBe('LEAD_NOT_CALLABLE')

  // Le closer valide l'analyse restée à relire : champ d'équipe, tâche et prochaine action.
  const applied = await team(admin).post(`/calls/${call._id}/analysis/apply`, {
    clientRequestId: crypto.randomUUID(),
    fields: [
      { key: 'sector', action: 'ACCEPT' },
      { key: 'qualification.need', action: 'ACCEPT' },
    ],
    heat: { action: 'ACCEPT' },
    actions: [{ id: 'a1', action: 'ACCEPT' }],
  })
  expect(applied.status).toBe(200)
  expect(applied.body.analysis).toMatchObject({ status: 'APPLIED', review: { by: { _id: admin.id, name: 'Alice' } } })
  const after = (await Lead.findById(listed._id))!
  expect(after.sector).toBe('Restauration')
  expect(after.leadTemperature).toBe('TIEDE')
  expect(await PersonalTask.countDocuments({ userId: admin.id, leadId: listed._id, title: 'Préparer le devis' })).toBe(
    1,
  )
  expect(
    await LeadActivity.exists({ leadId: listed._id, type: 'CALL_ANALYSIS_APPLIED', actorId: admin.id }),
  ).toBeTruthy()

  // L'équipe appelle la fiche transmise, jusqu'à la mise en relation.
  const closing = await launch(admin, listed._id)
  expect(closing.status).toBe(201)
  expect((await voice(String(closing.body.callId), admin.id)).text).toContain('+33633333333')
})

it('espaces étanches : l’externe n’atteint pas /api/admin/call-desk, l’équipe rien de plus sous /api/commercial', async () => {
  const listed = await repListLead('+33633333333')
  const { call } = await finishedCall(rep, listed)
  for (const path of ['/calls/queue', '/calls/config', `/calls/${call._id}`, `/calls/${call._id}/analysis`])
    expect((await team(rep).get(path)).status).toBe(403)
  expect((await team(rep).post(`/leads/${listed._id}/calls`, { clientRequestId: crypto.randomUUID() })).status).toBe(
    403,
  )
  expect((await team(rep).post(`/calls/${call._id}/analysis/opt-out`, { action: 'DISMISS' })).status).toBe(403)

  for (const who of [admin, com]) {
    for (const path of [
      '/calls/queue',
      `/calls/${call._id}`,
      `/calls/${call._id}/transcript`,
      `/leads/${listed._id}/calls`,
    ])
      expect((await commercial(who).get(path)).status).toBe(403)
    expect((await launch(who, listed._id, 'rep')).status).toBe(403)
  }
})

it('mise en relation : autre identité, auteur désactivé, sans droit d’appel ou hors périmètre, refusés', async () => {
  const fiche = await teamLead(com, '+33611111111')
  // Cinq lancements sur le même numéro : le plafond n'est pas l'objet de ce test.
  const settings = await CrmSettings.getSettings()
  await CrmSettings.updateSettings({ telephony: { ...settings.toObject().telephony, attemptCapPerDay: 10 } } as never)
  const connect = async (from: string, callId: string) => (await voice(callId, from)).text
  // Les appels restent ouverts d'un cas à l'autre : la ligne unique (lot I) n'est pas l'objet de ce test.
  const callOf = async () => {
    await mongoose.connection.collection('callerlines').deleteMany({})
    return String((await launch(com, fiche._id)).body.callId)
  }

  // Un membre de l'équipe est mis en relation sur le numéro relu sur la fiche.
  const ok = await callOf()
  expect(await connect(com.id, ok)).toContain('+33611111111')
  expect((await Call.findById(ok))!.providerCallSid).not.toBeNull()

  // callId présenté par une autre identité (même un administrateur) : raccroché, appel intact.
  const stolen = await callOf()
  expect(await connect(admin.id, stolen)).toContain('<Hangup')
  expect((await Call.findById(stolen))!.status).toBe('CREATED')

  // Auteur désactivé.
  const deactivated = await callOf()
  await User.updateOne({ _id: com.id }, { $set: { isActive: false } })
  expect(await connect(com.id, deactivated)).toContain('<Hangup')
  expect((await Call.findById(deactivated))!.events.at(-1)!.status).toBe('REJECTED:OUT_OF_SCOPE')
  await User.updateOne({ _id: com.id }, { $set: { isActive: true } })

  // Droit d'appel retiré entre le lancement et la mise en relation.
  const denied = await callOf()
  await User.updateOne({ _id: com.id }, { $set: { deniedPermissions: ['manage_crm'] } })
  expect(await connect(com.id, denied)).toContain('<Hangup')
  expect((await Call.findById(denied))!.status).toBe('CANCELED')
  await User.updateOne({ _id: com.id }, { $set: { deniedPermissions: [] } })

  // Fiche réattribuée : le périmètre d'écriture ne la couvre plus.
  const moved = await callOf()
  await Lead.updateOne({ _id: fiche._id }, { $set: { assignedTo: admin.id, createdBy: admin.id } })
  expect(await connect(com.id, moved)).toContain('<Hangup')
  expect((await Call.findById(moved))!.events.at(-1)!.status).toBe('REJECTED:OUT_OF_SCOPE')
})

it('retenue d’opposition : l’externe ne la lève pas, l’équipe oui et c’est tracé, même sans l’analyse effacée', async () => {
  const listed = await repListLead('+33633333333')
  const { call, analysis } = await finishedCall(rep, listed)
  const hold = { at: new Date(), reason: 'OPT_OUT_DETECTED', analysis: analysis._id, call: call._id }
  await Lead.updateOne({ _id: listed._id }, { $set: { callHold: hold } })

  // L'externe voit quel appel retient sa fiche ; il ne peut pas lever la retenue.
  expect((await commercial(rep).get(`/leads/${listed._id}`)).body.lead.callHold).toMatchObject({
    call: String(call._id),
  })
  expect((await commercial(rep).post(`/calls/${call._id}/analysis/opt-out`, { action: 'DISMISS' })).body.code).toBe(
    'OPT_OUT_TEAM_ONLY',
  )
  expect((await commercial(rep).post(`/leads/${listed._id}/ready-to-close`)).status).toBe(200)
  // Transmise : la décision revient au closer, même pour confirmer.
  expect((await commercial(rep).post(`/calls/${call._id}/analysis/opt-out`, { action: 'CONFIRM' })).body.code).toBe(
    'LEAD_HANDED_OFF',
  )
  // Hors du périmètre de Carl : 404.
  expect((await team(com).post(`/calls/${call._id}/analysis/opt-out`, { action: 'DISMISS' })).status).toBe(404)

  const lifted = await team(admin).post(`/calls/${call._id}/analysis/opt-out`, { action: 'DISMISS' })
  expect(lifted.status).toBe(200)
  expect(lifted.body.lead.callHold).toBeNull()
  expect(
    await LeadActivity.exists({ leadId: listed._id, type: 'CALL_OPT_OUT_DISMISSED', actorId: admin.id }),
  ).toBeTruthy()

  // Analyse effacée par une opposition à l'enregistrement : la retenue reste, l'équipe la décide par l'appel.
  const fiche = await teamLead(com, '+33611111111')
  const { call: own } = await finishedCall(com, fiche)
  await CallAnalysis.deleteOne({ call: own._id })
  const erased = { at: new Date(), reason: 'OPT_OUT_DETECTED', analysis: new mongoose.Types.ObjectId(), call: own._id }
  await Lead.updateOne({ _id: fiche._id }, { $set: { callHold: erased } })
  expect((await team(com).get(`/calls/${own._id}/analysis`)).status).toBe(404)
  expect((await launch(com, fiche._id)).body.code).toBe('LEAD_NOT_CALLABLE')
  expect(await queueIds(com)).toEqual([])
  const confirmed = await team(com).post(`/calls/${own._id}/analysis/opt-out`, { action: 'CONFIRM' })
  expect(confirmed.body.lead).toMatchObject({ callHold: null, doNotCall: true })
  const trace = await LeadActivity.findOne({ leadId: fiche._id, type: 'CALL_OPT_OUT_CONFIRMED' }).lean()
  expect(trace).toMatchObject({ actorId: new mongoose.Types.ObjectId(com.id), payload: { analysisErased: true } })
})

it('opposition par numéro, plage horaire et plafond s’appliquent à l’équipe', async () => {
  const fiche = await teamLead(admin, '+33644444444')
  // Numéro inscrit par ailleurs, sous une autre écriture.
  await SuppressionEntry.create({ phoneNormalized: '+33644444444', reason: 'OPPOSITION' })
  expect((await launch(admin, fiche._id)).body.code).toBe('PHONE_SUPPRESSED')
  expect(await queueIds(admin)).toEqual([])
  await SuppressionEntry.deleteMany({})

  vi.setSystemTime(new Date('2026-11-14T10:00:00Z')) // samedi
  expect((await launch(admin, fiche._id)).body.code).toBe('OUTSIDE_CALLING_HOURS')
  vi.setSystemTime(TUESDAY_10H)

  const settings = await CrmSettings.getSettings()
  await CrmSettings.updateSettings({ telephony: { ...settings.toObject().telephony, attemptCapPerDay: 1 } } as never)
  // L'externe a déjà appelé ce numéro aujourd'hui : le plafond vaut pour tous.
  const listed = await repListLead('+33644444444')
  expect((await launch(rep, listed._id, 'rep')).status).toBe(201)
  expect((await launch(admin, fiche._id)).body.code).toBe('ATTEMPT_CAP_REACHED')
})

it('externe : un échange relié à son appel reprend heure et durée et n’est consigné qu’une fois', async () => {
  const listed = await repListLead('+33633333333')
  const { call } = await finishedCall(rep, listed)
  const other = await teamLead(admin, '+33622222222')
  const { call: foreign } = await finishedCall(admin, other)
  const log = (body: object) => commercial(rep).post(`/leads/${listed._id}/interactions`, body)

  expect((await log({ kind: 'NOTE', callId: String(call._id) })).status).toBe(400)
  expect((await log({ kind: 'CALL', callId: String(foreign._id) })).status).toBe(404)
  const logged = await log({
    kind: 'CALL',
    direction: 'OUT',
    body: 'Rappel convenu',
    occurredAt: '2020-01-01T00:00:00Z',
    callId: String(call._id),
  })
  expect(logged.status).toBe(201)
  expect(new Date(logged.body.interaction.occurredAt).getTime()).toBe(call.answeredAt!.getTime())
  const interaction = (await Interaction.findById(logged.body.interaction._id).lean())!
  expect(interaction.durationSec).toBe(95)
  expect(String((await Call.findById(call._id))!.interaction)).toBe(String(interaction._id))
  expect((await log({ kind: 'CALL', callId: String(call._id) })).status).toBe(409)
  expect(await Interaction.countDocuments({ subjectId: listed._id })).toBe(1)
})
