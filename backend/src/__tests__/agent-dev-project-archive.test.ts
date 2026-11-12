import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp, createAgentTokenInDb, authHeaders, uniqueIdempotencyKey } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import AuditLog from '../models/AuditLog.js'

const mut = (secret: string) => authHeaders(secret, { idempotencyKey: uniqueIdempotencyKey() })

let app: Express
let systemUserId: mongoose.Types.ObjectId

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})
afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  const u = await User.create({ email: 'sys@test.local', name: 'Sys', role: 'SUPER_ADMIN', passwordHash: 'x' })
  systemUserId = u._id as mongoose.Types.ObjectId
})

async function seed() {
  const live = await DevProject.create({ key: 'LIVE', name: 'Vivant', createdBy: systemUserId })
  const old = await DevProject.create({ key: 'OLD', name: 'Ancien', createdBy: systemUserId })
  await DevIssue.create({
    project: live._id,
    identifier: 'LIVE-1',
    title: 'A',
    number: 1,
    status: 'TODO',
    priority: 'URGENT',
    type: 'TASK',
    reporter: systemUserId,
  })
  await DevIssue.create({
    project: old._id,
    identifier: 'OLD-1',
    title: 'B',
    number: 1,
    status: 'TODO',
    priority: 'URGENT',
    type: 'TASK',
    reporter: systemUserId,
  })
  return { live, old }
}

describe('PATCH /api/v1/agent/dev/projects/:id', () => {
  it('401 sans jeton', async () => {
    const { old } = await seed()
    await request(app).patch(`/api/v1/agent/dev/projects/${old._id}`).send({ status: 'ARCHIVED' }).expect(401)
  })

  it('403 avec le seul scope read:dev', async () => {
    const { old } = await seed()
    const { plainSecret } = await createAgentTokenInDb(['read:dev'])
    await request(app)
      .patch(`/api/v1/agent/dev/projects/${old._id}`)
      .set(mut(plainSecret))
      .send({ status: 'ARCHIVED' })
      .expect(403)
    expect((await DevProject.findById(old._id))!.status).toBe('ACTIVE')
  })

  it('archive avec write:dev, pose archivedAt, laisse les tickets intacts et audite', async () => {
    const { old } = await seed()
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])
    const res = await request(app)
      .patch(`/api/v1/agent/dev/projects/${old._id}`)
      .set(mut(plainSecret))
      .send({ status: 'ARCHIVED' })
      .expect(200)
    expect(res.body.status).toBe('ARCHIVED')
    expect(res.body.archivedAt).toBeTruthy()
    const issue = await DevIssue.findOne({ identifier: 'OLD-1' }).lean()
    expect(issue!.archivedAt ?? null).toBeNull()
    expect(issue!.status).toBe('TODO')
    await new Promise((r) => setTimeout(r, 50))
    const audit = await AuditLog.findOne({ action: 'DEV_PROJECT_ARCHIVED' }).lean()
    expect(audit).toBeTruthy()
    expect((audit!.metadata as Record<string, unknown>).entityRef).toBe('OLD')
  })

  it('restaure un projet archivé et remet archivedAt à null', async () => {
    const { old } = await seed()
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])
    const h = () => mut(plainSecret)
    await request(app).patch(`/api/v1/agent/dev/projects/${old._id}`).set(h()).send({ status: 'ARCHIVED' }).expect(200)
    const res = await request(app)
      .patch(`/api/v1/agent/dev/projects/${old._id}`)
      .set(h())
      .send({ status: 'ACTIVE' })
      .expect(200)
    expect(res.body.status).toBe('ACTIVE')
    expect(res.body.archivedAt).toBeNull()
    await new Promise((r) => setTimeout(r, 50))
    expect(await AuditLog.countDocuments({ action: 'DEV_PROJECT_RESTORED' })).toBe(1)
  })

  it('est idempotent : archiver deux fois garde la première archivedAt', async () => {
    const { old } = await seed()
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])
    const h = () => mut(plainSecret)
    const a = await request(app)
      .patch(`/api/v1/agent/dev/projects/${old._id}`)
      .set(h())
      .send({ status: 'ARCHIVED' })
      .expect(200)
    const b = await request(app)
      .patch(`/api/v1/agent/dev/projects/${old._id}`)
      .set(h())
      .send({ status: 'ARCHIVED' })
      .expect(200)
    expect(b.body.archivedAt).toBe(a.body.archivedAt)
  })

  it('400 pour un statut invalide ou PAUSED, 400 pour un id invalide, 404 si introuvable', async () => {
    const { old } = await seed()
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])
    const h = () => mut(plainSecret)
    await request(app).patch(`/api/v1/agent/dev/projects/${old._id}`).set(h()).send({ status: 'PAUSED' }).expect(400)
    await request(app).patch(`/api/v1/agent/dev/projects/${old._id}`).set(h()).send({ status: 'nope' }).expect(400)
    await request(app).patch(`/api/v1/agent/dev/projects/${old._id}`).set(h()).send({}).expect(400)
    await request(app).patch('/api/v1/agent/dev/projects/xyz').set(h()).send({ status: 'ARCHIVED' }).expect(400)
    await request(app)
      .patch(`/api/v1/agent/dev/projects/${new mongoose.Types.ObjectId()}`)
      .set(h())
      .send({ status: 'ARCHIVED' })
      .expect(404)
  })
})

