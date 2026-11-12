import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
let superId: string
let managerId: string
let viewerId: string
let ownProjectId: string
let foreignProjectId: string

function actAs(id: string, role: NonNullable<Request['user']>['role']) {
  authState.user = { id, role, email: `${role.toLowerCase()}@test.local`, name: role }
}

const unknownId = () => new mongoose.Types.ObjectId().toString()

beforeAll(async () => {
  await setupMongo()
  const { default: taskBulk } = await import('../routes/admin/tasksBulk.js')
  const { default: ticketRoutes } = await import('../routes/admin/tickets.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/tasks', taskBulk)
  app.use('/api/admin/tickets', ticketRoutes)
})

afterAll(async () => {
  authState.user = null
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  const { default: User } = await import('../models/User.js')
  const { default: Project } = await import('../models/Project.js')
  const [sup, manager, viewer, client] = await User.create([
    { email: 'super@test.local', name: 'Super', role: 'SUPER_ADMIN', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'manager@test.local', name: 'Manager', role: 'MANAGER', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'viewer@test.local', name: 'Viewer', role: 'VIEWER', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'client@test.local', name: 'Client', role: 'CLIENT', passwordHash: 'x' },
  ])
  superId = String(sup._id)
  managerId = String(manager._id)
  viewerId = String(viewer._id)
  const [own, foreign] = await Project.create([
    { name: 'Own', client: client._id, assignedTo: [manager._id] },
    { name: 'Foreign', client: client._id },
  ])
  ownProjectId = String(own._id)
  foreignProjectId = String(foreign._id)
})

async function makeTasks(project: string, n: number, extra: Record<string, unknown> = {}) {
  const { default: Task } = await import('../models/Task.js')
  const docs = await Task.create(
    Array.from({ length: n }, (_, i) => ({ project, title: `T${i}`, createdBy: superId, ...extra })),
  )
  return docs.map((d) => String(d._id))
}

describe('POST /api/admin/tasks/bulk', () => {
  it('refuses users without MANAGE_TASKS', async () => {
    actAs(viewerId, 'VIEWER')
    const [id] = await makeTasks(ownProjectId, 1)
    await request(app)
      .post('/api/admin/tasks/bulk')
      .send({ ids: [id], action: 'delete' })
      .expect(403)
    const { default: Task } = await import('../models/Task.js')
    expect(await Task.countDocuments()).toBe(1)
  })

  it('rejects malformed requests without touching anything', async () => {
    actAs(superId, 'SUPER_ADMIN')
    const [id] = await makeTasks(ownProjectId, 1)
    const post = (body: unknown) =>
      request(app)
        .post('/api/admin/tasks/bulk')
        .send(body as object)
    await post({ ids: [], action: 'delete' }).expect(400)
    await post({ ids: 'x', action: 'delete' }).expect(400)
    await post({ ids: [id, 'not-an-id'], action: 'delete' }).expect(400)
    await post({ ids: Array.from({ length: 201 }, unknownId), action: 'delete' }).expect(400)
    await post({ ids: [id], action: 'explode' }).expect(400)
    await post({ ids: [id], action: 'update' }).expect(400)
    await post({ ids: [id], action: 'update', patch: {} }).expect(400)
    await post({ ids: [id], action: 'update', patch: { status: 'NOPE' } }).expect(400)
    await post({ ids: [id], action: 'update', patch: { title: 'x' } }).expect(400)
    await post({ ids: [id], action: 'update', patch: { assignee: 'zz' } }).expect(400)
    await post({ ids: [id], action: 'update', patch: { assignee: unknownId() } }).expect(400)
    await post({ ids: [id], action: 'update', patch: { dueDate: 'pas une date' } }).expect(400)
    await post({ ids: [id], action: 'archive', patch: { status: 'A_FAIRE' } }).expect(400)
    const { default: Task } = await import('../models/Task.js')
    expect(await Task.countDocuments()).toBe(1)
  })

  it('updates status, priority, assignee and due date, then reports partial success', async () => {
    actAs(superId, 'SUPER_ADMIN')
    const ids = await makeTasks(ownProjectId, 2)
    const missing = unknownId()
    const res = await request(app)
      .post('/api/admin/tasks/bulk')
      .send({
        ids: [...ids, missing],
        action: 'update',
        patch: { status: 'EN_COURS', priority: 'URGENTE', assignee: managerId, dueDate: '2026-12-01' },
      })
      .expect(200)
    expect(res.body.succeeded.sort()).toEqual([...ids].sort())
    expect(res.body.failed).toEqual([{ id: missing, error: 'Tâche non trouvée' }])
    const { default: Task } = await import('../models/Task.js')
    const t = await Task.findById(ids[0])
    expect(t?.status).toBe('EN_COURS')
    expect(t?.priority).toBe('URGENTE')
    expect(String(t?.assignee)).toBe(managerId)
    expect(t?.dueDate?.toISOString().slice(0, 10)).toBe('2026-12-01')

    const { default: ActivityLog } = await import('../models/ActivityLog.js')
    expect(await ActivityLog.countDocuments({ action: 'TASK_UPDATED' })).toBe(2)
    const { default: Notification } = await import('../models/Notification.js')
    expect(await Notification.countDocuments({ recipient: managerId, type: 'TASK_ASSIGNED' })).toBe(2)
  })

  it('clears assignee and due date with null', async () => {
    actAs(superId, 'SUPER_ADMIN')
    const ids = await makeTasks(ownProjectId, 1, { assignee: managerId, dueDate: new Date() })
    await request(app)
      .post('/api/admin/tasks/bulk')
      .send({ ids, action: 'update', patch: { assignee: null, dueDate: null } })
      .expect(200)
    const { default: Task } = await import('../models/Task.js')
    const t = await Task.findById(ids[0])
    expect(t?.assignee).toBeNull()
    expect(t?.dueDate).toBeNull()
  })

  it('archives and unarchives', async () => {
    actAs(superId, 'SUPER_ADMIN')
    const ids = await makeTasks(ownProjectId, 2)
    const { default: Task } = await import('../models/Task.js')
    await request(app).post('/api/admin/tasks/bulk').send({ ids, action: 'archive' }).expect(200)
    expect(await Task.countDocuments({ isArchived: true })).toBe(2)
    await request(app).post('/api/admin/tasks/bulk').send({ ids, action: 'unarchive' }).expect(200)
    expect(await Task.countDocuments({ isArchived: true })).toBe(0)
  })

  it('deletes tasks, removes attachment files and logs the activity', async () => {
    actAs(superId, 'SUPER_ADMIN')
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-')), 'a.txt')
    fs.writeFileSync(file, 'x')
    const { default: Task } = await import('../models/Task.js')
    const task = await Task.create({
      project: ownProjectId,
      title: 'Avec PJ',
      createdBy: superId,
      attachments: [{ originalName: 'a.txt', storagePath: file, mimeType: 'text/plain', size: 1 }],
    })
    const res = await request(app)
      .post('/api/admin/tasks/bulk')
      .send({ ids: [String(task._id)], action: 'delete' })
      .expect(200)
    expect(res.body).toEqual({ succeeded: [String(task._id)], failed: [] })
    expect(fs.existsSync(file)).toBe(false)
    expect(await Task.countDocuments()).toBe(0)
    const { default: ActivityLog } = await import('../models/ActivityLog.js')
    expect(await ActivityLog.countDocuments({ action: 'TASK_DELETED' })).toBe(1)
  })

  it('denies tasks of projects the caller cannot access, task by task', async () => {
    actAs(managerId, 'MANAGER')
    const [mine] = await makeTasks(ownProjectId, 1)
    const [theirs] = await makeTasks(foreignProjectId, 1)
    const res = await request(app)
      .post('/api/admin/tasks/bulk')
      .send({ ids: [mine, theirs], action: 'delete' })
      .expect(200)
    expect(res.body.succeeded).toEqual([mine])
    expect(res.body.failed).toEqual([{ id: theirs, error: 'Accès refusé' }])
    const { default: Task } = await import('../models/Task.js')
    expect(await Task.findById(theirs)).not.toBeNull()
  })
})

