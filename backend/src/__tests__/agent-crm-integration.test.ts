import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import {
  createTestApp,
  createAgentTokenInDb,
  authHeaders,
  uniqueIdempotencyKey,
} from './helpers/agentTestApp.js'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Lead from '../models/Lead.js'
import ClientContact from '../models/ClientContact.js'
import ClientNote from '../models/ClientNote.js'

/**
 * Tests d'intégration des routes CRM agent — exerce les vrais handlers
 * contre une base Mongo en mémoire :
 *
 *   - Clients : list, detail, create, update
 *   - Leads : list, detail, create, update, delete
 *   - Contacts : list, create, patch (isMain logic), delete
 *   - Notes : list, create, delete
 *   - Activities : lecture
 */

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  // Seed : un SUPER_ADMIN nécessaire pour la création de leads/notes (createdBy)
  await User.create({
    email: 'admin@venio.test',
    passwordHash: await bcrypt.hash('test', 10),
    name: 'Admin',
    role: 'SUPER_ADMIN',
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Clients
// ───────────────────────────────────────────────────────────────────────────

describe('Agent CRM / clients', () => {
  it('lists clients (paginated) and filters by q', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    const pwd = await bcrypt.hash('x', 10)
    await User.create([
      { email: 'acme@test.com', passwordHash: pwd, name: 'Alice', companyName: 'ACME', role: 'CLIENT' },
      { email: 'globex@test.com', passwordHash: pwd, name: 'Bob', companyName: 'Globex', role: 'CLIENT' },
    ])

    const allRes = await request(app)
      .get('/api/v1/agent/clients')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(allRes.status).toBe(200)
    expect(allRes.body.total).toBe(2)
    expect(allRes.body.items).toHaveLength(2)

    const filteredRes = await request(app)
      .get('/api/v1/agent/clients?q=acme')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(filteredRes.status).toBe(200)
    expect(filteredRes.body.total).toBe(1)
    expect(filteredRes.body.items[0].companyName).toBe('ACME')
  })

  it('creates a client and returns 201 without passwordHash', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const res = await request(app)
      .post('/api/v1/agent/clients')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ email: 'NewClient@TEST.com', name: 'New Client', companyName: 'NewCo' })
    expect(res.status).toBe(201)
    expect(res.body.email).toBe('newclient@test.com') // normalisé en lowercase
    expect(res.body.name).toBe('New Client')
    expect(res.body.companyName).toBe('NewCo')
    expect(res.body.passwordHash).toBeUndefined()
    expect(res.body.role).toBe('CLIENT')

    const inDb = await User.findOne({ email: 'newclient@test.com' }).lean()
    expect(inDb).toBeTruthy()
    expect(inDb!.passwordHash).toBeTruthy() // random hash en base
  })

  it('rejects duplicate email with 409', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    await User.create({
      email: 'dup@test.com',
      passwordHash: await bcrypt.hash('x', 10),
      name: 'D',
      role: 'CLIENT',
    })
    const res = await request(app)
      .post('/api/v1/agent/clients')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ email: 'dup@test.com', name: 'Dup' })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS')
  })

  it('updates allowed fields and refuses ownerAdminId not Mongo', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const c = await User.create({
      email: 'upd@test.com',
      passwordHash: await bcrypt.hash('x', 10),
      name: 'Old',
      role: 'CLIENT',
    })
    const ok = await request(app)
      .patch(`/api/v1/agent/clients/${c._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ name: 'New', companyName: 'NewCo' })
    expect(ok.status).toBe(200)
    expect(ok.body.name).toBe('New')
    expect(ok.body.companyName).toBe('NewCo')

    const bad = await request(app)
      .patch(`/api/v1/agent/clients/${c._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ ownerAdminId: 'not-a-mongo-id' })
    expect(bad.status).toBe(400)
  })

  it('GET /clients/:id returns 404 when not found', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    const res = await request(app)
      .get('/api/v1/agent/clients/507f1f77bcf86cd799439099')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(404)
  })

  it('GET /clients/:id with non-Mongo ID returns 400', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    const res = await request(app)
      .get('/api/v1/agent/clients/not-a-mongo-id')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Leads
// ───────────────────────────────────────────────────────────────────────────

describe('Agent CRM / leads', () => {
  it('lists, creates, updates and deletes leads', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm', 'write:crm'])

    // Create
    const created = await request(app)
      .post('/api/v1/agent/leads')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ company: 'Foo Corp', contactEmail: 'foo@bar.com', status: 'QUALIFIED', priority: 'HAUTE' })
    expect(created.status).toBe(201)
    expect(created.body.company).toBe('Foo Corp')
    expect(created.body.status).toBe('QUALIFIED')
    const leadId = created.body._id

    // List
    const list = await request(app)
      .get('/api/v1/agent/leads')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(list.status).toBe(200)
    expect(list.body.total).toBe(1)

    // Filter by status
    const filtered = await request(app)
      .get('/api/v1/agent/leads?status=QUALIFIED')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(filtered.body.total).toBe(1)
    const empty = await request(app)
      .get('/api/v1/agent/leads?status=WON')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(empty.body.total).toBe(0)

    // Update
    const updated = await request(app)
      .patch(`/api/v1/agent/leads/${leadId}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ status: 'WON', priority: 'URGENTE' })
    expect(updated.status).toBe(200)
    expect(updated.body.status).toBe('WON')
    expect(updated.body.statusChangedAt).toBeTruthy()

    // Delete
    const del = await request(app)
      .delete(`/api/v1/agent/leads/${leadId}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(del.status).toBe(200)
    expect(del.body.ok).toBe(true)
    const left = await Lead.countDocuments()
    expect(left).toBe(0)
  })

  it('rejects an invalid status on create', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const res = await request(app)
      .post('/api/v1/agent/leads')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ company: 'X', status: 'WAT_IS_THIS' })
    expect(res.status).toBe(400)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Contacts
