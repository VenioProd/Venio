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
import QuoteTemplate from '../models/QuoteTemplate.js'
import UserIdempotencyKey from '../models/UserIdempotencyKey.js'
import quoteRoutes from '../routes/admin/quoteProposals.js'
import crmRoutes from '../routes/admin/crm.js'
import syncRoutes from '../routes/mobile/sync.js'

vi.mock('../lib/notifications.js', () => ({ createNotification: vi.fn(async () => null) }))

const app = express().use(express.json())
app.use('/api/admin/quote-proposals', quoteRoutes)
app.use('/api/admin/crm', crmRoutes)
app.use('/api/mobile/sync', syncRoutes)
// Comme le gestionnaire d'erreurs de l'application (src/index.ts), en JSON.
app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: 'Erreur serveur' })
})

let me: string
let bearer: string
let templateId: string
const colleague = new mongoose.Types.ObjectId()

beforeAll(async () => {
  await setupMongo()
  await UserIdempotencyKey.init()
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  const user = await User.create({ name: 'Com', email: 'com@test.invalid', passwordHash: 'x', role: 'COMMERCIAL' })
  me = String(user._id)
  const device = await MobileDevice.create({
    userId: me,
    name: 'iPhone',
    platform: 'ios',
    expiresAt: new Date(Date.now() + 86400000),
  })
  const session = await createSession(me, { deviceId: String(device._id), tokenPrefix: 'vnm_at_' })
  bearer = `Bearer ${session.token}`
  templateId = String((await QuoteTemplate.create({ name: 'Site', title: 'Refonte', createdBy: me }))._id)
})

const fromTemplate = (target: Record<string, unknown>) =>
  request(app)
    .post('/api/admin/quote-proposals/from-template')
    .set('Authorization', bearer)
    .send({ templateId, ...target })

async function clientOwnedBy(owner: unknown) {
  return User.create({
    name: 'Client',
    email: `${randomUUID()}@test.invalid`,
    passwordHash: 'x',
    role: 'CLIENT',
    ownerAdminId: owner,
  })
}

