import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const state = vi.hoisted(() => ({ user: null as Request['user'] | null, enabled: true, createFolder: vi.fn() }))
vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!state.user) return res.sendStatus(401)
    req.user = state.user
    next()
  },
}))
vi.mock('../lib/nextcloud.js', () => ({
  isNextcloudEnabled: () => state.enabled,
  createFolder: state.createFolder,
  syncUploadToNextcloud: vi.fn(),
}))
import Subsidiary from '../models/Subsidiary.js'
import User from '../models/User.js'
import Lead from '../models/Lead.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import ArrowPilotage from '../models/ArrowPilotage.js'
import router from '../routes/admin/subsidiaries.js'
import { migrateArrowPilotageToSubsidiary } from '../scripts/migrateArrowPilotageToSubsidiary.js'

const app = express()
app.use(express.json())
app.use('/api/admin/subsidiaries', router)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => res.status(500).json({ error: err.message }))
let actor: mongoose.Types.ObjectId
const base = '/api/admin/subsidiaries'
async function seed(extra = {}) {
  return Subsidiary.create({ name: 'Arrow', slug: 'arrow', createdBy: actor, ...extra })
}
beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  const user = await User.create({
    email: 'super@test.local',
    name: 'Super',
    role: 'SUPER_ADMIN',
    passwordHash: 'x',
    twoFactorEnabled: true,
  })
  actor = user._id as mongoose.Types.ObjectId
  state.user = { id: String(actor), role: 'SUPER_ADMIN', email: user.email, name: user.name }
  state.enabled = true
  state.createFolder.mockReset().mockResolvedValue({ success: true })
  process.env.NEXTCLOUD_URL = 'https://cloud.test'
})

describe('Subsidiary dossier validation and CRUD', () => {
  it('defaults structured fields and persists edits without exposing secrets', async () => {
    const res = await request(app)
      .post(base)
      .send({ name: 'Arrow', features: [{ name: 'Export' }], pricing: [{ label: 'Pro' }] })
      .expect(201)
    expect(res.body.subsidiary.features[0].status).toBe('PREVUE')
    expect(res.body.subsidiary.pricing[0]).toMatchObject({ kind: 'ABONNEMENT', amount: 0, period: 'MOIS' })
    expect(res.body.subsidiary.pilotage.goals).toEqual([])
    const id = res.body.subsidiary._id
    await request(app)
      .patch(`${base}/${id}`)
      .send({
        target: 'PME',
        leadProject: 'ARROW',
        nextcloud: { url: 'https://cloud.test/folder' },
        pilotage: { goals: ['Livrer'] },
      })
      .expect(200)
    const detail = await request(app).get(`${base}/${id}`).expect(200)
    expect(detail.body.subsidiary.target).toBe('PME')
    expect(detail.body.subsidiary.nextcloud.url).toBe('https://cloud.test/folder')
  })
  it.each([
    { features: [{ name: 'x', status: 'INVALID' }] },
    { features: [{ name: 'x'.repeat(161) }] },
    { pricing: [{ label: 'Pro', amount: -1 }] },
    { pricing: [{ label: 'Pro', kind: 'INVALID' }] },
    { pricing: [{ label: 'Pro', period: 'INVALID' }] },
    { competitors: [{ name: 'Bad', url: 'javascript:alert(1)' }] },
    { competitors: [{ name: 'Bad', url: 'ftp://test.fr' }] },
    { nextcloud: { url: 'bad' } },
    { leadProject: 'YUMI' },
    { target: 'x'.repeat(6001) },
    { valueProposition: 'x'.repeat(6001) },
    { salesPitch: 'x'.repeat(6001) },
    { objections: [{ question: 'x', answer: 'x'.repeat(6001) }] },
    { pilotage: { decisions: ['x'.repeat(4001)] } },
    { devProject: 'not-an-id' },
  ])('rejects invalid field %#', async (fields) => {
    const subsidiary = await seed()
    await request(app).patch(`${base}/${subsidiary._id}`).send(fields).expect(400)
  })
  it('keeps the super admin gate on read, update and provisioning', async () => {
    const subsidiary = await seed()
    state.user!.role = 'ADMIN'
    await request(app).get(`${base}/${subsidiary._id}`).expect(403)
    await request(app).patch(`${base}/${subsidiary._id}`).send({ target: 'No' }).expect(403)
    await request(app).post(`${base}/${subsidiary._id}/nextcloud`).expect(403)
  })
})

