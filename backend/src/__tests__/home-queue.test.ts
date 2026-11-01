import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createAgentTokenInDb, authHeaders } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import Task from '../models/Task.js'
import PersonalTask from '../models/PersonalTask.js'
import Decision from '../models/Decision.js'
import InternalTicket from '../models/InternalTicket.js'
import ChangeRequest from '../models/ChangeRequest.js'
import Lead from '../models/Lead.js'
import DevIssue from '../models/DevIssue.js'
import { scoreQueueItem, clampQueueLimit, MAX_QUEUE_LIMIT, DEFAULT_QUEUE_LIMIT } from '../lib/home/queue.js'

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))
vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = authState.user
    next()
  },
}))

const DAY = 86_400_000
let app: Express

type Seeded = Awaited<ReturnType<typeof makeUser>>
let superAdmin: Seeded
let viewer: Seeded
let client: Seeded
let other: Seeded
let projectId: string

async function makeUser(email: string, role: string, extra: Record<string, unknown> = {}) {
  return new User({
    email,
    passwordHash: await bcrypt.hash('x', 4),
    name: email.split('@')[0],
    role,
    twoFactorEnabled: true,
    ...extra,
  }).save()
}

function actAs(user: Seeded) {
  authState.user = { id: String(user._id), role: user.role, email: user.email, name: user.name } as Request['user']
}

beforeAll(async () => {
  await setupMongo()
  const { default: adminHome } = await import('../routes/admin/home.js')
  const { default: agentRoutes } = await import('../routes/agent/index.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/home', adminHome)
  app.use('/api/admin/calendar', (await import('../routes/admin/calendar.js')).default)
  app.use('/api/v1/agent', agentRoutes)
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  superAdmin = await makeUser('super@venio.test', 'SUPER_ADMIN')
  viewer = await makeUser('viewer@venio.test', 'VIEWER')
  other = await makeUser('other@venio.test', 'MANAGER')
  client = await makeUser('client@venio.test', 'CLIENT')
  const project = await Project.create({ name: 'Refonte', client: client._id })
  projectId = String(project._id)
  const now = Date.now()

  await Decision.create({
    title: 'Budget refonte',
    description: 'Ajout de 3 200 €',
    priority: 'URGENTE',
    submittedBy: other._id,
    submittedByName: 'Camille',
    deadline: new Date(now - DAY),
  })
  await Decision.create({
    title: 'Déjà traitée',
    description: 'x',
    status: 'APPROVED',
    submittedBy: other._id,
    submittedByName: 'C',
  })

  for (const assignee of [superAdmin, viewer]) {
    await Task.create({
      project: project._id,
      title: `En retard ${assignee.role}`,
      assignee: assignee._id,
      createdBy: other._id,
      status: 'A_FAIRE',
      dueDate: new Date(now - 3 * DAY),
    })
  }
  await Task.create({
    project: project._id,
    title: 'Terminée',
    assignee: superAdmin._id,
    createdBy: other._id,
    status: 'TERMINE',
    dueDate: new Date(now - 3 * DAY),
  })
  await Task.create({
    project: project._id,
    title: 'Plus tard',
    assignee: superAdmin._id,
    createdBy: other._id,
    dueDate: new Date(now + 5 * DAY),
  })
  await PersonalTask.create({ userId: superAdmin._id, title: 'Bilan Qualiopi', dueDate: new Date(now - 2 * DAY) })

  await InternalTicket.create({
    title: 'Paiement indisponible',
    message: 'x',
    priority: 'URGENTE',
    status: 'OUVERT',
    authorId: other._id,
    authorName: 'Théo',
    createdAt: new Date(now - 6 * 3_600_000),
  })
  await InternalTicket.create({ title: 'Mon ticket', message: 'x', authorId: viewer._id, authorName: 'Viewer' })
  await InternalTicket.create({ title: 'Résolu', message: 'x', status: 'RESOLU', authorId: other._id, authorName: 'T' })

  await ChangeRequest.create({
    client: client._id,
    project: project._id,
    title: 'Module de rendez-vous',
    description: 'x',
    createdBy: client._id,
    createdByName: 'Client',
  })

  await Lead.create({
    company: 'Atelier Lumen',
    nextActionAt: new Date(now - DAY),
    nextActionLabel: 'Relancer le devis',
    assignedTo: superAdmin._id,
  })
  await Lead.create({ company: 'Ailleurs', nextActionAt: new Date(now - DAY), assignedTo: other._id })
  await Lead.create({ company: 'Gagné', status: 'WON', nextActionAt: new Date(now - DAY), assignedTo: superAdmin._id })

  const devProject = new mongoose.Types.ObjectId()
  await DevIssue.create({
    project: devProject,
    number: 1,
    identifier: 'VEN-1',
    title: 'Webhook idempotent',
    status: 'IN_REVIEW',
    reporter: other._id,
    assignee: other._id,
  })
  await DevIssue.create({
    project: devProject,
    number: 2,
    identifier: 'VEN-2',
    title: 'Ma propre PR',
    status: 'IN_REVIEW',
    reporter: superAdmin._id,
    assignee: superAdmin._id,
  })
  await DevIssue.create({
    project: devProject,
    number: 3,
    identifier: 'VEN-3',
    title: 'Pas en revue',
    status: 'TODO',
    reporter: other._id,
  })
})

