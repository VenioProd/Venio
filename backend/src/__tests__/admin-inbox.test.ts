import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

const TEST_USER_ID = new mongoose.Types.ObjectId().toString()

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    ;(req as any).user = { id: TEST_USER_ID, role: 'SUPER_ADMIN' }
    next()
  },
}))
vi.mock('../middleware/role.js', () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  userHasPermission: async () => true,
}))

let app: Express

beforeAll(async () => {
  await setupMongo()
  const { default: inboxRoutes } = await import('../routes/admin/inbox.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/inbox', inboxRoutes)
})

afterAll(async () => {
  await teardownMongo()
})
beforeEach(async () => {
  await clearDb()
})

describe('GET /api/admin/inbox', () => {
  it('retourne items / counts / snoozedCount avec inbox vide', async () => {
    const res = await request(app).get('/api/admin/inbox').expect(200)
    expect(res.body).toHaveProperty('items')
    expect(res.body).toHaveProperty('counts')
    expect(res.body).toHaveProperty('snoozedCount')
    expect(Array.isArray(res.body.items)).toBe(true)
  })

  it('respecte le query param includeSnoozed', async () => {
    const res = await request(app).get('/api/admin/inbox?includeSnoozed=true').expect(200)
    expect(res.body).toHaveProperty('items')
  })
})

describe('POST /api/admin/inbox/snooze', () => {
  it('crée un snooze (upsert)', async () => {
    const sourceId = new mongoose.Types.ObjectId().toString()
    const res = await request(app)
      .post('/api/admin/inbox/snooze')
      .send({ itemType: 'decision', sourceId, snoozedUntil: new Date(Date.now() + 3600000).toISOString() })
      .expect(200)
    expect(res.body._id).toBeDefined()
    expect(res.body.itemType).toBe('decision')
  })

  it('rejette si fields manquants', async () => {
    await request(app).post('/api/admin/inbox/snooze').send({ itemType: 'decision' }).expect(400)
  })

  it('rejette si snoozedUntil pas une date valide', async () => {
    await request(app)
      .post('/api/admin/inbox/snooze')
      .send({ itemType: 'decision', sourceId: new mongoose.Types.ObjectId().toString(), snoozedUntil: 'not-a-date' })
      .expect(400)
  })

  it('upsert un snooze existant', async () => {
    const sourceId = new mongoose.Types.ObjectId().toString()
    await request(app)
      .post('/api/admin/inbox/snooze')
      .send({ itemType: 'decision', sourceId, snoozedUntil: new Date(Date.now() + 1000).toISOString() })
      .expect(200)
    const res2 = await request(app)
      .post('/api/admin/inbox/snooze')
      .send({ itemType: 'decision', sourceId, snoozedUntil: new Date(Date.now() + 7200000).toISOString() })
      .expect(200)
    const InboxSnooze = (await import('../models/InboxSnooze.js')).default
    const all = await InboxSnooze.find({ itemType: 'decision', sourceId })
    expect(all).toHaveLength(1) // upsert = no duplicates
  })
})

describe('DELETE /api/admin/inbox/snooze/:itemType/:sourceId', () => {
  it('supprime un snooze existant', async () => {
    const sourceId = new mongoose.Types.ObjectId().toString()
    await request(app)
      .post('/api/admin/inbox/snooze')
      .send({ itemType: 'decision', sourceId, snoozedUntil: new Date(Date.now() + 1000).toISOString() })
      .expect(200)
    await request(app).delete(`/api/admin/inbox/snooze/decision/${sourceId}`).expect(204)
  })
})

describe('POST /api/admin/inbox/pin', () => {
  it('crée un pin', async () => {
    const refId = new mongoose.Types.ObjectId().toString()
    const res = await request(app)
      .post('/api/admin/inbox/pin')
      .send({ refType: 'project', refId, title: 'Acme', link: '/admin/projets/x' })
      .expect(201)
    expect(res.body._id).toBeDefined()
    expect(res.body.title).toBe('Acme')
  })

  it('rejette si fields manquants', async () => {
    await request(app).post('/api/admin/inbox/pin').send({ refType: 'project' }).expect(400)
  })
})

describe('DELETE /api/admin/inbox/pin/:id', () => {
  it('supprime un pin', async () => {
    const refId = new mongoose.Types.ObjectId().toString()
    const createRes = await request(app)
      .post('/api/admin/inbox/pin')
      .send({ refType: 'project', refId, title: 'Acme', link: '/admin/projets/x' })
      .expect(201)
    await request(app).delete(`/api/admin/inbox/pin/${createRes.body._id}`).expect(204)
  })
})
