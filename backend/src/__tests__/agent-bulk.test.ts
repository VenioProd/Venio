import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import mongoose from 'mongoose'
import fs from 'node:fs'
import path from 'node:path'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp, createAgentTokenInDb, authHeaders, uniqueIdempotencyKey } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import Task from '../models/Task.js'
import TaskComment from '../models/TaskComment.js'
import InternalTicket from '../models/InternalTicket.js'
import Document from '../models/Document.js'

let app: Express
let adminId: string
let projectId: string
const unknownId = () => new mongoose.Types.ObjectId().toString()

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})
afterAll(async () => {
  await teardownMongo()
})
beforeEach(async () => {
  await clearDb()
  const admin = await User.create({ email: 'a@v.test', passwordHash: 'x', name: 'Admin', role: 'SUPER_ADMIN' })
  adminId = String(admin._id)
  const client = await User.create({ email: 'c@v.test', passwordHash: 'x', name: 'Cl', role: 'CLIENT' })
  projectId = String((await Project.create({ name: 'P', client: client._id }))._id)
})

const post = (secret: string, url: string, body: unknown, key = uniqueIdempotencyKey()) =>
  request(app)
    .post(`/api/v1/agent${url}`)
    .set(authHeaders(secret, { idempotencyKey: key }))
    .send(body as object)

describe('Agent POST /tasks/bulk', () => {
  it('requires write:tasks, not read:tasks', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:tasks'])
    const t = await Task.create({ project: projectId, title: 'x', createdBy: adminId })
    const res = await post(plainSecret, '/tasks/bulk', { ids: [String(t._id)], action: 'delete' })
    expect(res.status).toBe(403)
    expect(res.body.code ?? res.body.error?.code).toBe('INSUFFICIENT_SCOPE')
    expect(await Task.countDocuments()).toBe(1)
  })

  it('requires an Idempotency-Key', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:tasks'])
    const res = await request(app)
      .post('/api/v1/agent/tasks/bulk')
      .set({ Authorization: `Bearer ${plainSecret}` })
      .send({ ids: [unknownId()], action: 'delete' })
    expect(res.status).toBe(400)
  })

  it('rejects invalid ids, actions and patches', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:tasks'])
    expect((await post(plainSecret, '/tasks/bulk', { ids: ['nope'], action: 'delete' })).status).toBe(400)
    expect((await post(plainSecret, '/tasks/bulk', { ids: [], action: 'delete' })).status).toBe(400)
    expect(
      (await post(plainSecret, '/tasks/bulk', { ids: Array.from({ length: 201 }, unknownId), action: 'delete' }))
        .status,
    ).toBe(400)
    expect((await post(plainSecret, '/tasks/bulk', { ids: [unknownId()], action: 'nuke' })).status).toBe(400)
    expect(
      (await post(plainSecret, '/tasks/bulk', { ids: [unknownId()], action: 'update', patch: { status: 'X' } })).status,
    ).toBe(400)
  })

  it('updates, archives and reports partial failure', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:tasks'])
    const [a, b] = await Task.create([
      { project: projectId, title: 'A', createdBy: adminId },
      { project: projectId, title: 'B', createdBy: adminId },
    ])
    const ids = [String(a._id), String(b._id)]
    const missing = unknownId()
    const upd = await post(plainSecret, '/tasks/bulk', {
      ids: [...ids, missing],
      action: 'update',
      patch: { status: 'TERMINE', priority: 'HAUTE', assignee: adminId, dueDate: '2026-12-24' },
    })
    expect(upd.status).toBe(200)
    expect(upd.body.succeeded.sort()).toEqual([...ids].sort())
    expect(upd.body.failed).toEqual([{ id: missing, error: 'Tâche non trouvée' }])
    expect((await Task.findById(ids[0]))?.priority).toBe('HAUTE')

    const arch = await post(plainSecret, '/tasks/bulk', { ids, action: 'archive' })
    expect(arch.status).toBe(200)
    expect(await Task.countDocuments({ isArchived: true })).toBe(2)
  })

  it('deletes tasks and their comments, and replays on the same Idempotency-Key', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:tasks'])
    const t = await Task.create({ project: projectId, title: 'A', createdBy: adminId })
    await TaskComment.create({ task: t._id, author: adminId, content: 'hi' })
    const key = uniqueIdempotencyKey()
    const body = { ids: [String(t._id)], action: 'delete' }
    const first = await post(plainSecret, '/tasks/bulk', body, key)
    expect(first.status).toBe(200)
    expect(first.body).toEqual({ succeeded: [String(t._id)], failed: [] })
    expect(await TaskComment.countDocuments()).toBe(0)
    const replay = await post(plainSecret, '/tasks/bulk', body, key)
    expect(replay.status).toBe(200)
    expect(replay.body).toEqual(first.body)
    const conflict = await post(plainSecret, '/tasks/bulk', { ...body, action: 'archive' }, key)
    expect(conflict.status).toBe(409)
  })
})