describe('scoreQueueItem', () => {
  const now = new Date('2026-11-01T10:00:00')
  it('classe le retard au-dessus d’une échéance future, et une priorité urgente au-dessus d’une normale', () => {
    const late = scoreQueueItem({
      kind: 'task',
      priority: 'NORMAL',
      dueAt: new Date('2026-10-29'),
      slaDueAt: null,
      now,
    })
    const soon = scoreQueueItem({
      kind: 'task',
      priority: 'NORMAL',
      dueAt: new Date('2026-11-02'),
      slaDueAt: null,
      now,
    })
    const later = scoreQueueItem({
      kind: 'task',
      priority: 'NORMAL',
      dueAt: new Date('2026-11-20'),
      slaDueAt: null,
      now,
    })
    expect(late).toBeGreaterThan(soon)
    expect(soon).toBeGreaterThan(later)
    expect(scoreQueueItem({ kind: 'decision', priority: 'URGENT', dueAt: null, slaDueAt: null, now })).toBeGreaterThan(
      scoreQueueItem({ kind: 'decision', priority: 'NORMAL', dueAt: null, slaDueAt: null, now }),
    )
  })

  it('ajoute le SLA dépassé et reste borné à 100', () => {
    const breached = scoreQueueItem({
      kind: 'ticket',
      priority: 'URGENT',
      dueAt: null,
      slaDueAt: new Date('2026-11-01T09:00:00'),
      now,
    })
    const fresh = scoreQueueItem({
      kind: 'ticket',
      priority: 'URGENT',
      dueAt: null,
      slaDueAt: new Date('2026-11-02T09:00:00'),
      now,
    })
    expect(breached).toBeGreaterThan(fresh)
    expect(
      scoreQueueItem({
        kind: 'decision',
        priority: 'URGENT',
        dueAt: new Date('2026-01-01'),
        slaDueAt: new Date('2026-01-01'),
        now,
      }),
    ).toBe(100)
  })

  it('borne la limite demandée', () => {
    expect(clampQueueLimit(undefined)).toBe(DEFAULT_QUEUE_LIMIT)
    expect(clampQueueLimit('abc')).toBe(DEFAULT_QUEUE_LIMIT)
    expect(clampQueueLimit('5')).toBe(5)
    expect(clampQueueLimit(10_000)).toBe(MAX_QUEUE_LIMIT)
  })
})

