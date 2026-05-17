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
import Task from '../models/Task.js'
import TaskComment from '../models/TaskComment.js'
import InternalTicket from '../models/InternalTicket.js'
import Notification from '../models/Notification.js'

let app: Express
let adminId: string
let clientId: string
let projectId: string

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
  const project = await Project.create({ name: 'P', client: client._id })
  projectId = String(project._id)
})

// ───────────────────────────────────────────────────────────────────────────
// Tasks
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Tasks', () => {
  it('CRUD task + comments cascade delete', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:tasks', 'write:tasks'])

    const create = await request(app)
      .post('/api/v1/agent/tasks')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ project: projectId, title: 'Faire X', priority: 'HAUTE' })
    expect(create.status).toBe(201)
    expect(create.body.title).toBe('Faire X')
    expect(create.body.priority).toBe('HAUTE')
    const taskId = create.body._id

    // Comment
    const c1 = await request(app)
      .post(`/api/v1/agent/tasks/${taskId}/comments`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: 'En cours' })
    expect(c1.status).toBe(201)
    const c2 = await request(app)
      .post(`/api/v1/agent/tasks/${taskId}/comments`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: 'Presque fini', mentions: [adminId] })
    expect(c2.status).toBe(201)
    expect(c2.body.mentions).toContain(adminId)

    const list = await request(app)
      .get(`/api/v1/agent/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(list.body.items).toHaveLength(2)

    // Status update
    const upd = await request(app)
      .patch(`/api/v1/agent/tasks/${taskId}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ status: 'TERMINE', progress: 100 })
    expect(upd.body.status).toBe('TERMINE')
    expect(upd.body.progress).toBe(100)

    // Delete cascades
    const del = await request(app)
      .delete(`/api/v1/agent/tasks/${taskId}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(del.status).toBe(200)
    expect(await Task.countDocuments()).toBe(0)
    expect(await TaskComment.countDocuments()).toBe(0)
  })

  it('progress clamps to [0, 100]', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:tasks'])
    const t = await request(app)
      .post('/api/v1/agent/tasks')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ project: projectId, title: 'X', progress: 999 })
    expect(t.body.progress).toBe(100)
    const t2 = await request(app)
      .post('/api/v1/agent/tasks')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ project: projectId, title: 'Y', progress: -50 })
    expect(t2.body.progress).toBe(0)
  })

  it('filters by assignee and status', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:tasks'])
    await Task.create([
      { project: projectId, title: 'A', status: 'A_FAIRE', assignee: adminId, createdBy: adminId },
      { project: projectId, title: 'B', status: 'TERMINE', assignee: adminId, createdBy: adminId },
      { project: projectId, title: 'C', status: 'A_FAIRE', assignee: null, createdBy: adminId },
    ])
    const r = await request(app)
      .get(`/api/v1/agent/tasks?status=A_FAIRE&assignee=${adminId}`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(r.body.total).toBe(1)
    expect(r.body.items[0].title).toBe('A')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Tickets
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Tickets', () => {
  it('creates ticket + reply, auto-archive on FERME', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:tickets', 'write:tickets'])
    const create = await request(app)
      .post('/api/v1/agent/tickets')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ title: 'Bug login', message: 'plante', priority: 'HAUTE', category: 'PROBLEME' })
    expect(create.status).toBe(201)
    expect(create.body.status).toBe('OUVERT')
    expect(create.body.isArchived).toBe(false)

    const reply = await request(app)
      .post(`/api/v1/agent/tickets/${create.body._id}/replies`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ message: 'On regarde' })
    expect(reply.status).toBe(201)
    expect(reply.body.ticket.replies).toHaveLength(1)

    const closed = await request(app)
      .patch(`/api/v1/agent/tickets/${create.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ status: 'FERME' })
    expect(closed.body.status).toBe('FERME')
    expect(closed.body.isArchived).toBe(true)
    expect(closed.body.archivedAt).toBeTruthy()
  })

  it('filters by category and status', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:tickets'])
    await InternalTicket.create([
      {
        title: 'Q1',
        message: '...',
        category: 'QUESTION',
        priority: 'NORMALE',
        status: 'OUVERT',
        authorId: adminId,
        authorName: 'Admin',
      },
      {
        title: 'P1',
        message: '...',
        category: 'PROBLEME',
        priority: 'HAUTE',
        status: 'EN_COURS',
        authorId: adminId,
        authorName: 'Admin',
      },
    ])
    const probs = await request(app)
      .get('/api/v1/agent/tickets?category=PROBLEME')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(probs.body.total).toBe(1)
    expect(probs.body.items[0].title).toBe('P1')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Messages
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Messages', () => {
  it('posts and lists messages of a project', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:messages', 'write:messages'])
    const m1 = await request(app)
      .post(`/api/v1/agent/projects/${projectId}/messages`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: 'Bonjour' })
    expect(m1.status).toBe(201)
    expect(m1.body.content).toBe('Bonjour')

    await request(app)
      .post(`/api/v1/agent/projects/${projectId}/messages`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: 'Suivi', sender: adminId })

    const list = await request(app)
      .get(`/api/v1/agent/projects/${projectId}/messages`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(list.body.total).toBe(2)
    // Newest first
    expect(list.body.items[0].content).toBe('Suivi')
  })

  it('marks a message as read by a user (idempotent)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:messages', 'write:messages'])
    const m = await request(app)
      .post(`/api/v1/agent/projects/${projectId}/messages`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: 'lu ?' })
    const r1 = await request(app)
      .post(`/api/v1/agent/projects/${projectId}/messages/${m.body._id}/read`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ userId: clientId })
    expect(r1.status).toBe(200)
    expect(r1.body.readBy.map(String)).toContain(clientId)

    // 2e fois : idempotent, pas de doublon
    const r2 = await request(app)
      .post(`/api/v1/agent/projects/${projectId}/messages/${m.body._id}/read`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ userId: clientId })
    expect(r2.status).toBe(200)
    const occurrences = r2.body.readBy.filter((u: string) => String(u) === clientId).length
    expect(occurrences).toBe(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Notifications
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Notifications', () => {
  it('create + list filtered by unreadOnly + mark-read', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:notifications', 'write:notifications'])
    const n1 = await request(app)
      .post('/api/v1/agent/notifications')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ recipient: adminId, type: 'TASK_ASSIGNED', title: 'Test', message: 'x' })
    expect(n1.status).toBe(201)

    const n2 = await request(app)
      .post('/api/v1/agent/notifications')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ recipient: adminId, type: 'PROJECT_UPDATE', title: 'Already read', metadata: { foo: 'bar' } })
    // marquer comme lu
    await request(app)
      .patch(`/api/v1/agent/notifications/${n2.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ isRead: true })

    const unread = await request(app)
      .get(`/api/v1/agent/notifications?recipient=${adminId}&unreadOnly=true`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(unread.body.total).toBe(1)
    expect(unread.body.items[0]._id).toBe(n1.body._id)
  })

  it('mark-all-read updates count and only flips unread ones', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:notifications'])
    await Notification.create([
      { recipient: adminId, type: 'TASK_ASSIGNED', title: 'A' },
      { recipient: adminId, type: 'TASK_ASSIGNED', title: 'B' },
      { recipient: adminId, type: 'TASK_ASSIGNED', title: 'C', isRead: true },
    ])
    const res = await request(app)
      .post('/api/v1/agent/notifications/mark-all-read')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ recipient: adminId })
    expect(res.status).toBe(200)
    expect(res.body.modifiedCount).toBe(2)
    const still = await Notification.countDocuments({ recipient: adminId, isRead: false })
    expect(still).toBe(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Calendar
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Calendar', () => {
  it('aggregates task dueDates and project endDates into events', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:calendar'])
    await Task.create([
      {
        project: projectId,
        title: 'Sprint 1',
        dueDate: new Date('2026-06-15'),
        createdBy: adminId,
      },
      {
        project: projectId,
        title: 'Out of range',
        dueDate: new Date('2026-12-15'),
        createdBy: adminId,
      },
    ])
    await Project.findByIdAndUpdate(projectId, {
      endDate: new Date('2026-06-30'),
      reminderAt: new Date('2026-06-10'),
    })

    const res = await request(app)
      .get('/api/v1/agent/calendar/events?start=2026-06-01&end=2026-06-30')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(3)
    const sources = res.body.items.map((e: { source: string }) => e.source).sort()
    expect(sources).toEqual(['PROJECT_END', 'PROJECT_REMINDER', 'TASK'])
  })

  it('returns 400 when start/end missing', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:calendar'])
    const res = await request(app)
      .get('/api/v1/agent/calendar/events')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(400)
  })
})