describe('Agent POST /tickets/bulk', () => {
  it('enforces write:tickets and acts on tickets', async () => {
    const t = await InternalTicket.create({ title: 'T', message: 'm', authorId: adminId, authorName: 'A' })
    const ro = await createAgentTokenInDb(['read:tickets'])
    expect((await post(ro.plainSecret, '/tickets/bulk', { ids: [String(t._id)], action: 'delete' })).status).toBe(403)
    const { plainSecret } = await createAgentTokenInDb(['write:tickets'])
    const ids = [String(t._id)]
    expect((await post(plainSecret, '/tickets/bulk', { ids: ['x'], action: 'delete' })).status).toBe(400)
    const upd = await post(plainSecret, '/tickets/bulk', { ids, action: 'update', patch: { status: 'RESOLU' } })
    expect(upd.body.succeeded).toEqual(ids)
    expect((await InternalTicket.findById(ids[0]))?.status).toBe('RESOLU')
    await post(plainSecret, '/tickets/bulk', { ids, action: 'archive' })
    expect((await InternalTicket.findById(ids[0]))?.isArchived).toBe(true)
    await post(plainSecret, '/tickets/bulk', { ids, action: 'unarchive' })
    expect((await InternalTicket.findById(ids[0]))?.isArchived).toBe(false)
    const del = await post(plainSecret, '/tickets/bulk', { ids: [...ids, unknownId()], action: 'delete' })
    expect(del.body.succeeded).toEqual(ids)
    expect(del.body.failed).toHaveLength(1)
  })
})

describe('Agent POST /documents/bulk', () => {
  it('enforces write:documents and deletes DB rows and files', async () => {
    const file = path.join(process.cwd(), 'uploads', `bulk-test-${Date.now()}.txt`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'x')
    const doc = await Document.create({
      project: projectId,
      type: 'FICHIER_PROJET',
      originalName: 'x.txt',
      mimeType: 'text/plain',
      size: 1,
      storagePath: path.relative(process.cwd(), file),
      uploadedBy: adminId,
    })
    const ro = await createAgentTokenInDb(['read:documents'])
    expect((await post(ro.plainSecret, '/documents/bulk', { ids: [String(doc._id)], action: 'delete' })).status).toBe(
      403,
    )
    const { plainSecret } = await createAgentTokenInDb(['write:documents'])
    expect((await post(plainSecret, '/documents/bulk', { ids: [String(doc._id)], action: 'archive' })).status).toBe(400)
    const res = await post(plainSecret, '/documents/bulk', { ids: [String(doc._id), unknownId()], action: 'delete' })
    expect(res.status).toBe(200)
    expect(res.body.succeeded).toEqual([String(doc._id)])
    expect(res.body.failed).toHaveLength(1)
    expect(await Document.countDocuments()).toBe(0)
    expect(fs.existsSync(file)).toBe(false)
  })
})

describe('Agent OpenAPI includes the bulk endpoints', () => {
  it('lists them as POST operations', async () => {
    const res = await request(app).get('/api/v1/agent/openapi.json')
    expect(res.status).toBe(200)
    for (const p of ['/tasks/bulk', '/tickets/bulk', '/documents/bulk']) {
      expect(Object.keys(res.body.paths[p] ?? {})).toContain('post')
    }
  })
})