describe('GET /api/admin/home/queue', () => {
  it('refuse sans session', async () => {
    authState.user = null
    await request(app).get('/api/admin/home/queue').expect(401)
  })

  it('agrège toutes les sources pour un super-admin, triées par urgence', async () => {
    actAs(superAdmin)
    const res = await request(app).get('/api/admin/home/queue').expect(200)
    const titles = res.body.items.map((i: { title: string }) => i.title)

    expect(res.body.kinds).toEqual(['decision', 'task', 'ticket', 'request', 'crm', 'dev'])
    expect(titles).toEqual(
      expect.arrayContaining([
        'Budget refonte',
        'En retard SUPER_ADMIN',
        'Bilan Qualiopi',
        'Paiement indisponible',
        'Mon ticket',
        'Module de rendez-vous',
        'Relancer le devis',
        'Webhook idempotent',
      ]),
    )
    for (const hidden of [
      'Déjà traitée',
      'En retard VIEWER',
      'Terminée',
      'Plus tard',
      'Résolu',
      'Ailleurs',
      'Gagné',
      'Ma propre PR',
      'Pas en revue',
    ]) {
      expect(titles).not.toContain(hidden)
    }

    const scores = res.body.items.map((i: { score: number }) => i.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
    expect(res.body.counts).toMatchObject({ all: 8, decision: 1, task: 2, ticket: 2, request: 1, crm: 1, dev: 1 })

    const decision = res.body.items.find((i: { kind: string }) => i.kind === 'decision')
    expect(decision).toMatchObject({ priority: 'URGENT', overdue: true, actions: ['approve', 'improve', 'reject'] })

    const ticket = res.body.items.find((i: { title: string }) => i.title === 'Paiement indisponible')
    expect(ticket.overdue).toBe(true)
    expect(ticket.slaDueAt).toBeTruthy()

    const task = res.body.items.find((i: { title: string }) => i.title === 'En retard SUPER_ADMIN')
    expect(task).toMatchObject({
      overdue: true,
      actions: ['complete', 'postpone', 'open'],
      link: `/admin/projets/${projectId}`,
    })
    expect(task.meta).toMatchObject({ source: 'PROJECT', projectId })

    const personal = res.body.items.find((i: { title: string }) => i.title === 'Bilan Qualiopi')
    expect(personal).toMatchObject({ actions: ['complete', 'postpone'], meta: { source: 'PERSONAL' } })
    expect(res.body.overdue).toBeGreaterThanOrEqual(4)
  })

  it('applique les permissions d’origine pour un rôle limité', async () => {
    actAs(viewer)
    const res = await request(app).get('/api/admin/home/queue').expect(200)
    // VIEWER : ni décisions (super-admin), ni CRM (pas de view_crm).
    expect(res.body.kinds).toEqual(['task', 'ticket', 'request', 'dev'])
    const titles = res.body.items.map((i: { title: string }) => i.title)
    expect(titles).toContain('En retard VIEWER')
    expect(titles).not.toContain('En retard SUPER_ADMIN')
    // Tickets : seulement les siens, comme GET /api/admin/tickets.
    expect(titles).toContain('Mon ticket')
    expect(titles).not.toContain('Paiement indisponible')
    // Sans manage_tasks, le PATCH ne modifierait que la progression : pas d'action inline.
    const task = res.body.items.find((i: { title: string }) => i.title === 'En retard VIEWER')
    expect(task.actions).toEqual(['open'])
  })

  it('retire une source dont la permission est refusée', async () => {
    await User.updateOne({ _id: viewer._id }, { deniedPermissions: ['view_dev', 'view_tickets'] })
    actAs(viewer)
    const res = await request(app).get('/api/admin/home/queue').expect(200)
    expect(res.body.kinds).toEqual(['task', 'request'])
    expect(res.body.counts.dev).toBe(0)
  })

  it('respecte la limite sans fausser les compteurs', async () => {
    actAs(superAdmin)
    const res = await request(app).get('/api/admin/home/queue?limit=2').expect(200)
    expect(res.body.items).toHaveLength(2)
    expect(res.body.counts.all).toBe(8)
  })
})

describe('GET /api/v1/agent/home/queue', () => {
  it('exige au moins un scope de lecture couvrant une source', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:billing'])
    const res = await request(app).get('/api/v1/agent/home/queue').set(authHeaders(plainSecret)).expect(403)
    expect(res.body.code).toBe('INSUFFICIENT_SCOPE')
    expect(res.body.details.required).toEqual(['read:tasks', 'read:tickets', 'read:projects', 'read:crm', 'read:dev'])
  })

  it('filtre les sources par scopes accordés, en vue globale et sans actions', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:tasks', 'read:crm'])
    const res = await request(app).get('/api/v1/agent/home/queue').set(authHeaders(plainSecret)).expect(200)
    expect(res.body.kinds).toEqual(['task', 'crm'])
    const titles = res.body.items.map((i: { title: string }) => i.title)
    // Vue globale : toutes les tâches projet en retard, aucune tâche perso.
    expect(titles).toEqual(
      expect.arrayContaining(['En retard SUPER_ADMIN', 'En retard VIEWER', 'Relancer le devis', 'Ailleurs']),
    )
    expect(titles).not.toContain('Bilan Qualiopi')
    expect(titles).not.toContain('Budget refonte')
    expect(res.body.items.every((i: { actions: string[] }) => i.actions.length === 0)).toBe(true)
  })

  it('n’ouvre les décisions qu’au super-scope admin:*', async () => {
    const { plainSecret } = await createAgentTokenInDb(['admin:*'])
    const res = await request(app).get('/api/v1/agent/home/queue').set(authHeaders(plainSecret)).expect(200)
    expect(res.body.kinds).toContain('decision')
    expect(res.body.counts.decision).toBe(1)
  })
})

describe('GET /api/admin/calendar/events — décisions à échéance', () => {
  it('ajoute les décisions en attente dont l’échéance est dans la plage, sans projet', async () => {
    actAs(viewer)
    const start = new Date(Date.now() - 10 * DAY).toISOString().slice(0, 10)
    const end = new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10)
    const res = await request(app).get(`/api/admin/calendar/events?start=${start}&end=${end}`).expect(200)
    const decisions = res.body.events.filter((e: { type: string }) => e.type === 'decision')
    expect(decisions).toHaveLength(1)
    expect(decisions[0]).toMatchObject({ title: 'Budget refonte', projectId: null, metadata: { priority: 'URGENTE' } })
  })
})
