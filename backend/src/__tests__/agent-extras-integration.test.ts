import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import bcrypt from 'bcryptjs'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import {
  createTestApp,
  createAgentTokenInDb,
  authHeaders,
  uniqueIdempotencyKey,
} from './helpers/agentTestApp.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import Lead from '../models/Lead.js'
import BillingDocument from '../models/BillingDocument.js'

/**
 * Tests d'intégration smoke pour le lot 8 (modules secondaires) :
 * Resources, ToolAccess, Gestion, Qualiopi, Interns, Arrow, Analytics.
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
    email: 'admin@v.test',
    passwordHash: await bcrypt.hash('x', 10),
    name: 'Admin',
    role: 'SUPER_ADMIN',
  })
  adminId = String(admin._id)
})

// ───────────────────────────────────────────────────────────────────────────
// ToolAccess (password sanitized)
// ───────────────────────────────────────────────────────────────────────────

describe('Agent ToolAccess / password masking', () => {
  it('creates + lists tools without exposing plain password', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:toolaccess', 'write:toolaccess'])
    const res = await request(app)
      .post('/api/v1/agent/tool-access')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ name: 'Tool X', login: 'u', password: 'secret-pwd', category: 'DEV' })
    expect(res.status).toBe(201)
    expect(res.body.password).toBeUndefined()

    const list = await request(app)
      .get('/api/v1/agent/tool-access')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(list.body.items[0].password).toBeUndefined()
  })

  it('rotation : PATCH password sets lastRotatedAt', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:toolaccess'])
    const c = await request(app)
      .post('/api/v1/agent/tool-access')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ name: 'X', login: 'u', password: 'first' })
    const u = await request(app)
      .patch(`/api/v1/agent/tool-access/${c.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ password: 'rotated' })
    expect(u.body.lastRotatedAt).toBeTruthy()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Gestion (InternalProject)
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Gestion / internal projects', () => {
  it('CRUD internal projects', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:gestion', 'write:gestion'])
    const create = await request(app)
      .post('/api/v1/agent/internal-projects')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ name: 'Refonte interne', entity: 'Venio', poles: ['Dev', 'BadPole'] })
    expect(create.status).toBe(201)
    // 'BadPole' filtré, 'Dev' conservé
    expect(create.body.poles).toEqual(['Dev'])

    const list = await request(app)
      .get('/api/v1/agent/internal-projects?entity=Venio')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(list.body.total).toBe(1)

    const upd = await request(app)
      .patch(`/api/v1/agent/internal-projects/${create.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ status: 'TERMINE' })
    expect(upd.body.status).toBe('TERMINE')

    const meta = await request(app)
      .get('/api/v1/agent/internal-projects/_meta/options')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(meta.body.entities).toContain('Venio')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Qualiopi
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Qualiopi / questionnaires', () => {
  it('creates + patches + deletes a questionnaire', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:qualiopi', 'write:qualiopi'])
    const c = await request(app)
      .post('/api/v1/agent/qualiopi/questionnaires')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        title: 'Satisfaction stage',
        questions: [{ type: 'rating', label: 'Note ?', order: 1, required: true }],
      })
    expect(c.status).toBe(201)
    expect(c.body.title).toBe('Satisfaction stage')

    const upd = await request(app)
      .patch(`/api/v1/agent/qualiopi/questionnaires/${c.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ description: 'Mise à jour' })
    expect(upd.body.description).toBe('Mise à jour')

    const responses = await request(app)
      .get(`/api/v1/agent/qualiopi/questionnaires/${c.body._id}/responses`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(responses.body.items).toEqual([])

    const del = await request(app)
      .delete(`/api/v1/agent/qualiopi/questionnaires/${c.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(del.status).toBe(200)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Interns
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Interns', () => {
  it('creates intern linked to a User', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:interns'])
    const internUser = await User.create({
      email: 'intern@v.test',
      passwordHash: await bcrypt.hash('x', 10),
      name: 'Stagiaire',
      role: 'ADMIN',
    })
    const res = await request(app)
      .post('/api/v1/agent/interns')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        userId: String(internUser._id),
        type: 'STAGIAIRE',
        poste: 'Stagiaire dev',
        dateDebut: new Date('2026-06-01').toISOString(),
        dateFin: new Date('2026-12-01').toISOString(),
      })
    expect(res.status).toBe(201)
    expect(res.body.poste).toBe('Stagiaire dev')
    expect(res.body.nextcloudPassword).toBeFalsy() // optionnel sur le retour, pas obligatoire
  })

  it('rejects with INVALID_USER if user does not exist', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:interns'])
    const res = await request(app)
      .post('/api/v1/agent/interns')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        userId: '507f1f77bcf86cd799439099',
        type: 'STAGIAIRE',
        poste: 'X',
        dateDebut: new Date().toISOString(),
        dateFin: new Date().toISOString(),
      })
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('INVALID_USER')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Arrow
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Arrow', () => {
  it('pilotage singleton : GET + PUT (upsert)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:arrow', 'write:arrow'])
    const empty = await request(app)
      .get('/api/v1/agent/arrow/pilotage')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(empty.body.goals).toEqual([])

    const put = await request(app)
      .put('/api/v1/agent/arrow/pilotage')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ goals: ['+10 écoles signées', 'Q2 2026'] })
    expect(put.body.goals).toEqual(['+10 écoles signées', 'Q2 2026'])

    const after = await request(app)
      .get('/api/v1/agent/arrow/pilotage')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(after.body.goals).toEqual(['+10 écoles signées', 'Q2 2026'])
  })

  it('schools CRUD', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:arrow', 'write:arrow'])
    const create = await request(app)
      .post('/api/v1/agent/arrow/schools')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ name: 'Lycée Test', schoolType: 'LYCEE', city: 'Paris' })
    expect(create.status).toBe(201)
    expect(create.body.schoolType).toBe('LYCEE')

    const filtered = await request(app)
      .get('/api/v1/agent/arrow/schools?schoolType=LYCEE')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(filtered.body.total).toBe(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Analytics
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Analytics', () => {
  it('snapshot returns counts cross-domain', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:analytics'])
    const client = await User.create({
      email: 'c@v.test',
      passwordHash: await bcrypt.hash('x', 10),
      name: 'C',
      role: 'CLIENT',
    })
    await Project.create({ name: 'P1', client: client._id })
    await Lead.create({ company: 'L1', createdBy: adminId })
    await BillingDocument.create({
      type: 'INVOICE',
      number: 'FAC-X',
      project: (await Project.findOne())!._id,
      client: client._id,
      status: 'ISSUED',
      total: 1000,
      createdBy: adminId,
    })

    const res = await request(app)
      .get('/api/v1/agent/analytics/snapshot')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
    expect(res.body.users.clients).toBe(1)
    expect(res.body.crm.leads).toBe(1)
    expect(res.body.projects.active).toBe(1)
    expect(res.body.billing.openInvoices).toBe(1)
    expect(res.body.generatedAt).toBeTruthy()
  })

  it('crm pipeline aggregation', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:analytics'])
    await Lead.create([
      { company: 'A', status: 'LEAD', budget: 1000, createdBy: adminId },
      { company: 'B', status: 'WON', budget: 5000, createdBy: adminId },
      { company: 'C', status: 'WON', budget: 3000, createdBy: adminId },
    ])
    const res = await request(app)
      .get('/api/v1/agent/analytics/crm')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
    const won = res.body.byStatus.find((s: { _id: string }) => s._id === 'WON')
    expect(won.count).toBe(2)
    expect(won.totalBudget).toBe(8000)
  })
})
