import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    req.user = authState.user
    next()
  },
}))

let app: Express
let aliceId: string
let bobId: string
let superId: string

function actAs(id: string, role: NonNullable<Request['user']>['role']) {
  authState.user = { id, role, email: `${id}@test.local`, name: role }
}
const unknownId = () => new mongoose.Types.ObjectId().toString()
const key = () => ({ 'Idempotency-Key': crypto.randomUUID() })

beforeAll(async () => {
  await setupMongo()
  const { default: notifications } = await import('../routes/admin/notifications.js')
  const { default: decisions } = await import('../routes/admin/decisions.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/notifications', notifications)
  app.use('/api/admin/decisions', decisions)
})
afterAll(async () => {
  authState.user = null
  await teardownMongo()
})
beforeEach(async () => {
  await clearDb()
  const { default: User } = await import('../models/User.js')
  const [alice, bob, sup] = await User.create([
    { email: 'alice@test.local', name: 'Alice', role: 'MANAGER', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'bob@test.local', name: 'Bob', role: 'MANAGER', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'super@test.local', name: 'Super', role: 'SUPER_ADMIN', passwordHash: 'x', twoFactorEnabled: true },
  ])
  aliceId = String(alice._id)
  bobId = String(bob._id)
  superId = String(sup._id)
})

async function notif(recipient: string, extra: Record<string, unknown> = {}) {
  const { default: Notification } = await import('../models/Notification.js')
  return String((await Notification.create({ recipient, type: 'TASK_ASSIGNED', title: 'N', ...extra }))._id)
}

describe('POST /api/admin/notifications/bulk', () => {
  it('requires authentication', async () => {
    authState.user = null
    const res = await request(app).post('/api/admin/notifications/bulk').send({ ids: [unknownId()], action: 'read' })
    expect(res.status).toBe(401)
  })

  it('validates ids and action', async () => {
    actAs(aliceId, 'MANAGER')
    const post = (body: object) => request(app).post('/api/admin/notifications/bulk').set(key()).send(body)
    expect((await post({ ids: [], action: 'read' })).status).toBe(400)
    expect((await post({ ids: ['x'], action: 'read' })).status).toBe(400)
    expect((await post({ ids: Array.from({ length: 201 }, unknownId), action: 'read' })).status).toBe(400)
    expect((await post({ ids: [unknownId()], action: 'purge' })).status).toBe(400)
  })

  it("refuses another user's notifications and reports a partial success", async () => {
    const { default: Notification } = await import('../models/Notification.js')
    const mine = await notif(aliceId)
    const theirs = await notif(bobId)
    actAs(aliceId, 'MANAGER')
    const res = await request(app)
      .post('/api/admin/notifications/bulk')
      .set(key())
      .send({ ids: [mine, theirs], action: 'read' })
    expect(res.status).toBe(200)
    expect(res.body.succeeded).toEqual([mine])
    expect(res.body.failed).toEqual([{ id: theirs, error: 'Notification non trouvée' }])
    expect((await Notification.findById(theirs))?.isRead).toBe(false)

    // Même un SUPER_ADMIN ne touche pas aux notifications d'autrui.
    actAs(superId, 'SUPER_ADMIN')
    const del = await request(app)
      .post('/api/admin/notifications/bulk')
      .set(key())
      .send({ ids: [theirs], action: 'delete' })
    expect(del.body.succeeded).toEqual([])
    expect(await Notification.countDocuments({ _id: theirs })).toBe(1)
  })

  it('marks unread, archives, unarchives and deletes; archived ones leave the bell and the unread count', async () => {
    const { default: Notification } = await import('../models/Notification.js')
    const a = await notif(aliceId, { isRead: true })
    const b = await notif(aliceId)
    actAs(aliceId, 'MANAGER')
    const bulk = (action: string, ids: string[]) =>
      request(app).post('/api/admin/notifications/bulk').set(key()).send({ ids, action })

    await bulk('unread', [a])
    expect((await Notification.findById(a))?.isRead).toBe(false)
    await bulk('archive', [a, b])
    expect((await request(app).get('/api/admin/notifications')).body.notifications).toHaveLength(0)
    expect((await request(app).get('/api/admin/notifications/unread-count')).body.count).toBe(0)
    expect((await request(app).get('/api/admin/notifications/all?view=archived')).body.total).toBe(2)
    expect((await request(app).get('/api/admin/notifications/all?view=active')).body.total).toBe(0)
    await bulk('unarchive', [a])
    expect((await request(app).get('/api/admin/notifications')).body.notifications).toHaveLength(1)
    const del = await bulk('delete', [a, b])
    expect(del.body.succeeded.sort()).toEqual([a, b].sort())
    expect(await Notification.countDocuments()).toBe(0)
  })

  it('replays on the same Idempotency-Key', async () => {
    const a = await notif(aliceId)
    actAs(aliceId, 'MANAGER')
    const headers = key()
    const first = await request(app).post('/api/admin/notifications/bulk').set(headers).send({ ids: [a], action: 'delete' })
    const replay = await request(app).post('/api/admin/notifications/bulk').set(headers).send({ ids: [a], action: 'delete' })
    expect(replay.body).toEqual(first.body)
  })
})

