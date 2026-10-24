import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import User from '../models/User.js'
import MobileDevice from '../models/MobileDevice.js'
import Lead from '../models/Lead.js'
import Project from '../models/Project.js'
import Task from '../models/Task.js'
import Interaction from '../models/Interaction.js'
import QuoteProposal from '../models/QuoteProposal.js'
import InternalTicket from '../models/InternalTicket.js'
import todayRoutes from '../routes/mobile/today.js'
import interactionRoutes from '../routes/mobile/interactions.js'
import syncRoutes from '../routes/mobile/sync.js'
import ticketRoutes from '../routes/admin/tickets.js'
import { buildTimeline } from '../lib/interactions.js'

vi.mock('../lib/notifications.js', () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/nextcloud.js', () => ({ syncUploadToNextcloud: vi.fn() }))
const app = express().use(express.json())
app.use('/api/mobile/today', todayRoutes)
app.use('/api/mobile/interactions', interactionRoutes)
app.use('/api/mobile/sync', syncRoutes)
app.use('/api/admin/tickets', ticketRoutes)
let bearer: string
let author: string
let project: string
const get = (url: string, token = bearer) => request(app).get(url).set('Authorization', token)
const ticket = (project: string) =>
  request(app).post('/api/admin/tickets').set('Authorization', bearer).send({ message: 'Aide', project })
const interaction = (body: object, key = randomUUID()) =>
  request(app).post('/api/mobile/interactions').set('Authorization', bearer).set('Idempotency-Key', key).send(body)
async function login(role = 'COMMERCIAL') {
  const user = await User.create({ name: role, email: `${randomUUID()}@test.invalid`, passwordHash: 'x', role })
  const device = await MobileDevice.create({
    userId: user._id,
    name: 'Test',
    platform: 'ios',
    expiresAt: new Date(Date.now() + 86400000),
  })
  const session = await createSession(String(user._id), { deviceId: String(device._id), tokenPrefix: 'vnm_at_' })
  return { id: String(user._id), bearer: `Bearer ${session.token}` }
}
beforeAll(async () => {
  await setupMongo()
  app.use('/api/admin/sales-targets', (await import('../routes/admin/salesTargets.js')).default)
  app.use('/api/mobile/sales-targets', (await import('../routes/mobile/salesTargets.js')).default)
  const { default: SalesTarget } = await import('../models/SalesTarget.js')
  await Promise.all([QuoteProposal.init(), Interaction.init(), SalesTarget.init()])
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  const user = await login()
  author = user.id
  bearer = user.bearer
  project = String((await Project.create({ name: 'Site', client: author, assignedTo: author }))._id)
})

it('attribue des références distinctes en concurrence dans l’année parisienne', async () => {
  const stamp = new Date('2026-12-31T23:30:00Z')
  const quotes = await Promise.all(
    Array.from({ length: 5 }, () =>
      QuoteProposal.create({ project, client: author, createdBy: author, title: 'Devis', createdAt: stamp }),
    ),
  )
  const references = quotes.map((q) => q.toObject().reference)
  expect(new Set(references).size).toBe(5)
  for (const reference of references) expect(reference).toMatch(/^DV-2027-\d{3,}$/)
  const duplicate = quotes[0]!.toObject()
  await expect(QuoteProposal.create({ ...duplicate, _id: new mongoose.Types.ObjectId() })).rejects.toMatchObject({
    code: 11000,
  })
})

it('filtre les tickets par projet sans élargir le périmètre par auteur', async () => {
  const other = new mongoose.Types.ObjectId()
  await InternalTicket.create([
    { title: 'Ici', message: 'x', authorId: author, authorName: 'Com', project },
    { title: 'Ailleurs', message: 'x', authorId: author, authorName: 'Com', project: other },
    { title: 'Collègue', message: 'x', authorId: other, authorName: 'Autre', project },
  ])
  const response = await get(`/api/admin/tickets?project=${project}`).expect(200)
  expect(response.body.map((t: { title: string }) => t.title)).toEqual(['Ici'])
  await get('/api/admin/tickets?project=invalid').expect(400)
})

it('refuse de rattacher un ticket à un projet inaccessible', async () => {
  const foreign = await Project.create({ name: 'Autre', client: author })
  await ticket(String(foreign._id)).expect(403)
  expect(await InternalTicket.countDocuments()).toBe(0)
  await ticket(project).expect(201)
})

it('fusionne les rendez-vous et tâches par heure et garde une source en cas de panne', async () => {
  const day = new Date().toISOString().slice(0, 10)
  const lead = await Lead.create({ company: 'Prospect', assignedTo: author })
  const endsAt = `${day}T14:00:00.000Z`
  const created = await interaction({
    subjectType: 'LEAD',
    subjectId: String(lead._id),
    kind: 'MEETING',
    body: 'RDV',
    occurredAt: `${day}T13:00:00.000Z`,
    endsAt,
  }).expect(201)
  await Task.create({
    project,
    title: 'Matin',
    assignee: author,
    createdBy: author,
    startDate: `${day}T08:00:00Z`,
    dueDate: `${day}T17:00:00Z`,
  })
  const response = await get('/api/mobile/today?tz=UTC').expect(200)
  expect(response.body.meetings.total).toBe(2)
  expect(response.body.meetings.items.map((item: any) => [item.source, item.startsAt, item.endsAt, item.lead])).toEqual(
    [
      ['task', `${day}T08:00:00.000Z`, null, null],
      ['interaction', `${day}T13:00:00.000Z`, endsAt, { id: String(lead._id), company: 'Prospect' }],
    ],
  )
  expect((await buildTimeline('LEAD', lead._id)).entries[0]).toMatchObject({ endsAt })
  await Interaction.updateMany({}, { updatedAt: new Date(Date.now() - 5000) }, { timestamps: false })
  const synced = await get('/api/mobile/sync/interactions').expect(200)
  expect(synced.body.items[0]).toMatchObject({ id: created.body.interaction._id, endsAt })
  const failure = vi.spyOn(Task, 'aggregate').mockImplementation(() => {
    throw new Error('indisponible')
  })
  try {
    const fallback = await get('/api/mobile/today?tz=UTC').expect(200)
    expect(fallback.body.meetings).toMatchObject({ total: 1, items: [{ source: 'interaction' }] })
  } finally {
    failure.mockRestore()
  }
})

it('valide la fin du rendez-vous et la lie à la clé d’idempotence', async () => {
  const lead = await Lead.create({ company: 'Prospect', assignedTo: author })
  const payload = {
    subjectType: 'LEAD',
    subjectId: String(lead._id),
    kind: 'MEETING',
    body: 'RDV',
    occurredAt: '2026-10-24T10:00:00Z',
    endsAt: '2026-10-24T11:00:00Z',
  }
  await interaction({ ...payload, endsAt: payload.occurredAt }).expect(400)
  await interaction({ ...payload, kind: 'NOTE' }).expect(400)
  const key = randomUUID()
  await interaction(payload, key).expect(201)
  await interaction(payload, key).expect(200)
  await interaction({ ...payload, endsAt: '2026-10-24T12:00:00Z' }, key).expect(409)
})

it('réserve le réglage des objectifs au gestionnaire et leur lecture à l’intéressé', async () => {
  const admin = await login('SUPER_ADMIN')
  const other = await login()
  const path = `/api/admin/sales-targets/${author}/2026-10`
  const put = (url: string, amount: number) => request(app).put(url).set('Authorization', admin.bearer).send({ amount })
  await put(path, 1250.29).expect(200)
  await put(`/api/admin/sales-targets/${other.id}/2026-10`, 900).expect(200)
  const replacement = await put(path, 1500).expect(200)
  expect(replacement.body.target).toMatchObject({ user: author, month: '2026-10', amount: 1500, updatedBy: admin.id })
  const own = await get('/api/mobile/sales-targets?from=2026-10&to=2026-11').expect(200)
  expect(own.body).toEqual({ targets: [{ month: '2026-10', amount: 1500 }] })
  await request(app).put(path).set('Authorization', bearer).send({ amount: 1 }).expect(403)
  const team = await get('/api/admin/sales-targets?month=2026-10', admin.bearer).expect(200)
  expect(team.body.targets).toHaveLength(2)
  await request(app).delete(path).set('Authorization', admin.bearer).expect(204)
  const empty = await get('/api/mobile/sales-targets?from=2026-10').expect(200)
  expect(empty.body.targets).toEqual([])
})

it('refuse les montants invalides, les comptes non internes actifs et les plages hors limite', async () => {
  const admin = await login('SUPER_ADMIN')
  const path = `/api/admin/sales-targets/${author}/2026-10`
  const put = (url: string, amount: unknown) =>
    request(app).put(url).set('Authorization', admin.bearer).send({ amount })
  await put(path, 0.001).expect(400)
  await put(path, -1).expect(400)
  await put(path, '100').expect(400)
  const client = await login('CLIENT')
  await put(`/api/admin/sales-targets/${client.id}/2026-10`, 100).expect(404)
  await User.findByIdAndUpdate(author, { isActive: false })
  await put(path, 100).expect(404)
  const range = (query: string) => get(`/api/mobile/sales-targets?${query}`, admin.bearer)
  await range('from=2026-01&to=2028-01').expect(400)
  await range('from=2026-10&to=2026-09').expect(400)
  await range('from=2026-13').expect(400)
  await range('from=2026-01&to=2027-12').expect(200)
})
