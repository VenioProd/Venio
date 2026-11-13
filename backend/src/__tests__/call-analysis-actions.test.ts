import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { setupMongoReplSet, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import commercialRoutes from '../routes/commercial/index.js'
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import User from '../models/User.js'
import CrmSettings from '../models/CrmSettings.js'
import CallAnalysis from '../models/CallAnalysis.js'
import CrmSequence from '../models/CrmSequence.js'
import CrmSequenceEnrollment from '../models/CrmSequenceEnrollment.js'
import PersonalTask from '../models/PersonalTask.js'
import UserIdempotencyKey from '../models/UserIdempotencyKey.js'
import SyncTombstone from '../models/SyncTombstone.js'
import { notifyUsers } from '../lib/notifyHelpers.js'
import { applyCallAnalysis, type ApplyBody } from '../lib/callAnalysis/apply.js'
import { actionOptions } from '../lib/callAnalysis/actions.js'

/** Actions SEQUENCE et HANDOFF d'une analyse (vague 4, lot L) : une garde par cas. */

vi.mock('../lib/notifyHelpers.js', () => ({
  notifyUsers: vi.fn().mockResolvedValue(undefined),
  notifySuperAdmins: vi.fn().mockResolvedValue(undefined),
}))

const app = express()
app.use(express.json())
app.use('/api/commercial', commercialRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

let rep: string
let admin: string
let closer: string
let member: string
let cookie: string
const post = (path: string, body: object) =>
  request(app)
    .post(`/api/commercial${path}`)
    .set('Cookie', cookie)
    .set('Idempotency-Key', crypto.randomUUID())
    .send(body)

const ACTIONS = [
  { id: 'a1', type: 'SEQUENCE', label: 'Inscrire à la séquence Relance devis', dueAt: null, reason: 'Pas prêt' },
  { id: 'a2', type: 'HANDOFF', label: 'Passer la main', dueAt: null, reason: 'Décideur identifié' },
]

/** Analyse prête, posée directement : le modèle n'est pas en jeu ici. */
async function readyAnalysis(lead: { _id: unknown }, author: string) {
  const call = new mongoose.Types.ObjectId()
  const analysis = await CallAnalysis.create({
    call,
    lead: lead._id,
    author,
    model: 'claude-opus-5-5',
    promptVersion: 'test',
    status: 'READY',
    output: {
      summary: 'Résumé',
      suggestedOutcome: null,
      optOut: { detected: false, quote: null },
      fields: [],
      heat: { score: 50, level: 'TIEDE', criteria: [] },
      actions: ACTIONS,
    },
    callDate: new Date(),
    purgeAt: new Date(Date.now() + 86400_000),
  })
  return { callId: String(call), analysisId: analysis._id }
}

const newLead = (extra: object = {}) =>
  Lead.create({
    company: 'Boutique Alpha',
    contactName: 'Mme Alpha',
    contactEmail: 'alpha@boutique.test',
    contactPhone: '+33612345678',
    status: 'CONTACTED',
    notes: 'Notes du commercial',
    ...extra,
  })

const sequence = () =>
  CrmSequence.create({
    name: 'Relance devis',
    status: 'ACTIVE',
    steps: [{ type: 'EMAIL', delayDays: 1, sendHourParis: 10, subject: 'Bonjour', body: 'Bonjour {contact}' }],
  })

const decide = (actions: ApplyBody['actions']) => ({ clientRequestId: crypto.randomUUID(), actions })
const team = { scope: 'team' as const }

beforeAll(async () => {
  await setupMongoReplSet()
  await Promise.all([
    Lead.init(),
    LeadActivity.init(),
    CallAnalysis.init(),
    CrmSettings.init(),
    CrmSequence.init(),
    CrmSequenceEnrollment.init(),
    PersonalTask.init(),
    UserIdempotencyKey.init(),
    SyncTombstone.init(),
  ])
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  vi.mocked(notifyUsers).mockClear()
  const users = await User.create([
    { name: 'Anna', email: 'anna@actions.test', passwordHash: 'unused', role: 'COMMERCIAL_EXTERNE' },
    { name: 'Clara', email: 'clara@actions.test', passwordHash: 'unused', role: 'ADMIN' },
    { name: 'Chloé', email: 'chloe@actions.test', passwordHash: 'unused', role: 'ADMIN' },
    { name: 'Marc', email: 'marc@actions.test', passwordHash: 'unused', role: 'COMMERCIAL' },
  ])
  ;[rep, admin, closer, member] = users.map((user) => String(user._id)) as [string, string, string, string]
  await CrmSettings.updateOne({}, { $set: { defaultCloserId: closer } }, { upsert: true })
  cookie = `venio_session=${(await createSession(rep)).token}`
})

it('externe : HANDOFF = passage au closer, mêmes effets, une seule fois ; SEQUENCE réservée à l’équipe', async () => {
  const lead = await newLead({ externalRep: rep, assignedTo: rep })
  const { callId } = await readyAnalysis(lead, rep)

  const sequenceRefused = await post(`/calls/${callId}/analysis/apply`, decide([{ id: 'a1', action: 'ACCEPT' }]))
  expect(sequenceRefused.status).toBe(403)
  expect(sequenceRefused.body.code).toBe('ACTION_TEAM_ONLY')
  expect(await CallAnalysis.countDocuments({ status: 'READY' })).toBe(1)

  const body = decide([
    { id: 'a1', action: 'IGNORE' },
    { id: 'a2', action: 'ACCEPT' },
  ])
  const first = await post(`/calls/${callId}/analysis/apply`, body)
  expect(first.status).toBe(200)
  const handed = (await Lead.findById(lead._id))!
  expect(String(handed.assignedTo)).toBe(closer)
  expect(handed.closingHandoff).toMatchObject({ repNotes: 'Notes du commercial' })
  expect(String(handed.closingHandoff!.by)).toBe(rep)
  const trace = await LeadActivity.find({ leadId: lead._id, type: 'READY_TO_CLOSE' }).lean()
  expect(trace).toHaveLength(1)
  expect(String(trace[0]!.actorId)).toBe(rep)
  expect(trace[0]!.payload).toEqual({ closerId: closer, fallbackToSuperAdmins: false })
  expect(vi.mocked(notifyUsers)).toHaveBeenCalledWith(
    [expect.anything()],
    expect.objectContaining({ type: 'CRM_LEAD_READY_TO_CLOSE', message: 'Boutique Alpha — transmis par Anna' }),
  )

  // Rejeu et second envoi : rien de plus.
  expect((await post(`/calls/${callId}/analysis/apply`, body)).status).toBe(200)
  expect((await post(`/calls/${callId}/analysis/apply`, decide([{ id: 'a2', action: 'ACCEPT' }]))).status).toBe(409)
  expect(await LeadActivity.countDocuments({ leadId: lead._id, type: 'READY_TO_CLOSE' })).toBe(1)
  expect(vi.mocked(notifyUsers)).toHaveBeenCalledTimes(1)
})

it('externe : un lead perdu ne se transmet pas', async () => {
  const lead = await newLead({ externalRep: rep, status: 'LOST' })
  const { callId } = await readyAnalysis(lead, rep)
  const res = await post(`/calls/${callId}/analysis/apply`, decide([{ id: 'a2', action: 'ACCEPT' }]))
  expect(res.body.code).toBe('LEAD_NOT_OPEN')
  expect((await Lead.findById(lead._id))!.closingHandoff).toBeNull()
})

it('équipe : SEQUENCE refusée sur opposition ou consentement, sans rien écrire', async () => {
  const seq = await sequence()
  for (const [extra, reason] of [
    [{ doNotContact: true }, 'DO_NOT_CONTACT'],
    [{ doNotCall: true }, 'DO_NOT_CALL'],
    [{ consent: { status: 'WITHDRAWN', basis: 'LEGITIMATE_INTEREST' } }, 'CONSENT_WITHDRAWN'],
    [{ consent: { status: 'UNKNOWN', basis: 'CONSENT' } }, 'CONSENT_REQUIRED'],
    [{ contactEmail: '' }, 'NO_EMAIL'],
  ] as const) {
    const lead = await newLead({ assignedTo: admin, ...extra })
    const { analysisId } = await readyAnalysis(lead, admin)
    await expect(
      applyCallAnalysis(analysisId, decide([{ id: 'a1', action: 'ACCEPT', sequenceId: String(seq._id) }]), {
        actor: admin,
        ...team,
      }),
    ).rejects.toMatchObject({ code: 'SEQUENCE_NOT_ALLOWED', details: { reason } })
    expect((await CallAnalysis.findById(analysisId))!.status).toBe('READY')
  }
  expect(await CrmSequenceEnrollment.countDocuments()).toBe(0)
})

it('équipe : SEQUENCE inscrit par le service, au nom de qui accepte, une seule fois', async () => {
  const seq = await sequence()
  const lead = await newLead({ assignedTo: admin })
  const { analysisId } = await readyAnalysis(lead, admin)

  const options = await actionOptions((await CallAnalysis.findById(analysisId))!.output, lead, 'team')
  expect(options.suggestedSequences).toEqual({ a1: String(seq._id) })
  expect(options.members.map((m) => m.name)).toEqual(['Chloé', 'Marc'])
  expect((await actionOptions(null, lead, 'rep')).teamOnly).toEqual(['SEQUENCE'])

  await expect(
    applyCallAnalysis(analysisId, decide([{ id: 'a1', action: 'ACCEPT' }]), { actor: admin, ...team }),
  ).rejects.toMatchObject({ code: 'SEQUENCE_REQUIRED' })

  const body = decide([{ id: 'a1', action: 'ACCEPT', sequenceId: String(seq._id) }])
  const first = await applyCallAnalysis(analysisId, body, { actor: admin, ...team })
  const decision = first.analysis.review!.decisions.find((d) => d.path === 'actions.a1')!
  expect(decision.after).toMatchObject({ sequenceName: 'Relance devis', enrollment: { status: 'ENROLLED' } })
  const enrollments = await CrmSequenceEnrollment.find({ lead: lead._id }).lean()
  expect(enrollments).toHaveLength(1)
  expect(String(enrollments[0]!.enrolledBy)).toBe(admin)
  const trace = await LeadActivity.find({ leadId: lead._id, type: 'SEQUENCE_ENROLLED' }).lean()
  expect(trace.map((t) => String(t.actorId))).toEqual([admin])

  await applyCallAnalysis(analysisId, body, { actor: admin, ...team })
  await expect(
    applyCallAnalysis(analysisId, { ...body, clientRequestId: crypto.randomUUID() }, { actor: admin, ...team }),
  ).rejects.toMatchObject({ code: 'ANALYSIS_ALREADY_REVIEWED' })
  expect(await CrmSequenceEnrollment.countDocuments({ lead: lead._id })).toBe(1)
})

it('équipe : HANDOFF réassigne au membre choisi, habilité, dans le périmètre', async () => {
  const lead = await newLead({ assignedTo: admin })
  const scoped = { actor: admin, ...team, leadScope: { assignedTo: admin } }

  const outsider = await newLead({ assignedTo: closer, company: 'Hors périmètre' })
  const { analysisId: outsideId } = await readyAnalysis(outsider, admin)
  await expect(
    applyCallAnalysis(outsideId, decide([{ id: 'a2', action: 'ACCEPT', assigneeId: member }]), scoped),
  ).rejects.toMatchObject({ status: 404 })

  const { analysisId } = await readyAnalysis(lead, admin)
  await expect(
    applyCallAnalysis(analysisId, decide([{ id: 'a2', action: 'ACCEPT', assigneeId: rep }]), scoped),
  ).rejects.toMatchObject({ code: 'INVALID_ASSIGNEE' })
  await expect(
    applyCallAnalysis(analysisId, decide([{ id: 'a2', action: 'ACCEPT', assigneeId: admin }]), scoped),
  ).rejects.toMatchObject({ code: 'HANDOFF_SAME_ASSIGNEE' })
  expect(String((await Lead.findById(lead._id))!.assignedTo)).toBe(admin)

  const body = decide([{ id: 'a2', action: 'ACCEPT', assigneeId: member }])
  await applyCallAnalysis(analysisId, body, scoped)
  expect(String((await Lead.findById(lead._id))!.assignedTo)).toBe(member)
  const applied = await LeadActivity.findOne({ leadId: lead._id, type: 'CALL_ANALYSIS_APPLIED' }).lean()
  expect(String(applied!.actorId)).toBe(admin)
  expect(applied!.payload.fields).toEqual([
    { path: 'actions.a2', action: 'ACCEPT', before: admin, after: { assignedTo: member, assigneeName: 'Marc' } },
  ])
  expect(vi.mocked(notifyUsers)).toHaveBeenCalledWith([member], expect.objectContaining({ type: 'CRM_LEAD_ASSIGNED' }))

  // Rejeu, alors que la fiche est sortie du périmètre de qui l'a passée : même réponse, rien de plus.
  await applyCallAnalysis(analysisId, body, scoped)
  expect(vi.mocked(notifyUsers)).toHaveBeenCalledTimes(1)
})
