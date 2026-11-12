import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp, createAgentTokenInDb, authHeaders, uniqueIdempotencyKey } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import Notification from '../models/Notification.js'

let app: Express
let adminId: string
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
  adminId = String(
    (await User.create({ email: 'a@v.test', passwordHash: 'x', name: 'Admin', role: 'SUPER_ADMIN' }))._id,
  )
})

const post = (secret: string, url: string, body: unknown, key = uniqueIdempotencyKey()) =>
  request(app)
    .post(`/api/v1/agent${url}`)
    .set(authHeaders(secret, { idempotencyKey: key }))
    .send(body as object)

describe('Agent POST /notifications/bulk', () => {
  it('enforces write:notifications, validates and acts on notifications', async () => {
    const mk = (title: string) => Notification.create({ recipient: adminId, type: 'TASK_ASSIGNED', title })
    const [a, b] = await Promise.all([mk('A'), mk('B')])
    const ids = [String(a._id), String(b._id)]

    const ro = await createAgentTokenInDb(['read:notifications'])
    const denied = await post(ro.plainSecret, '/notifications/bulk', { ids, action: 'delete' })
    expect(denied.status).toBe(403)
    expect(await Notification.countDocuments()).toBe(2)

    const { plainSecret } = await createAgentTokenInDb(['write:notifications'])
    expect((await post(plainSecret, '/notifications/bulk', { ids: ['x'], action: 'read' })).status).toBe(400)
    expect((await post(plainSecret, '/notifications/bulk', { ids, action: 'nuke' })).status).toBe(400)
    expect(
      (await post(plainSecret, '/notifications/bulk', { ids: Array.from({ length: 201 }, unknownId), action: 'read' }))
        .status,
    ).toBe(400)

    const read = await post(plainSecret, '/notifications/bulk', { ids: [...ids, unknownId()], action: 'read' })
    expect(read.status).toBe(200)
    expect(read.body.succeeded.sort()).toEqual([...ids].sort())
    expect(read.body.failed).toHaveLength(1)
    expect(await Notification.countDocuments({ isRead: true })).toBe(2)

    await post(plainSecret, '/notifications/bulk', { ids, action: 'unread' })
    expect(await Notification.countDocuments({ isRead: false })).toBe(2)
    await post(plainSecret, '/notifications/bulk', { ids, action: 'archive' })
    expect(await Notification.countDocuments({ archivedAt: { $ne: null } })).toBe(2)
    await post(plainSecret, '/notifications/bulk', { ids, action: 'unarchive' })
    expect(await Notification.countDocuments({ archivedAt: null })).toBe(2)

    const key = uniqueIdempotencyKey()
    const first = await post(plainSecret, '/notifications/bulk', { ids, action: 'delete' }, key)
    expect(first.body.succeeded.sort()).toEqual([...ids].sort())
    const replay = await post(plainSecret, '/notifications/bulk', { ids, action: 'delete' }, key)
    expect(replay.body).toEqual(first.body)
    expect((await post(plainSecret, '/notifications/bulk', { ids, action: 'read' }, key)).status).toBe(409)
    expect(await Notification.countDocuments()).toBe(0)
  })
})