it('chiffre un lead sans projet, puis le rattache à un projet de son portefeuille avant envoi', async () => {
  const mine = await Lead.create({ company: 'Prospect', assignedTo: me })
  const created = await fromTemplate({ leadId: mine._id }).expect(201)
  const { proposal } = created.body
  expect(proposal).toMatchObject({ leadId: String(mine._id), project: null, client: null, status: 'DRAFT' })

  const send = () => request(app).post(`/api/admin/quote-proposals/${proposal._id}/send`).set('Authorization', bearer)
  expect((await send().expect(409)).body.code).toBe('PROPOSAL_NOT_ATTACHED')

  const attach = (project: unknown) =>
    request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/attach-project`)
      .set('Authorization', bearer)
      .send({ project })
  const foreign = await Project.create({ name: 'Collègue', client: (await clientOwnedBy(colleague))._id })
  expect((await attach(foreign._id).expect(403)).body.code).toBe('PROJECT_OUT_OF_SCOPE')
  const client = await clientOwnedBy(me)
  const own = await Project.create({ name: 'Le mien', client: client._id })
  const attached = await attach(own._id).expect(200)
  expect(attached.body.proposal).toMatchObject({ project: String(own._id), client: String(client._id) })
  expect((await attach(own._id).expect(409)).body.code).toBe('PROPOSAL_ALREADY_ATTACHED')
  await send().expect(200)
})

it('borne les devis sur lead au portefeuille : assigné, ou client possédé', async () => {
  // Lisible (le commercial lit tout le CRM) mais assigné à un collègue.
  const other = await Lead.create({ company: 'Collègue', assignedTo: colleague, createdBy: me })
  expect((await fromTemplate({ leadId: other._id }).expect(403)).body.code).toBe('LEAD_OUT_OF_SCOPE')
  const ownedAccount = await Lead.create({
    company: 'Client à moi',
    assignedTo: colleague,
    clientAccountId: (await clientOwnedBy(me))._id,
  })
  await fromTemplate({ leadId: ownedAccount._id }).expect(201)
  // Un projet et un lead à la fois, ou aucun des deux : refusé.
  const project = await Project.create({ name: 'P', client: (await clientOwnedBy(me))._id })
  await fromTemplate({ leadId: ownedAccount._id, project: project._id }).expect(400)
  await fromTemplate({}).expect(400)
})

it('dit dans la synchro si l’on peut chiffrer chaque projet et chaque lead', async () => {
  const ownClient = await clientOwnedBy(me)
  const otherClient = await clientOwnedBy(colleague)
  await Project.create({ name: 'Responsable', client: otherClient._id, assignedTo: me })
  await Project.create({ name: 'Client à moi', client: ownClient._id, assignedTo: colleague })
  await Project.create({ name: 'Collègue', client: otherClient._id, assignedTo: colleague })
  await Lead.create({ company: 'Assigné', assignedTo: me })
  await Lead.create({ company: 'Autre', assignedTo: colleague })
  // La synchro n'expose que ce qui a plus de deux secondes.
  const past = { $set: { updatedAt: new Date(Date.now() - 5000) } }
  await Project.updateMany({}, past, { timestamps: false })
  await Lead.updateMany({}, past, { timestamps: false })

  const canQuote = async (type: string, label: string) => {
    const res = await request(app).get(`/api/mobile/sync/${type}`).set('Authorization', bearer).expect(200)
    return Object.fromEntries(res.body.items.map((item: Record<string, unknown>) => [item[label], item.canQuote]))
  }
  // Un commercial non associé synchronise ses projets et ceux de ses clients, pas ceux des collègues.
  expect(await canQuote('projects', 'name')).toEqual({ Responsable: true, 'Client à moi': true })
  // Le nom du client voyage à part ; `client` reste l'identifiant.
  const projects = await request(app).get('/api/mobile/sync/projects').set('Authorization', bearer).expect(200)
  const own = projects.body.items.find((item: { name: string }) => item.name === 'Client à moi')
  expect(own.clientName).toBe(ownClient.companyName || ownClient.name)
  expect(own.client).toBe(String(ownClient._id))
  expect(await canQuote('leads', 'company')).toEqual({ Assigné: true, Autre: false })
  await User.updateOne({ _id: me }, { deniedPermissions: ['manage_quotes'] })
  expect(await canQuote('leads', 'company')).toEqual({ Assigné: false, Autre: false })
})

it('crée et modifie un lead une seule fois malgré les rejeux', async () => {
  const key = randomUUID()
  const create = (body: Record<string, unknown>) =>
    request(app).post('/api/admin/crm/leads').set('Authorization', bearer).set('Idempotency-Key', key).send(body)

  const [a, b] = await Promise.all([create({ company: 'Hors ligne' }), create({ company: 'Hors ligne' })])
  expect([a.status, b.status].sort()).toContain(201)
  expect([
    [201, 201],
    [201, 409],
  ]).toContainEqual([a.status, b.status].sort())
  expect(await Lead.countDocuments({ company: 'Hors ligne' })).toBe(1)

  const replay = await create({ company: 'Hors ligne' }).expect(201)
  expect(replay.body.lead._id).toBe((a.status === 201 ? a : b).body.lead._id)
  expect((await create({ company: 'Autre corps' }).expect(409)).body.code).toBe('IDEMPOTENCY_CONFLICT')

  // La même clé ne sert pas à une autre opération.
  const lead = replay.body.lead
  const patch = (patchKey: string, body: Record<string, unknown>) =>
    request(app)
      .patch(`/api/admin/crm/leads/${lead._id}`)
      .set('Authorization', bearer)
      .set('Idempotency-Key', patchKey)
      .send(body)
  expect((await patch(key, { notes: 'x' }).expect(409)).body.code).toBe('IDEMPOTENCY_CONFLICT')
  const patchKey = randomUUID()
  await patch(patchKey, { notes: 'Rappelé' }).expect(200)
  await patch(patchKey, { notes: 'Rappelé' }).expect(200)
  expect((await Lead.findById(lead._id).lean())?.notes).toBe('Rappelé')

  await request(app)
    .post('/api/admin/crm/leads')
    .set('Authorization', bearer)
    .set('Idempotency-Key', 'pas-un-uuid')
    .send({ company: 'X' })
    .expect(400)
  // Sans clé, la route se comporte comme avant.
  await request(app).post('/api/admin/crm/leads').set('Authorization', bearer).send({ company: 'Web' }).expect(201)
})

it('ne rejoue pas une création de lead qui a échoué après avoir écrit', async () => {
  // Conversion en client impossible (l'email est celui d'un compte interne) :
  // la route enregistre le lead, puis échoue en 500.
  const key = randomUUID()
  const body = { company: 'Gagné', status: 'WON', contactEmail: 'com@test.invalid' }
  const post = () =>
    request(app).post('/api/admin/crm/leads').set('Authorization', bearer).set('Idempotency-Key', key).send(body)
  expect((await post()).status).toBe(500)
  // Le rejeu rend le même statut au lieu de recréer le lead.
  expect((await post()).status).toBe(500)
  expect(await Lead.countDocuments({ company: 'Gagné' })).toBe(1)
})

it("protège les comptes clients et l'assignation des leads d'un collègue", async () => {
  // Un client sans propriétaire n'est pas capté en convertissant un lead à son email.
  const orphan = await User.create({
    name: 'Orphelin',
    email: 'orphan@test.invalid',
    passwordHash: 'secret',
    role: 'CLIENT',
  })
  const mine = await Lead.create({ company: 'À moi', assignedTo: me, status: 'WON', contactEmail: orphan.email })
  const converted = await request(app)
    .post(`/api/admin/crm/leads/${mine._id}/convert-to-client`)
    .set('Authorization', bearer)
    .expect(201)
  expect(converted.body.client).not.toHaveProperty('passwordHash')
  expect((await User.findById(orphan._id).lean())?.ownerAdminId ?? null).toBeNull()

  // Le lead gagné d'un collègue ne se convertit pas.
  const theirs = await Lead.create({ company: 'Collègue', assignedTo: colleague, status: 'WON' })
  await request(app)
    .post(`/api/admin/crm/leads/${theirs._id}/convert-to-client`)
    .set('Authorization', bearer)
    .expect(404)

  // Créateur du lead, mais assigné à un collègue : il ne le reprend pas.
  const handedOver = await Lead.create({ company: 'Transmis', createdBy: me, assignedTo: colleague })
  const res = await request(app)
    .patch(`/api/admin/crm/leads/${handedOver._id}`)
    .set('Authorization', bearer)
    .send({ assignedTo: me })
    .expect(403)
  expect(res.body.code).toBe('LEAD_ASSIGNMENT_FORBIDDEN')
  await request(app)
    .patch(`/api/admin/crm/leads/${handedOver._id}`)
    .set('Authorization', bearer)
    .send({ notes: 'Toujours modifiable' })
    .expect(200)
})
