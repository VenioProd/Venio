import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import bcrypt from 'bcryptjs'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp, createAgentTokenInDb, authHeaders, uniqueIdempotencyKey } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectSection from '../models/ProjectSection.js'
import ProjectItem from '../models/ProjectItem.js'

let app: Express
let adminId: string
let clientId: string

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
  const client = await User.create({
    email: 'cl@v.test',
    passwordHash: await bcrypt.hash('x', 10),
    name: 'Cl',
    role: 'CLIENT',
  })
  clientId = String(client._id)
})

// ───────────────────────────────────────────────────────────────────────────
// Projects
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Projects / CRUD project', () => {
  it('creates a project linked to a real CLIENT user', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:projects'])
    const res = await request(app)
      .post('/api/v1/agent/projects')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ name: 'Refonte site', client: clientId, status: 'EN_COURS' })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Refonte site')
    expect(String(res.body.client)).toBe(clientId)
    expect(res.body.status).toBe('EN_COURS')
  })

  it('rejects when client is not a User with role CLIENT', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:projects'])
    const res = await request(app)
      .post('/api/v1/agent/projects')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ name: 'X', client: adminId })
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('INVALID_CLIENT')
  })

  it('lists projects with default filter (excluding archived)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:projects'])
    await Project.create([
      { name: 'A', client: clientId },
      { name: 'B', client: clientId, isArchived: true },
    ])
    const res = await request(app).get('/api/v1/agent/projects').set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.items[0].name).toBe('A')

    const allRes = await request(app)
      .get('/api/v1/agent/projects?archived=true')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(allRes.body.total).toBe(1)
    expect(allRes.body.items[0].name).toBe('B')
  })

  it('keeps archived projects excluded when q is also provided', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:projects'])
    await Project.create([
      { name: 'Apollo', description: 'search needle', client: clientId },
      { name: 'Archived Apollo', description: 'search needle', client: clientId, isArchived: true },
    ])

    const res = await request(app).get('/api/v1/agent/projects?q=needle').set('Authorization', `Bearer ${plainSecret}`)

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.items[0].name).toBe('Apollo')
  })

  it('PATCH updates fields and archive', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:projects'])
    const p = await Project.create({ name: 'Old', client: clientId })
    const res = await request(app)
      .patch(`/api/v1/agent/projects/${p._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ name: 'New', isArchived: true, status: 'TERMINE' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('New')
    expect(res.body.isArchived).toBe(true)
    expect(res.body.status).toBe('TERMINE')
  })

  it('DELETE cascades to sections, items, updates', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:projects'])
    const p = await Project.create({ name: 'P', client: clientId })
    const s = await ProjectSection.create({
      project: p._id,
      title: 'S',
      createdBy: adminId,
    })
    await ProjectItem.create({
      project: p._id,
      section: s._id,
      type: 'NOTE',
      title: 'I',
      createdBy: adminId,
    })
    const res = await request(app)
      .delete(`/api/v1/agent/projects/${p._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(res.status).toBe(200)
    expect(await Project.countDocuments()).toBe(0)
    expect(await ProjectSection.countDocuments()).toBe(0)
    expect(await ProjectItem.countDocuments()).toBe(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Sections
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Projects / sections', () => {
  it('CRUD sections, list ordered by order', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:projects', 'write:projects'])
    const p = await Project.create({ name: 'P', client: clientId })

    const a = await request(app)
      .post(`/api/v1/agent/projects/${p._id}/sections`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ title: 'A', order: 2 })
    expect(a.status).toBe(201)
    const b = await request(app)
      .post(`/api/v1/agent/projects/${p._id}/sections`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ title: 'B', order: 1 })
    expect(b.status).toBe(201)

    const list = await request(app)
      .get(`/api/v1/agent/projects/${p._id}/sections`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(list.status).toBe(200)
    expect(list.body.items.map((s: { title: string }) => s.title)).toEqual(['B', 'A'])

    // DELETE détache les items de la section
    const item = await ProjectItem.create({
      project: p._id,
      section: a.body._id,
      type: 'NOTE',
      title: 'I',
      createdBy: adminId,
    })
    const del = await request(app)
      .delete(`/api/v1/agent/projects/${p._id}/sections/${a.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(del.status).toBe(200)
    const detached = await ProjectItem.findById(item._id).lean()
    expect(detached?.section).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Items
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Projects / items', () => {
  it('creates a NOTE item without file', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:projects'])
    const p = await Project.create({ name: 'P', client: clientId })
    const res = await request(app)
      .post(`/api/v1/agent/projects/${p._id}/items`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ type: 'NOTE', title: 'Une note', content: 'Hello' })
    expect(res.status).toBe(201)
    expect(res.body.type).toBe('NOTE')
    expect(res.body.title).toBe('Une note')
  })

  it('rejects an item with a file (upload not supported)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:projects'])
    const p = await Project.create({ name: 'P', client: clientId })
    const res = await request(app)
      .post(`/api/v1/agent/projects/${p._id}/items`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        type: 'LIVRABLE',
        title: 'doc',
        file: { originalName: 'x.pdf', storagePath: '/tmp/x.pdf', mimeType: 'application/pdf', size: 100 },
      })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('FILE_UPLOAD_NOT_SUPPORTED')
  })

  it('rejects an item linked to a section from a different project', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:projects'])
    const p1 = await Project.create({ name: 'P1', client: clientId })
    const p2 = await Project.create({ name: 'P2', client: clientId })
    const sectionOfP2 = await ProjectSection.create({
      project: p2._id,
      title: 'X',
      createdBy: adminId,
    })
    const res = await request(app)
      .post(`/api/v1/agent/projects/${p1._id}/items`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ type: 'NOTE', title: 'Misplaced', section: String(sectionOfP2._id) })
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('INVALID_SECTION')
  })

  it('PATCH item status', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:projects'])
    const p = await Project.create({ name: 'P', client: clientId })
    const item = await ProjectItem.create({
      project: p._id,
      type: 'LIVRABLE',
      title: 'L',
      createdBy: adminId,
    })
    const res = await request(app)
      .patch(`/api/v1/agent/projects/${p._id}/items/${item._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ status: 'VALIDE' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('VALIDE')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Updates
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Projects / updates', () => {
  it('creates an update and lists newest first (paginated)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:projects', 'write:projects'])
    const p = await Project.create({ name: 'P', client: clientId })

    await request(app)
      .post(`/api/v1/agent/projects/${p._id}/updates`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ title: 'first' })
    await request(app)
      .post(`/api/v1/agent/projects/${p._id}/updates`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ title: 'second' })

    const list = await request(app)
      .get(`/api/v1/agent/projects/${p._id}/updates`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(list.status).toBe(200)
    expect(list.body.total).toBe(2)
    expect(list.body.items[0].title).toBe('second')
    expect(list.body.items[1].title).toBe('first')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Templates
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Projects / templates', () => {
  it('CRUD project templates', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:projects', 'write:projects'])
    const create = await request(app)
      .post('/api/v1/agent/templates')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        name: 'Refonte web',
        priority: 'HAUTE',
        defaultSections: [{ title: 'Audit' }, { title: 'Design' }, { title: 'Dev' }],
        defaultTasks: [{ title: 'Kick-off' }],
        tags: ['web', 'design'],
      })
    expect(create.status).toBe(201)
    expect(create.body.name).toBe('Refonte web')
    expect(create.body.defaultSections).toHaveLength(3)

    const list = await request(app)
      .get('/api/v1/agent/templates?q=Refonte')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(list.status).toBe(200)
    expect(list.body.total).toBe(1)

    const upd = await request(app)
      .patch(`/api/v1/agent/templates/${create.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ priority: 'URGENTE', tags: ['web'] })
    expect(upd.status).toBe(200)
    expect(upd.body.priority).toBe('URGENTE')
    expect(upd.body.tags).toEqual(['web'])

    const del = await request(app)
      .delete(`/api/v1/agent/templates/${create.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(del.status).toBe(200)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Briefs
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Projects / briefs', () => {
  it('creates a brief linked to a project + destinataire', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:projects', 'write:projects'])
    const p = await Project.create({ name: 'P', client: clientId })
    const dest = await User.create({
      email: 'dest@v.test',
      passwordHash: await bcrypt.hash('x', 10),
      name: 'Dest',
      role: 'ADMIN',
    })

    const create = await request(app)
      .post('/api/v1/agent/briefs')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        project: String(p._id),
        destinataire: String(dest._id),
        intitule: 'Maquette page Pricing',
        deadline: new Date(Date.now() + 86400000).toISOString(),
        entity: 'CREATIO',
        briefPriority: 'P1',
        formatLivrable: ['FIGMA', 'PDF', 'PIRATE'], // PIRATE doit être filtré
      })
    expect(create.status).toBe(201)
    expect(create.body.entity).toBe('CREATIO')
    expect(create.body.briefPriority).toBe('P1')
    expect(create.body.formatLivrable.sort()).toEqual(['FIGMA', 'PDF'])

    const upd = await request(app)
      .patch(`/api/v1/agent/briefs/${create.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ statut: 'EN_REVIEW' })
    expect(upd.status).toBe(200)
    expect(upd.body.statut).toBe('EN_REVIEW')

    const list = await request(app)
      .get(`/api/v1/agent/briefs?project=${p._id}`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(list.status).toBe(200)
    expect(list.body.total).toBe(1)
  })

  it('rejects brief without valid deadline', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:projects'])
    const p = await Project.create({ name: 'P', client: clientId })
    const dest = await User.create({
      email: 'd2@v.test',
      passwordHash: await bcrypt.hash('x', 10),
      name: 'D',
      role: 'ADMIN',
    })
    const res = await request(app)
      .post('/api/v1/agent/briefs')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        project: String(p._id),
        destinataire: String(dest._id),
        intitule: 'X',
        deadline: 'not-a-date',
      })
    expect(res.status).toBe(400)
  })

  it('rejects brief with unknown project', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:projects'])
    const dest = await User.create({
      email: 'd3@v.test',
      passwordHash: await bcrypt.hash('x', 10),
      name: 'D',
      role: 'ADMIN',
    })
    const res = await request(app)
      .post('/api/v1/agent/briefs')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        project: '507f1f77bcf86cd799439099',
        destinataire: String(dest._id),
        intitule: 'X',
        deadline: new Date(Date.now() + 86400000).toISOString(),
      })
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('INVALID_PROJECT')
  })
})