describe('POST /api/admin/notifications/delete-read', () => {
  it('deletes only my read, non-archived notifications', async () => {
    const { default: Notification } = await import('../models/Notification.js')
    await notif(aliceId, { isRead: true })
    await notif(aliceId, { isRead: true, archivedAt: new Date() })
    const unread = await notif(aliceId)
    const others = await notif(bobId, { isRead: true })
    actAs(aliceId, 'MANAGER')
    const res = await request(app).post('/api/admin/notifications/delete-read').set(key()).send({})
    expect(res.body.deleted).toBe(1)
    expect(await Notification.countDocuments({ _id: { $in: [unread, others] } })).toBe(2)
    expect(await Notification.countDocuments({ recipient: aliceId })).toBe(2)
    const arch = await request(app).post('/api/admin/notifications/delete-read').set(key()).send({ view: 'archived' })
    expect(arch.body.deleted).toBe(1)
  })
})

describe('POST /api/admin/decisions/bulk', () => {
  async function decision(submittedBy: string) {
    const { default: Decision } = await import('../models/Decision.js')
    return String((await Decision.create({ title: 'D', description: 'd', submittedBy, submittedByName: 'x' }))._id)
  }

  it('applies the unit DELETE rights: author or SUPER_ADMIN only', async () => {
    const { default: Decision } = await import('../models/Decision.js')
    const mine = await decision(aliceId)
    const theirs = await decision(bobId)
    actAs(aliceId, 'MANAGER')
    const res = await request(app)
      .post('/api/admin/decisions/bulk')
      .set(key())
      .send({ ids: [mine, theirs], action: 'archive' })
    expect(res.status).toBe(200)
    expect(res.body.succeeded).toEqual([mine])
    expect(res.body.failed).toEqual([{ id: theirs, error: 'Accès refusé' }])
    expect((await Decision.findById(mine))?.archivedAt).toBeTruthy()
    expect((await Decision.findById(theirs))?.archivedAt).toBeNull()

    const list = await request(app).get('/api/admin/decisions')
    expect(list.body.decisions.map((d: { _id: string }) => d._id)).toEqual([theirs])
    const archived = await request(app).get('/api/admin/decisions?archived=true')
    expect(archived.body.decisions.map((d: { _id: string }) => d._id)).toEqual([mine])

    const del = await request(app).post('/api/admin/decisions/bulk').set(key()).send({ ids: [theirs], action: 'delete' })
    expect(del.body.failed).toHaveLength(1)
    expect(await Decision.countDocuments()).toBe(2)

    actAs(superId, 'SUPER_ADMIN')
    const sup = await request(app)
      .post('/api/admin/decisions/bulk')
      .set(key())
      .send({ ids: [mine, theirs, unknownId()], action: 'delete' })
    expect(sup.body.succeeded.sort()).toEqual([mine, theirs].sort())
    expect(sup.body.failed).toHaveLength(1)
    expect(await Decision.countDocuments()).toBe(0)
  })

  it('validates the body', async () => {
    actAs(aliceId, 'MANAGER')
    const post = (body: object) => request(app).post('/api/admin/decisions/bulk').set(key()).send(body)
    expect((await post({ ids: ['x'], action: 'delete' })).status).toBe(400)
    expect((await post({ ids: [unknownId()], action: 'update' })).status).toBe(400)
  })
})