describe('Nextcloud provisioning', () => {
  it('creates the parent and useful folders and is repeatable', async () => {
    const sub = await seed()
    const response = await request(app).post(`${base}/${sub._id}/nextcloud`).expect(200)
    expect(state.createFolder.mock.calls.map((call) => call[0])).toEqual([
      '/Plateformes',
      '/Plateformes/Arrow',
      '/Plateformes/Arrow/Commercial',
      '/Plateformes/Arrow/Juridique',
      '/Plateformes/Arrow/Produit',
      '/Plateformes/Arrow/Marketing',
    ])
    expect(response.body.nextcloud).toEqual({
      path: '/Plateformes/Arrow',
      url: 'https://cloud.test/apps/files/?dir=%2FPlateformes%2FArrow',
    })
    state.createFolder.mockResolvedValue({ success: false, alreadyExists: true })
    await request(app).post(`${base}/${sub._id}/nextcloud`).expect(200)
  })
  it('reports missing configuration and allows a manual link', async () => {
    const sub = await seed()
    state.enabled = false
    const response = await request(app).post(`${base}/${sub._id}/nextcloud`).expect(503)
    expect(response.body.code).toBe('NEXTCLOUD_NOT_CONFIGURED')
    expect(state.createFolder).not.toHaveBeenCalled()
    await request(app)
      .patch(`${base}/${sub._id}`)
      .send({ nextcloud: { path: '', url: 'https://manual.test' } })
      .expect(200)
  })
  it('does not record a partial provisioning as successful', async () => {
    const sub = await seed()
    state.createFolder
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'Forbidden' })
    await request(app).post(`${base}/${sub._id}/nextcloud`).expect(502)
    expect((await Subsidiary.findById(sub._id))!.nextcloud.url).toBe('')
  })
})

