import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import fs from 'node:fs'
import path from 'node:path'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const authState = vi.hoisted(() => ({
  user: null as Request['user'] | null,
}))

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
let ownUserId: mongoose.Types.ObjectId
let otherUserId: mongoose.Types.ObjectId
let superAdminId: mongoose.Types.ObjectId

async function actAs(userId: mongoose.Types.ObjectId, role: NonNullable<Request['user']>['role']): Promise<void> {
  authState.user = {
    id: userId.toString(),
    role,
    email: `${role.toLowerCase()}@test.local`,
    name: role,
  }
}

beforeAll(async () => {
  await setupMongo()
  const { default: ticketRoutes } = await import('../routes/admin/tickets.js')
  const { default: resourceRoutes } = await import('../routes/admin/resources.js')
  const { default: internalProjectRoutes } = await import('../routes/admin/internalProjects.js')
  const { default: toolAccessRoutes } = await import('../routes/admin/toolAccess.js')

  app = express()
  app.use(express.json())
  app.use('/api/admin/tickets', ticketRoutes)
  app.use('/api/admin/resources', resourceRoutes)
  app.use('/api/admin/internal-projects', internalProjectRoutes)
  app.use('/api/admin/tool-access', toolAccessRoutes)
})

afterAll(async () => {
  authState.user = null
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  const { default: User } = await import('../models/User.js')
  const [owner, other, superAdmin] = await User.create([
    { email: 'viewer@test.local', name: 'Viewer', role: 'VIEWER', passwordHash: 'x' },
    { email: 'other@test.local', name: 'Other', role: 'VIEWER', passwordHash: 'x' },
    { email: 'super@test.local', name: 'Super', role: 'SUPER_ADMIN', passwordHash: 'x', twoFactorEnabled: true },
  ])
  ownUserId = owner._id as mongoose.Types.ObjectId
  otherUserId = other._id as mongoose.Types.ObjectId
  superAdminId = superAdmin._id as mongoose.Types.ObjectId
})

describe('ticket permissions and author scoping', () => {
  it('authorizes ticket readers but scopes every read model to their own tickets', async () => {
    const { default: InternalTicket } = await import('../models/InternalTicket.js')
    const [ownOpen, ownArchived, otherOpen, otherArchived] = await InternalTicket.create([
      { title: 'Mine open', message: 'Mine', authorId: ownUserId, authorName: 'Viewer', status: 'OUVERT' },
      {
        title: 'Mine archived',
        message: 'Mine',
        authorId: ownUserId,
        authorName: 'Viewer',
        status: 'FERME',
        isArchived: true,
        archivedAt: new Date(),
      },
      { title: 'Other open', message: 'Other', authorId: otherUserId, authorName: 'Other', status: 'OUVERT' },
      {
        title: 'Other archived',
        message: 'Other',
        authorId: otherUserId,
        authorName: 'Other',
        status: 'FERME',
        isArchived: true,
        archivedAt: new Date(),
      },
    ])
    await actAs(ownUserId, 'VIEWER')

    const list = await request(app).get('/api/admin/tickets').expect(200)
    expect(list.body.map((ticket: { _id: string }) => ticket._id)).toEqual([ownOpen._id.toString()])

    await request(app)
      .get('/api/admin/tickets/stats')
      .expect(200)
      .then((res) => {
        expect(res.body).toEqual({ open: 1, inProgress: 0, total: 1 })
      })

    const archived = await request(app).get('/api/admin/tickets/archived').expect(200)
    expect(archived.body.map((ticket: { _id: string }) => ticket._id)).toEqual([ownArchived._id.toString()])

    await request(app)
      .get('/api/admin/tickets/kpi?period=all')
      .expect(200)
      .then((res) => {
        expect(res.body.totalCreated).toBe(2)
        expect(res.body.open).toBe(1)
        expect(res.body.archived).toBe(1)
        expect(res.body.topAuthors).toEqual([{ name: 'Viewer', count: 2 }])
      })

    await request(app).get(`/api/admin/tickets/${ownOpen._id}`).expect(200)
    await request(app).get(`/api/admin/tickets/${otherOpen._id}`).expect(403)
    expect(otherArchived._id).toBeDefined()
  })

  it('rejects a role without ticket permission before querying ticket data', async () => {
    const { default: User } = await import('../models/User.js')
    const accountant = await User.create({
      email: 'accountant@test.local',
      name: 'Accountant',
      role: 'COMPTABLE',
      passwordHash: 'x',
    })
    await actAs(accountant._id as mongoose.Types.ObjectId, 'COMPTABLE')

    await request(app).get('/api/admin/tickets').expect(403)
    await request(app).get('/api/admin/tickets/stats').expect(403)
    await request(app).post('/api/admin/tickets').send({ message: 'Denied' }).expect(403)
  })

  it('does not serve an attachment belonging to another ticket author', async () => {
    const { default: InternalTicket } = await import('../models/InternalTicket.js')
    const ownFilename = `ticket-scope-own-${Date.now()}.txt`
    const otherFilename = `ticket-scope-other-${Date.now()}.txt`
    const uploadsDir = path.resolve('uploads/tickets')
    fs.mkdirSync(uploadsDir, { recursive: true })
    fs.writeFileSync(path.join(uploadsDir, ownFilename), 'own attachment')
    fs.writeFileSync(path.join(uploadsDir, otherFilename), 'other attachment')

    try {
      await InternalTicket.create([
        {
          title: 'Mine',
          message: 'Mine',
          authorId: ownUserId,
          authorName: 'Viewer',
          attachments: [{ filename: ownFilename, originalName: ownFilename, mimetype: 'text/plain', size: 14 }],
        },
        {
          title: 'Other',
          message: 'Other',
          authorId: otherUserId,
          authorName: 'Other',
          attachments: [{ filename: otherFilename, originalName: otherFilename, mimetype: 'text/plain', size: 16 }],
        },
      ])
      await actAs(ownUserId, 'VIEWER')

      await request(app).get(`/api/admin/tickets/files/${ownFilename}`).expect(200)
      await request(app).get(`/api/admin/tickets/files/${otherFilename}`).expect(404)
    } finally {
      for (const filename of [ownFilename, otherFilename]) {
        const filePath = path.join(uploadsDir, filename)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      }
    }
  })
})

describe('permissions on the remaining VENIO-7 admin modules', () => {
  it('allows the matching read permissions and rejects unrelated roles', async () => {
    await actAs(ownUserId, 'VIEWER')
    await request(app).get('/api/admin/resources/categories').expect(200)
    await request(app).get('/api/admin/internal-projects/meta').expect(200)
    await request(app).get('/api/admin/tool-access').expect(403)

    const { default: User } = await import('../models/User.js')
    const accountant = await User.create({
      email: 'accountant@test.local',
      name: 'Accountant',
      role: 'COMPTABLE',
      passwordHash: 'x',
    })
    await actAs(accountant._id as mongoose.Types.ObjectId, 'COMPTABLE')
    await request(app).get('/api/admin/resources/categories').expect(403)
    await request(app).get('/api/admin/internal-projects/meta').expect(200)

    await actAs(superAdminId, 'SUPER_ADMIN')
    await request(app).get('/api/admin/tool-access').expect(200)
  })
})
