import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import bcrypt from 'bcryptjs'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp, createAgentTokenInDb, authHeaders, uniqueIdempotencyKey } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import Lead from '../models/Lead.js'

/**
 * Chantier 3A — entité du groupe dans l'API agent : lecture, écriture,
 * validation et filtre ?entity=. L'agent n'a pas de périmètre utilisateur :
 * il lit et écrit toutes les entités.
 */

let app: Express
let adminId: string

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  const admin = await User.create({
    email: 'admin@venio.test',
    passwordHash: await bcrypt.hash('test', 10),
    name: 'Admin',
    role: 'SUPER_ADMIN',
  })
  adminId = String(admin._id)
})

const writeHeaders = (secret: string) => authHeaders(secret, { idempotencyKey: uniqueIdempotencyKey() })

describe('agent CRM leads / entité du groupe', () => {
  it('POST : entité explicite, déduite du projet, ou VENIO par défaut ; valeur inconnue → 400', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm', 'read:crm'])
    const explicit = await request(app)
      .post('/api/v1/agent/leads')
      .set(writeHeaders(plainSecret))
      .send({ company: 'Cabinet', entity: 'DECISIO' })
      .expect(201)
    expect(explicit.body.entity).toBe('DECISIO')
    const arrow = await request(app)
      .post('/api/v1/agent/leads')
      .set(writeHeaders(plainSecret))
      .send({ company: 'École', project: 'ARROW' })
      .expect(201)
    expect(arrow.body.entity).toBe('ARROW')
    const plain = await request(app).post('/api/v1/agent/leads').set(writeHeaders(plainSecret)).send({ company: 'Simple' }).expect(201)
    expect(plain.body.entity).toBe('VENIO')
    const invalid = await request(app)
      .post('/api/v1/agent/leads')
      .set(writeHeaders(plainSecret))
      .send({ company: 'X', entity: 'NOPE' })
      .expect(400)
    expect(invalid.body.code).toBe('VALIDATION_ERROR')
    expect(invalid.body.error).toBe('Entité invalide')
  })

  it('PATCH : change l’entité, refuse une valeur inconnue', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const lead = await Lead.create({ company: 'Mobile', createdBy: adminId })
    expect(lead.entity).toBe('VENIO')
    const res = await request(app)
      .patch(`/api/v1/agent/leads/${lead._id}`)
      .set(writeHeaders(plainSecret))
      .send({ entity: 'FORMATIO' })
      .expect(200)
    expect(res.body.entity).toBe('FORMATIO')
    await request(app)
      .patch(`/api/v1/agent/leads/${lead._id}`)
      .set(writeHeaders(plainSecret))
      .send({ entity: 'NOPE' })
      .expect(400)
    expect((await Lead.findById(lead._id).lean())!.entity).toBe('FORMATIO')
  })

  it('GET /leads?entity= filtre ; VENIO inclut les leads sans entité ; GET /leads/:id expose entity', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    const creatio = await Lead.create({ company: 'Contenus', entity: 'CREATIO', createdBy: adminId })
    await Lead.create({ company: 'Maison', entity: 'VENIO', createdBy: adminId })
    await Lead.collection.insertOne({ company: 'Ancien', status: 'LEAD', archivedAt: null, createdAt: new Date(), updatedAt: new Date() })

    const only = await request(app).get('/api/v1/agent/leads?entity=CREATIO').set(authHeaders(plainSecret)).expect(200)
    expect(only.body.items.map((l: { company: string }) => l.company)).toEqual(['Contenus'])
    expect(only.body.total).toBe(1)
    const venio = await request(app).get('/api/v1/agent/leads?entity=VENIO').set(authHeaders(plainSecret)).expect(200)
    expect(venio.body.items.map((l: { company: string }) => l.company).sort()).toEqual(['Ancien', 'Maison'])
    const all = await request(app).get('/api/v1/agent/leads?entity=NOPE').set(authHeaders(plainSecret)).expect(200)
    expect(all.body.total).toBe(3)

    const detail = await request(app).get(`/api/v1/agent/leads/${creatio._id}`).set(authHeaders(plainSecret)).expect(200)
    expect(detail.body.entity).toBe('CREATIO')
  })
})