describe('Calculated CRM and Dev data', () => {
  it('isolates the CRM project, sorts hot leads by temperature then score, and links signed accounts', async () => {
    const sub = await seed({ leadProject: 'ARROW' })
    const signedAt = new Date('2026-10-01T12:00:00Z')
    await Lead.create([
      {
        company: 'Hot',
        project: 'ARROW',
        leadTemperature: 'CHAUD',
        score: 99,
        budget: 2000,
        assignedTo: actor,
        nextActionAt: signedAt,
      },
      { company: 'Very hot', project: 'ARROW', leadTemperature: 'TRES_CHAUD', score: 10 },
      { company: 'Very hot higher', project: 'ARROW', leadTemperature: 'TRES_CHAUD', score: 20 },
      { company: 'Cold', project: 'ARROW', leadTemperature: 'FROID' },
      { company: 'Warm', project: 'ARROW', leadTemperature: 'TIEDE' },
      { company: 'Lost', project: 'ARROW', leadTemperature: 'TRES_CHAUD', status: 'LOST' },
      { company: 'Other', project: 'VENIO', leadTemperature: 'TRES_CHAUD' },
      {
        company: 'Signed',
        project: 'ARROW',
        status: 'WON',
        leadTemperature: 'TRES_CHAUD',
        budget: 9000,
        serviceType: 'Pro',
        statusChangedAt: signedAt,
        clientAccountId: actor,
      },
    ])
    const { body } = await request(app).get(`${base}/${sub._id}`).expect(200)
    expect(body.subsidiary.hotProspects.map((l: { company: string }) => l.company)).toEqual([
      'Very hot higher',
      'Very hot',
      'Hot',
    ])
    expect(body.subsidiary.hotProspects[2].assignedTo.name).toBe('Super')
    expect(body.subsidiary.hotProspects[2].href).toMatch(/^\/admin\/crm\/leads\//)
    expect(body.subsidiary.signedClients[0]).toMatchObject({
      company: 'Signed',
      budget: 9000,
      serviceType: 'Pro',
      signedAt: signedAt.toISOString(),
      clientHref: `/admin/comptes-clients/${actor}`,
    })
    expect(body.subsidiary.indicators).toEqual({
      signedClients: 1,
      hotProspects: 3,
      weightedPipeline: null,
      estimatedMrr: null,
    })
    const list = await request(app).get(base).expect(200)
    expect(list.body.subsidiaries[0].indicators).toEqual(body.subsidiary.indicators)
    await request(app).patch(`${base}/${sub._id}`).send({ leadProject: '' }).expect(200)
    expect((await request(app).get(`${base}/${sub._id}`)).body.subsidiary.hotProspects).toEqual([])
  })
  it('counts non-archived issues and returns five recent open issues with workspace links', async () => {
    const project = await DevProject.create({ key: 'AR', name: 'Arrow', createdBy: actor })
    const sub = await seed({ devProject: project._id })
    await DevIssue.create(
      ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'TODO', 'DONE', 'CANCELLED', 'DUPLICATE'].map(
        (status, i) => ({
          project: project._id,
          number: i + 1,
          identifier: `AR-${i + 1}`,
          title: `Issue ${i + 1}`,
          status,
          reporter: actor,
        }),
      ),
    )
    await DevIssue.create({
      project: project._id,
      number: 10,
      identifier: 'AR-10',
      title: 'Archived',
      reporter: actor,
      archivedAt: new Date(),
    })
    const { body } = await request(app).get(`${base}/${sub._id}`).expect(200)
    expect(body.subsidiary.devSummary.counts).toEqual({ open: 6, inProgress: 2, done: 1 })
    expect(body.subsidiary.devSummary.issues).toHaveLength(5)
    expect(body.subsidiary.devSummary.href).toBe(`/admin/dev?project=${project._id}`)
    expect(body.subsidiary.devSummary.issues[0].href).toMatch(/^\/admin\/dev\/issues\//)
  })
})

describe('Arrow pilotage migration', () => {
  it('supports dry run, copies once, preserves source and later edits', async () => {
    const sub = await seed({ name: 'ARROW', slug: 'arrow-platform' })
    await ArrowPilotage.create({
      key: 'arrow',
      goals: ['Ship'],
      scorecard: ['NPS'],
      decisions: ['Launch'],
      cadence: ['Weekly'],
    })
    expect((await migrateArrowPilotageToSubsidiary(true)).status).toBe('would-migrate')
    expect((await Subsidiary.findById(sub._id))!.pilotage.goals).toEqual([])
    expect((await migrateArrowPilotageToSubsidiary()).modified).toBe(1)
    expect((await migrateArrowPilotageToSubsidiary()).modified).toBe(0)
    expect((await Subsidiary.findById(sub._id))!.pilotage.cadence).toEqual(['Weekly'])
    expect(await ArrowPilotage.countDocuments()).toBe(1)
    await Subsidiary.updateOne({ _id: sub._id }, { $set: { 'pilotage.goals': ['Edited'] } })
    await migrateArrowPilotageToSubsidiary()
    expect((await Subsidiary.findById(sub._id))!.pilotage.goals).toEqual(['Edited'])
  })
  it('never fills a partially populated dossier', async () => {
    await seed({ pilotage: { decisions: ['Keep'] } })
    await ArrowPilotage.create({ key: 'arrow', goals: ['Ship'] })
    expect((await migrateArrowPilotageToSubsidiary()).status).toBe('already-populated')
  })
})