// ───────────────────────────────────────────────────────────────────────────

describe('Agent CRM / contacts', () => {
  it('creates, lists, updates and deletes contacts; enforces single isMain', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm', 'write:crm'])
    const c = await User.create({
      email: 'cl@test.com',
      passwordHash: await bcrypt.hash('x', 10),
      name: 'Cl',
      role: 'CLIENT',
    })

    const c1 = await request(app)
      .post(`/api/v1/agent/clients/${c._id}/contacts`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ firstName: 'Alice', isMain: true })
    expect(c1.status).toBe(201)
    expect(c1.body.isMain).toBe(true)

    const c2 = await request(app)
      .post(`/api/v1/agent/clients/${c._id}/contacts`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ firstName: 'Bob', isMain: true })
    expect(c2.status).toBe(201)
    // Le premier doit avoir basculé en isMain=false
    const all = await ClientContact.find({ clientId: c._id }).lean()
    const mainCount = all.filter((x) => x.isMain).length
    expect(mainCount).toBe(1)

    // PATCH email lowercase
    const patched = await request(app)
      .patch(`/api/v1/agent/clients/${c._id}/contacts/${c1.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ email: 'AliceUP@TEST.COM' })
    expect(patched.status).toBe(200)
    expect(patched.body.email).toBe('aliceup@test.com')

    // Delete
    const del = await request(app)
      .delete(`/api/v1/agent/clients/${c._id}/contacts/${c2.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(del.status).toBe(200)
    const final = await ClientContact.countDocuments({ clientId: c._id })
    expect(final).toBe(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Notes
// ───────────────────────────────────────────────────────────────────────────

describe('Agent CRM / notes', () => {
  it('creates a note, lists with newest first, then deletes', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm', 'write:crm'])
    const c = await User.create({
      email: 'nt@test.com',
      passwordHash: await bcrypt.hash('x', 10),
      name: 'Nt',
      role: 'CLIENT',
    })

    const n1 = await request(app)
      .post(`/api/v1/agent/clients/${c._id}/notes`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: 'Premier appel' })
    expect(n1.status).toBe(201)

    const n2 = await request(app)
      .post(`/api/v1/agent/clients/${c._id}/notes`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: 'Suivi', pinned: true })
    expect(n2.status).toBe(201)
    expect(n2.body.pinned).toBe(true)

    const list = await request(app)
      .get(`/api/v1/agent/clients/${c._id}/notes`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(list.status).toBe(200)
    // pinned d'abord, sinon createdAt desc
    expect(list.body.items[0]._id).toBe(n2.body._id)
    expect(list.body.items[0].pinned).toBe(true)

    const del = await request(app)
      .delete(`/api/v1/agent/clients/${c._id}/notes/${n1.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(del.status).toBe(200)
    const left = await ClientNote.countDocuments()
    expect(left).toBe(1)
  })

  it('rejects empty content', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const c = await User.create({
      email: 'em@test.com',
      passwordHash: await bcrypt.hash('x', 10),
      name: 'E',
      role: 'CLIENT',
    })
    const res = await request(app)
      .post(`/api/v1/agent/clients/${c._id}/notes`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: '   ' })
    expect(res.status).toBe(400)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Activities (read-only)
// ───────────────────────────────────────────────────────────────────────────

describe('Agent CRM / activities', () => {
  it('reads client activities paginated', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    const c = await User.create({
      email: 'act@test.com',
      passwordHash: await bcrypt.hash('x', 10),
      name: 'A',
      role: 'CLIENT',
    })
    const res = await request(app)
      .get(`/api/v1/agent/clients/${c._id}/activities`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ items: [], page: 1, pageSize: 50, total: 0 })
  })
})
