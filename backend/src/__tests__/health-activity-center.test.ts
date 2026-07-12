import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = authState.user
    next()
  },
}))

let app: Express
let superAdminId: mongoose.Types.ObjectId
let accountantId: mongoose.Types.ObjectId

async function actAs(id: mongoose.Types.ObjectId, role: NonNullable<Request['user']>['role']) {
  authState.user = { id: id.toString(), role, email: `${role}@test.local`, name: role }
}

beforeAll(async () => {
  await setupMongo()
  const [{ default: healthRoutes }, { default: activityCenterRoutes }] = await Promise.all([
    import('../routes/admin/health.js'),
    import('../routes/admin/activityCenter.js'),
  ])
  app = express()
  app.use(express.json())
  app.use('/api/admin/health', healthRoutes)
  app.use('/api/admin/activity-center', activityCenterRoutes)
})

afterAll(async () => {
  authState.user = null
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  const { default: User } = await import('../models/User.js')
  const [superAdmin, accountant] = await User.create([
    { email: 'super@test.local', name: 'Super', role: 'SUPER_ADMIN', passwordHash: 'x', twoFactorEnabled: true },
    {
      email: 'accountant@test.local',
      name: 'Accountant',
      role: 'COMPTABLE',
      passwordHash: 'x',
      twoFactorEnabled: true,
    },
  ])
  superAdminId = superAdmin._id as mongoose.Types.ObjectId
  accountantId = accountant._id as mongoose.Types.ObjectId
})

describe('admin health', () => {
  it('requires the system permission and never serializes paths or error payloads', async () => {
    await actAs(accountantId, 'COMPTABLE')
    await request(app).get('/api/admin/health').expect(403)

    const { default: AutomationLog } = await import('../automation/models/AutomationLog.js')
    await AutomationLog.create({
      automationKey: 'test.health.failure',
      executionType: 'cron',
      triggerSource: 'scheduler',
      idempotencyKey: 'health-test',
      status: 'FAILED',
      startedAt: new Date(),
      errorMessage: 'mongodb://user:super-secret@internal.example',
      actionsExecuted: [],
      recipientsNotified: [],
    })
    await actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/health').expect(200)
    const payload = JSON.stringify(response.body)

    expect(response.body.uploads.directories).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'uploads' })]),
    )
    expect(response.body.uploads).not.toHaveProperty('path')
    expect(payload).not.toContain('super-secret')
    expect(payload).not.toContain('internal.example')
    expect(response.body.recentErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'automation:test.health.failure' })]),
    )
  })
})

describe('activity center', () => {
  it('caps every preview at the requested maximum and signals additional items', async () => {
    const { default: InternalTicket } = await import('../models/InternalTicket.js')
    await InternalTicket.create(
      Array.from({ length: 21 }, (_, index) => ({
        title: `Ticket ${index}`,
        message: 'Open',
        authorId: superAdminId,
        authorName: 'Super',
        status: 'OUVERT',
      })),
    )
    await actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/activity-center?limit=999').expect(200)
    const tickets = response.body.sections.find((section: { key: string }) => section.key === 'tickets')

    expect(response.body.limit).toBe(20)
    expect(tickets.entries).toHaveLength(20)
    expect(tickets.hasMore).toBe(true)
  })

  it('filters sections that the current role is not allowed to consult', async () => {
    const [
      { default: InternalTicket },
      { default: Lead },
      { default: BillingDocument },
      { default: Project },
      { default: User },
    ] = await Promise.all([
      import('../models/InternalTicket.js'),
      import('../models/Lead.js'),
      import('../models/BillingDocument.js'),
      import('../models/Project.js'),
      import('../models/User.js'),
    ])
    const client = await User.create({ email: 'client@test.local', name: 'Client', role: 'CLIENT', passwordHash: 'x' })
    const project = await Project.create({ name: 'Projet facturé', client: client._id, createdBy: superAdminId })
    await BillingDocument.create({
      type: 'INVOICE',
      number: 'FAC-001',
      project: project._id,
      client: client._id,
      createdBy: superAdminId,
      status: 'SENT',
      dueAt: new Date(Date.now() - 86_400_000),
    })
    await Lead.create({
      company: 'Lead confidentiel',
      createdBy: superAdminId,
      assignedTo: superAdminId,
      nextActionAt: new Date(Date.now() - 86_400_000),
    })
    await InternalTicket.create({
      title: 'Ticket confidentiel',
      message: 'Open',
      authorId: superAdminId,
      authorName: 'Super',
      status: 'OUVERT',
    })

    await actAs(accountantId, 'COMPTABLE')
    const response = await request(app).get('/api/admin/activity-center').expect(200)
    const keys = response.body.sections.map((section: { key: string }) => section.key)

    expect(keys).toContain('billing')
    expect(keys).not.toContain('crm')
    expect(keys).not.toContain('tickets')
    expect(JSON.stringify(response.body)).not.toContain('Lead confidentiel')
    expect(JSON.stringify(response.body)).not.toContain('Ticket confidentiel')
  })
})