describe('POST /api/admin/tickets/bulk', () => {
  async function makeTickets(n: number) {
    const { default: InternalTicket } = await import('../models/InternalTicket.js')
    const docs = await InternalTicket.create(
      Array.from({ length: n }, (_, i) => ({
        title: `Ticket ${i}`,
        message: 'm',
        authorId: viewerId,
        authorName: 'Viewer',
        status: 'OUVERT',
      })),
    )
    return docs.map((d) => String(d._id))
  }

  it('is reserved to super admins', async () => {
    const ids = await makeTickets(1)
    actAs(managerId, 'MANAGER')
    await request(app).post('/api/admin/tickets/bulk').send({ ids, action: 'delete' }).expect(403)
    actAs(viewerId, 'VIEWER')
    await request(app).post('/api/admin/tickets/bulk').send({ ids, action: 'delete' }).expect(403)
    const { default: InternalTicket } = await import('../models/InternalTicket.js')
    expect(await InternalTicket.countDocuments()).toBe(1)
  })

  it('validates input', async () => {
    actAs(superId, 'SUPER_ADMIN')
    const [id] = await makeTickets(1)
    await request(app)
      .post('/api/admin/tickets/bulk')
      .send({ ids: ['x'], action: 'delete' })
      .expect(400)
    await request(app)
      .post('/api/admin/tickets/bulk')
      .send({ ids: [id], action: 'update', patch: { status: 'X' } })
      .expect(400)
    await request(app)
      .post('/api/admin/tickets/bulk')
      .send({ ids: [id], action: 'update', patch: { priority: 'HAUTE' } })
      .expect(400)
  })

  it('updates status, archives, unarchives and deletes with partial failure', async () => {
    actAs(superId, 'SUPER_ADMIN')
    const ids = await makeTickets(2)
    const missing = unknownId()
    const { default: InternalTicket } = await import('../models/InternalTicket.js')

    const upd = await request(app)
      .post('/api/admin/tickets/bulk')
      .send({ ids: [...ids, missing], action: 'update', patch: { status: 'RESOLU' } })
      .expect(200)
    expect(upd.body.succeeded.sort()).toEqual([...ids].sort())
    expect(upd.body.failed).toEqual([{ id: missing, error: 'Ticket introuvable' }])
    expect(await InternalTicket.countDocuments({ status: 'RESOLU' })).toBe(2)

    await request(app).post('/api/admin/tickets/bulk').send({ ids, action: 'archive' }).expect(200)
    expect(await InternalTicket.countDocuments({ isArchived: true, status: 'FERME' })).toBe(2)
    await request(app).post('/api/admin/tickets/bulk').send({ ids, action: 'unarchive' }).expect(200)
    expect(await InternalTicket.countDocuments({ isArchived: true })).toBe(0)
    await request(app).post('/api/admin/tickets/bulk').send({ ids, action: 'delete' }).expect(200)
    expect(await InternalTicket.countDocuments()).toBe(0)
  })
})
