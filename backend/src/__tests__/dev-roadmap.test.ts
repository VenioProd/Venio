import express, { type Request, type Response, type NextFunction, type Express } from 'express'
import request from 'supertest'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

// On stub l'auth admin pour pouvoir frapper les routes sans JWT.
vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: new mongoose.Types.ObjectId().toString(),
      role: 'SUPER_ADMIN',
      email: 'admin@venio.paris',
      name: 'Admin Test',
    }
    next()
  },
}))

vi.mock('../middleware/role.js', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  requireAnyPermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

async function buildApp(): Promise<Express> {
  const { default: devRoutes } = await import('../routes/admin/dev/index.js')
  const app = express()
  app.use(express.json())
  app.use('/api/admin/dev', devRoutes)
  // expose le message d'erreur pour faciliter le debug en test
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('test-handler-error:', err.message, err.stack)
    res.status(500).json({ error: err.message })
  })
  return app
}

async function seedFixtures() {
  // Pre-register le modele User pour que les populate() de DevProject/DevIssue
  // (.populate('lead'|'assignee')) ne pretendent pas que le schema manque.
  await import('../models/User.js')
  const DevProject = (await import('../models/DevProject.js')).default
  const DevIssue = (await import('../models/DevIssue.js')).default
  const reporter = new mongoose.Types.ObjectId()

  const active = await DevProject.create({
    key: 'ARROW',
    name: 'Arrow SaaS',
    description: 'plateforme pedagogique',
    color: '#7c5cff',
    status: 'ACTIVE',
    createdBy: reporter,
  })
  const archived = await DevProject.create({
    key: 'OLD',
    name: 'Ancien projet',
    color: '#94a3b8',
    status: 'ARCHIVED',
    createdBy: reporter,
  })

  const now = new Date()
  const twoDays = 2 * 24 * 60 * 60 * 1000

  await DevIssue.insertMany([
    {
      project: active._id,
      number: 1,
      identifier: 'ARROW-1',
      title: 'Refactor pricing',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      reporter,
      startedAt: new Date(now.getTime() - twoDays),
    },
    {
      project: active._id,
      number: 2,
      identifier: 'ARROW-2',
      title: 'Schema export',
      status: 'IN_REVIEW',
      priority: 'MEDIUM',
      reporter,
    },
    {
      project: active._id,
      number: 3,
      identifier: 'ARROW-3',
      title: 'Onboarding flow',
      status: 'TODO',
      priority: 'URGENT',
      dueDate: new Date(now.getTime() + twoDays),
      reporter,
    },
    {
      project: active._id,
      number: 4,
      identifier: 'ARROW-4',
      title: 'Notes admin',
      status: 'BACKLOG',
      priority: 'LOW',
      reporter,
    },
    {
      project: active._id,
      number: 5,
      identifier: 'ARROW-5',
      title: 'Bug login mobile',
      status: 'DONE',
      priority: 'HIGH',
      completedAt: new Date(now.getTime() - twoDays),
      reporter,
    },
    {
      project: active._id,
      number: 6,
      identifier: 'ARROW-6',
      title: 'Cancelled spike',
      status: 'CANCELLED',
      priority: 'LOW',
      reporter,
    },
    {
      project: active._id,
      number: 7,
      identifier: 'ARROW-7',
      title: 'Overdue refactor',
      status: 'TODO',
      priority: 'MEDIUM',
      dueDate: new Date(now.getTime() - twoDays),
      reporter,
    },
    {
      project: archived._id,
      number: 1,
      identifier: 'OLD-1',
      title: 'Vestige',
      status: 'DONE',
      priority: 'LOW',
      completedAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
      reporter,
    },
  ])
}

describe('GET /api/admin/dev/roadmap', () => {
  beforeAll(setupMongo)
  afterAll(teardownMongo)
  beforeEach(clearDb)

  it('returns one entry per active project with active/upcoming/recentlyDone buckets', async () => {
    await seedFixtures()
    const app = await buildApp()
    const res = await request(app).get('/api/admin/dev/roadmap')

    expect(res.status).toBe(200)
    expect(res.body.projects).toHaveLength(1) // archived hidden by default
    const arrow = res.body.projects[0]
    expect(arrow.project.key).toBe('ARROW')
    expect(arrow.summary.total).toBe(7)
    expect(arrow.summary.done).toBe(1)
    expect(arrow.summary.cancelled).toBe(1)
    expect(arrow.summary.inProgress).toBe(1)
    expect(arrow.summary.inReview).toBe(1)
    expect(arrow.summary.todo).toBe(2)
    expect(arrow.summary.backlog).toBe(1)
    expect(arrow.summary.open).toBe(5)
    expect(arrow.summary.overdue).toBe(1)
    expect(arrow.summary.progress).toBe(42)
  })

  it('returns IN_PROGRESS issues first in the active bucket', async () => {
    await seedFixtures()
    const app = await buildApp()
    const res = await request(app).get('/api/admin/dev/roadmap')

    const arrow = res.body.projects[0]
    expect(arrow.active).toHaveLength(2)
    expect(arrow.active[0].status).toBe('IN_PROGRESS')
    expect(arrow.active[1].status).toBe('IN_REVIEW')
  })

  it('returns urgent issues first in the upcoming bucket', async () => {
    await seedFixtures()
    const app = await buildApp()
    const res = await request(app).get('/api/admin/dev/roadmap')

    const arrow = res.body.projects[0]
    expect(arrow.upcoming.length).toBeGreaterThan(0)
    expect(arrow.upcoming[0].priority).toBe('URGENT')
  })

  it('includes archived projects when includeArchived=true', async () => {
    await seedFixtures()
    const app = await buildApp()
    const res = await request(app).get('/api/admin/dev/roadmap?includeArchived=true')

    expect(res.status).toBe(200)
    expect(res.body.projects).toHaveLength(2)
    const keys = res.body.projects.map((p: { project: { key: string } }) => p.project.key)
    expect(keys).toContain('OLD')
    expect(keys).toContain('ARROW')
  })

  it('returns an empty list when there are no projects', async () => {
    const app = await buildApp()
    const res = await request(app).get('/api/admin/dev/roadmap')
    expect(res.status).toBe(200)
    expect(res.body.projects).toEqual([])
  })
})