describe('projets archivés : listes et compteurs (agent)', () => {
  async function archiveOld() {
    const { old, live } = await seed()
    await DevProject.updateOne({ _id: old._id }, { status: 'ARCHIVED', archivedAt: new Date() })
    return { old, live }
  }

  it('GET /dev/projects exclut les archivés par défaut et les réintègre avec includeArchived=true', async () => {
    await archiveOld()
    const { plainSecret } = await createAgentTokenInDb(['read:dev'])
    const h = authHeaders(plainSecret)
    const def = await request(app).get('/api/v1/agent/dev/projects').set(h).expect(200)
    expect(def.body.items.map((p: { key: string }) => p.key)).toEqual(['LIVE'])
    const all = await request(app).get('/api/v1/agent/dev/projects?includeArchived=true').set(h).expect(200)
    expect(all.body.items.map((p: { key: string }) => p.key).sort()).toEqual(['LIVE', 'OLD'])
    const onlyArchived = await request(app).get('/api/v1/agent/dev/projects?status=ARCHIVED').set(h).expect(200)
    expect(onlyArchived.body.items.map((p: { key: string }) => p.key)).toEqual(['OLD'])
  })

  it('un projet archivé reste consultable par id', async () => {
    const { old } = await archiveOld()
    const { plainSecret } = await createAgentTokenInDb(['read:dev'])
    const res = await request(app)
      .get(`/api/v1/agent/dev/projects/${old._id}`)
      .set(authHeaders(plainSecret))
      .expect(200)
    expect(res.body.key).toBe('OLD')
    expect(res.body.status).toBe('ARCHIVED')
  })

  it('/dev/stats et /dev/overview excluent les tickets archivés par défaut', async () => {
    const { old } = await archiveOld()
    const { plainSecret } = await createAgentTokenInDb(['read:dev'])
    const h = authHeaders(plainSecret)
    const stats = await request(app).get('/api/v1/agent/dev/stats').set(h).expect(200)
    expect(stats.body).toMatchObject({ total: 1, open: 1, urgent: 1, totalProjects: 1 })
    const statsAll = await request(app).get('/api/v1/agent/dev/stats?includeArchived=true').set(h).expect(200)
    expect(statsAll.body).toMatchObject({ total: 2, open: 2, urgent: 2, totalProjects: 2 })
    const scoped = await request(app).get(`/api/v1/agent/dev/stats?project=${old._id}`).set(h).expect(200)
    expect(scoped.body).toMatchObject({ total: 1, open: 1 })
    const ov = await request(app).get('/api/v1/agent/dev/overview').set(h).expect(200)
    expect(ov.body.projects.map((p: { key: string }) => p.key)).toEqual(['LIVE'])
    expect(ov.body.kpis).toMatchObject({ totalProjects: 1, totalOpen: 1 })
    const ovAll = await request(app).get('/api/v1/agent/dev/overview?includeArchived=true').set(h).expect(200)
    expect(ovAll.body.projects).toHaveLength(2)
    expect(ovAll.body.kpis).toMatchObject({ totalProjects: 2, totalOpen: 2 })
  })
})
