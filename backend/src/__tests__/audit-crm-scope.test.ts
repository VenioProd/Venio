import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { setupMongoReplSet, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import LeadActivity from '../models/LeadActivity.js'
import CrmSettings from '../models/CrmSettings.js'
import CrmRule from '../models/CrmRule.js'
import CrmRuleRun from '../models/CrmRuleRun.js'
import SalesCommission from '../models/SalesCommission.js'
import Project from '../models/Project.js'
import QuoteProposal from '../models/QuoteProposal.js'
import Interaction from '../models/Interaction.js'
import { buildWorklist } from '../lib/crmAutomations.js'

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))
vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    req.user = authState.user!
    next()
  },
}))
vi.mock('../lib/nextcloud.js', () => ({ createClientFolders: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/email.js', () => ({ sendLeadAssignmentEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/notifyHelpers.js', () => ({
  notifyUsers: vi.fn().mockResolvedValue(undefined),
  notifySuperAdmins: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/notifications.js', () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))
let app: Express
const ids: Record<string, string> = {}
function act(key: string, role: NonNullable<Request['user']>['role'], crmEntities: string[] = []) {
  authState.user = { id: ids[key], role, name: key, email: `${key}@test.local`, crmEntities } as Request['user']
}
const bulk = (id: unknown[], action: string, payload = {}) =>
  request(app)
    .post('/crm/leads/bulk')
    .send({ ids: id.map(String), action, payload, confirm: true })
const seed = (extra = {}) => Lead.create({ company: 'Prospect', ...extra })
const rule = () =>
  CrmRule.create({
    name: 'R',
    trigger: { type: 'SCORE_AT_LEAST', params: { threshold: 0 } },
    actions: [{ type: 'ADD_TAG', params: { tag: 'ok' } }],
  })
beforeAll(async () => {
  await setupMongoReplSet()
  const [{ default: crm }, { default: extras }, { default: commercial }, { default: external }] = await Promise.all([
    import('../routes/admin/crm.js'),
    import('../routes/admin/crmExtras.js'),
    import('../routes/commercial/index.js'),
    import('../routes/admin/externalSales.js'),
  ])
  app = express()
  app.use(express.json())
  app.use('/crm', crm, extras)
  app.use('/commercial', commercial)
  app.use('/external', external)
  app.use((err: Error & { status?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err.status || 500).json({ error: err.message, code: err.code })
  })
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  for (const [key, role] of [
    ['super', 'SUPER_ADMIN'],
    ['admin', 'ADMIN'],
    ['com', 'COMMERCIAL'],
    ['other', 'COMMERCIAL'],
    ['rep', 'COMMERCIAL_EXTERNE'],
    ['rep2', 'COMMERCIAL_EXTERNE'],
  ]) {
    const user = await User.create({
      email: `${key}@test.local`,
      name: key,
      role,
      passwordHash: 'x',
      twoFactorEnabled: true,
    })
    ids[key!] = String(user._id)
  }
  act('super', 'SUPER_ADMIN')
})

it('1 — refuse la réassignation d’un collègue sans bloquer les autres leads', async () => {
  const other = await seed({ assignedTo: ids.other, createdBy: ids.com })
  const own = await seed({ assignedTo: ids.com })
  act('com', 'COMMERCIAL')
  const response = await bulk([other._id, own._id], 'assign', { userId: ids.com }).expect(200)
  expect(response.body).toMatchObject({ ok: 1, failed: 1 })
  expect(response.body.results[0].ok).toBe(false)
  await request(app).patch(`/crm/leads/${other._id}`).send({ assignedTo: ids.com }).expect(403)
  expect(String((await Lead.findById(other._id))!.assignedTo)).toBe(ids.other)
})

it('2 — borne les simulations enregistrées à l’entité du demandeur', async () => {
  const visible = await seed({ entity: 'ARROW', score: 80 })
  await seed({ entity: 'VENIO', score: 80 })
  const r = await rule()
  act('admin', 'ADMIN', ['ARROW'])
  const response = await request(app).post(`/crm/rules/${r._id}/simulate`).send({ record: true }).expect(200)
  expect(response.body.leads.map((l: { id: string }) => l.id)).toEqual([String(visible._id)])
  expect(await CrmRuleRun.distinct('lead')).toEqual([visible._id])
})

it('3 — protège les leads gagnés ou référencés, en unitaire et en groupe, et permet l’archivage', async () => {
  const won = await seed({ status: 'WON' })
  const origin = await seed()
  const commission = await seed()
  await User.updateOne({ _id: ids.rep }, { originLead: origin._id })
  await SalesCommission.create({
    rep: ids.rep,
    lead: commission._id,
    client: ids.com,
    project: new mongoose.Types.ObjectId(),
    invoice: new mongoose.Types.ObjectId(),
    payment: new mongoose.Types.ObjectId(),
    kind: 'PAYMENT',
    baseHtCents: 100,
    rateBp: 100,
    amountCents: 1,
    receivedAt: new Date(),
  })
  await request(app)
    .delete(`/crm/leads/${won._id}`)
    .expect(409)
    .expect(({ body }) => expect(body.code).toBe('LEAD_DELETE_FORBIDDEN'))
  const response = await bulk([won._id, origin._id, commission._id], 'delete').expect(200)
  expect(response.body.failed).toBe(3)
  expect((await bulk([won._id, origin._id, commission._id], 'archive')).body.ok).toBe(3)
  expect(await Lead.countDocuments()).toBe(3)
})

it('4 — interdit les actions sur une exécution dont le lead est hors entité', async () => {
  const lead = await seed({ entity: 'VENIO' })
  const r = await rule()
  const run = await CrmRuleRun.create({
    rule: r._id,
    lead: lead._id,
    eventKey: 'outside',
    trigger: 'SCORE_AT_LEAST',
    status: 'PENDING',
  })
  act('admin', 'ADMIN', ['ARROW'])
  await request(app).post(`/crm/rules/runs/${run._id}/reject`).expect(404)
  expect((await CrmRuleRun.findById(run._id))!.status).toBe('PENDING')
})

it('4 — masque les documents des projets illisibles tout en gardant les devis du lead seul', async () => {
  const lead = await seed({ assignedTo: ids.com })
  const project = await Project.create({ name: 'Privé', client: ids.other, sourceLead: lead._id })
  const quote = await QuoteProposal.create({
    title: 'Privé',
    reference: 'PRIVATE',
    leadId: lead._id,
    project: project._id,
    createdBy: ids.other,
  })
  const standalone = await QuoteProposal.create({
    title: 'Lead',
    reference: 'LEAD',
    leadId: lead._id,
    createdBy: ids.com,
  })
  act('com', 'COMMERCIAL')
  const response = await request(app).get(`/crm/leads/${lead._id}/documents`).expect(200)
  expect(response.body.projects).toEqual([])
  expect(response.body.quotes.map((q: { _id: string }) => q._id)).toEqual([String(standalone._id)])
  expect(response.body.quotes.some((q: { _id: string }) => q._id === String(quote._id))).toBe(false)
})

it('5 — isole une liste importée puis la rend à l’équipe après passage au closer', async () => {
  const { importCallLeads } = await import('../lib/callImports.js')
  await importCallLeads({
    externalRep: ids.rep!,
    actorId: ids.super!,
    project: 'ARROW',
    callList: 'Salon',
    leads: [{ company: 'Salon', contactPhone: '+33612345678' }],
  })
  const lead = (await Lead.findOne({ company: 'Salon' }))!
  expect(lead.entity).toBe('ARROW')
  await Lead.updateOne({ _id: lead._id }, { nextActionAt: new Date(Date.now() - 86400_000), score: 90 })
  const settings = await CrmSettings.getSettings()
  settings.defaultCloserId = new mongoose.Types.ObjectId(ids.com)
  settings.escalationEnabled = true
  settings.escalationAction = 'REASSIGN'
  await settings.save()
  const assertVisible = async (count: number) => {
    const pipeline = await request(app).get('/crm/pipeline').expect(200)
    expect(pipeline.body.columns.flatMap((c: { leads: unknown[] }) => c.leads)).toHaveLength(count)
    const work = await request(app).get('/crm/worklist').expect(200)
    expect(work.body.counts.overdue).toBe(count)
    const pilotage = await request(app).get('/crm/pilotage').expect(200)
    expect(pilotage.body.coverage.total).toBe(count)
    const list = await request(app).get('/crm/leads').expect(200)
    expect(list.body.leads).toHaveLength(count)
    const { candidatesFor } = await import('../lib/crmRules.js')
    expect(await candidatesFor(await rule())).toHaveLength(count)
  }
  await assertVisible(0)
  const { processLeadFollowUps, processEscalations } = await import('../lib/crmScheduler.js')
  expect(await processLeadFollowUps()).toEqual({ notified: 0 })
  expect(await processEscalations(new Date(Date.now() + 30 * 86400_000))).toMatchObject({ processed: 0, reassigned: 0 })
  expect(String((await Lead.findById(lead._id))!.assignedTo)).toBe(ids.rep)
  act('rep', 'COMMERCIAL_EXTERNE')
  await request(app).post(`/commercial/leads/${lead._id}/ready-to-close`).send({}).expect(200)
  act('super', 'SUPER_ADMIN')
  await assertVisible(1)
  expect(await processLeadFollowUps()).toEqual({ notified: 1 })
  const response = await request(app).get('/crm/pilotage').expect(200)
  expect(response.body.byOwner[0]).toMatchObject({ key: ids.com, ownerName: 'com' })
  expect(await LeadActivity.countDocuments({ leadId: lead._id, type: 'ASSIGNED' })).toBe(1)
})

it('6 — applique le service aux créations externes, appels transactionnels et réattributions', async () => {
  const settings = await CrmSettings.getSettings()
  settings.activityLogging = true
  settings.scoringEnabled = true
  settings.lostReasons = ['Budget']
  await settings.save()
  act('rep', 'COMMERCIAL_EXTERNE')
  const created = await request(app)
    .post('/commercial/leads')
    .send({ company: 'Appels', contactEmail: 'call@test.local' })
    .expect(201)
  const id = created.body.lead._id
  expect((await Lead.findById(id))!.score).not.toBeNull()
  expect(await LeadActivity.countDocuments({ leadId: id, type: 'CREATED' })).toBe(1)
  const failedInteraction = vi.spyOn(Interaction, 'create').mockRejectedValueOnce(new Error('Échec écriture appel'))
  await request(app)
    .post(`/commercial/leads/${id}/quick-call`)
    .send({ clientRequestId: crypto.randomUUID(), outcome: 'MEETING_BOOKED' })
    .expect(500)
  failedInteraction.mockRestore()
  expect((await Lead.findById(id))!.status).toBe('LEAD')
  expect(await LeadActivity.countDocuments({ leadId: id, type: 'STATUS_CHANGE' })).toBe(0)
  const result = await request(app)
    .post(`/commercial/leads/${id}/quick-call`)
    .send({ clientRequestId: crypto.randomUUID(), outcome: 'DO_NOT_CALL', note: 'Refus' })
    .expect(201)
  const called = (await Lead.findById(id))!
  expect(called.status).toBe('LOST')
  expect(called.lostReason === '' || settings.lostReasons.includes(called.lostReason)).toBe(true)
  expect(await LeadActivity.countDocuments({ leadId: id, type: 'STATUS_CHANGE' })).toBe(1)
  const interaction = (await Interaction.findById(result.body.interactionId).select('+callUndo'))!
  expect(interaction.callUndo?.activityId).toBeTruthy()
  act('super', 'SUPER_ADMIN')
  await request(app)
    .post('/external/reassign')
    .send({ leadIds: [id], toRep: ids.rep2 })
    .expect(200)
  expect(await LeadActivity.countDocuments({ leadId: id, type: 'ASSIGNED' })).toBe(1)
})

it('9 — refuse le passage à WON avant écriture si l’e-mail appartient à un compte non client', async () => {
  const lead = await seed({ contactEmail: 'COM@TEST.LOCAL', status: 'PROPOSAL' })
  const response = await request(app).patch(`/crm/leads/${lead._id}`).send({ status: 'WON' }).expect(409)
  expect(response.body.code).toBe('CLIENT_EMAIL_CONFLICT')
  expect((await Lead.findById(lead._id))!.status).toBe('PROPOSAL')
  expect(await LeadActivity.countDocuments({ leadId: lead._id, type: 'STATUS_CHANGE' })).toBe(0)
})

it('9 — traduit ValidationError et CastError dans le gestionnaire global sans démarrer le serveur', async () => {
  const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
  const handler = source.slice(
    source.indexOf('app.use((err: Error & { status?'),
    source.indexOf('\nmongoose\n  .connect'),
  )
  const isolated = express()
  isolated.get('/validation', () => {
    throw new mongoose.Error.ValidationError()
  })
  isolated.get('/cast', () => {
    throw new mongoose.Error.CastError('ObjectId', 'bad', '_id')
  })
  runInNewContext(ts.transpile(handler), { app: isolated, mongoose, isProd: false, logger: { error() {} } })
  await request(isolated).get('/validation').expect(400)
  await request(isolated).get('/cast').expect(400)
})

it('10 — classe aujourd’hui selon Paris lors du changement de jour et d’heure', async () => {
  const settings = await CrmSettings.getSettings()
  const previousTZ = process.env.TZ
  process.env.TZ = 'UTC'
  const groups = buildWorklist(
    [{ status: 'LEAD', nextActionAt: '2026-03-28T23:30:00Z' }],
    settings,
    new Date('2026-03-29T21:30:00Z'),
  )
  if (previousTZ === undefined) delete process.env.TZ
  else process.env.TZ = previousTZ
  expect(groups.today).toHaveLength(1)
  expect(groups.overdue).toHaveLength(0)
})
