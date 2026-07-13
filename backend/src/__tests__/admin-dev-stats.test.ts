import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

vi.mock('../middleware/auth.js', () => ({
  default: (_req: Request, _res: Response, next: NextFunction) => next(),
}))
vi.mock('../middleware/role.js', () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

let app: Express
let systemUserId: mongoose.Types.ObjectId

beforeAll(async () => {
  await setupMongo()
  const { default: devRoutes } = await import('../routes/admin/dev/index.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/dev', devRoutes)
})
afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  const { default: User } = await import('../models/User.js')
  const u = await User.create({
    email: 'sys@test.local',
    name: 'Sys',
    role: 'SUPER_ADMIN',
    passwordHash: 'x',
  })
  systemUserId = u._id as mongoose.Types.ObjectId
})

describe('GET /api/admin/dev/stats', () => {
  it('returns the documented shape with new fields', async () => {
    const res = await request(app).get('/api/admin/dev/stats').expect(200)
    expect(res.body).toMatchObject({
      total: 0,
      open: 0,
      completedRecent: 0,
      completed7d: 0,
      completed14d: 0,
      urgent: 0,
      blocked: 0,
      totalProjects: 0,
      velocity14d: 0,
    })
    expect(res.body.byStatus).toBeDefined()
    expect(res.body.byPriority).toBeDefined()
  })
})

describe('GET /api/admin/dev/overview', () => {
  it('returns kpis and projects (empty when no project)', async () => {
    const res = await request(app).get('/api/admin/dev/overview').expect(200)
    expect(res.body.kpis).toMatchObject({ totalProjects: 0, activeProjects: 0 })
    expect(res.body.projects).toEqual([])
  })

  it('returns a project entry with counts and progress', async () => {
    const { default: DevProject } = await import('../models/DevProject.js')
    const { default: DevIssue } = await import('../models/DevIssue.js')
    const p = await DevProject.create({ key: 'VEN', name: 'Venio', createdBy: systemUserId })
    await DevIssue.create({
      project: p._id,
      identifier: 'VEN-1',
      title: 'T',
      number: 1,
      status: 'DONE',
      priority: 'MEDIUM',
      type: 'TASK',
      reporter: systemUserId,
    })
    const res = await request(app).get('/api/admin/dev/overview').expect(200)
    expect(res.body.projects).toHaveLength(1)
    expect(res.body.projects[0]).toMatchObject({
      key: 'VEN',
      progress: 100,
      health: 'on_track',
    })
    expect(res.body.projects[0].counts).toMatchObject({ total: 1, done: 1, open: 0 })
  })
})

describe('GET /api/admin/dev/priorities', () => {
  it('orders actionable P0 signals and gives every active project a next action or a healthy state', async () => {
    const { default: DevProject } = await import('../models/DevProject.js')
    const { default: DevIssue } = await import('../models/DevIssue.js')
    const active = await DevProject.create({ key: 'VEN', name: 'Venio', createdBy: systemUserId })
    const healthy = await DevProject.create({ key: 'OPS', name: 'Ops', createdBy: systemUserId })
    const routine = await DevProject.create({ key: 'RUN', name: 'Run', createdBy: systemUserId })
    const paused = await DevProject.create({
      key: 'OLD',
      name: 'Ancien',
      status: 'PAUSED',
      createdBy: systemUserId,
    })

    await DevIssue.create({
      project: active._id,
      identifier: 'VEN-1',
      title: 'Build rouge',
      number: 1,
      status: 'TODO',
      priority: 'HIGH',
      type: 'CI',
      reporter: systemUserId,
      github: { prNumber: 42, prUrl: 'https://github.com/acme/venio/pull/42', ciStatus: 'FAILURE' },
    })
    await DevIssue.create({
      project: active._id,
      identifier: 'VEN-2',
      title: 'À débloquer',
      number: 2,
      status: 'BLOCKED',
      priority: 'URGENT',
      type: 'BUG',
      reporter: systemUserId,
    })
    const stale = await DevIssue.create({
      project: active._id,
      identifier: 'VEN-3',
      title: 'Vieille tâche',
      number: 3,
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      type: 'TASK',
      reporter: systemUserId,
    })
    await DevIssue.updateOne(
      { _id: stale._id },
      { $set: { updatedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) } },
      { timestamps: false },
    )
    await DevIssue.create({
      project: paused._id,
      identifier: 'OLD-1',
      title: 'CI paused',
      number: 1,
      status: 'TODO',
      priority: 'URGENT',
      type: 'CI',
      reporter: systemUserId,
      github: { prNumber: 7, prUrl: 'https://github.com/acme/old/pull/7', ciStatus: 'FAILURE' },
    })
    await DevIssue.create({
      project: routine._id,
      identifier: 'RUN-1',
      title: 'Routine',
      number: 1,
      status: 'TODO',
      priority: 'MEDIUM',
      type: 'TASK',
      reporter: systemUserId,
    })

    const res = await request(app).get('/api/admin/dev/priorities').expect(200)

    expect(res.body.items.map((item: { kind: string }) => item.kind)).toEqual(
      expect.arrayContaining(['build_failure', 'blocker', 'stale']),
    )
    expect(res.body.items[0]).toMatchObject({
      kind: 'build_failure',
      severity: 'critical',
      project: { key: 'VEN' },
      action: { href: 'https://github.com/acme/venio/pull/42' },
      source: { type: 'ci' },
    })
    expect(res.body.items.some((item: { project: { key: string } }) => item.project.key === 'OLD')).toBe(false)
    expect(res.body.staleAfterDays).toBe(14)

    const activeState = res.body.projects.find((state: { project: { key: string } }) => state.project.key === 'VEN')
    const healthyState = res.body.projects.find((state: { project: { key: string } }) => state.project.key === 'OPS')
    const routineState = res.body.projects.find((state: { project: { key: string } }) => state.project.key === 'RUN')
    expect(activeState).toMatchObject({ state: 'attention', nextAction: { kind: 'build_failure' } })
    expect(healthyState).toMatchObject({ state: 'healthy', nextAction: null })
    expect(routineState).toMatchObject({ state: 'attention', nextAction: { issue: { identifier: 'RUN-1' } } })
  })
})

describe('GET /api/admin/dev/projects/:id/dashboard', () => {
  it('returns 400 on invalid id', async () => {
    await request(app).get('/api/admin/dev/projects/not-an-id/dashboard').expect(400)
  })

  it('returns 404 on unknown id', async () => {
    const ghost = new mongoose.Types.ObjectId().toString()
    await request(app).get(`/api/admin/dev/projects/${ghost}/dashboard`).expect(404)
  })

  it('returns the cockpit payload shape with charts', async () => {
    const { default: DevProject } = await import('../models/DevProject.js')
    const { default: DevIssue } = await import('../models/DevIssue.js')
    const p = await DevProject.create({ key: 'VEN', name: 'Venio', createdBy: systemUserId })
    await DevIssue.create({
      project: p._id,
      identifier: 'VEN-1',
      title: 'A',
      number: 1,
      status: 'IN_PROGRESS',
      priority: 'URGENT',
      type: 'BUG',
      reporter: systemUserId,
    })
    await DevIssue.create({
      project: p._id,
      identifier: 'VEN-2',
      title: 'B',
      number: 2,
      status: 'DONE',
      priority: 'MEDIUM',
      type: 'FEATURE',
      reporter: systemUserId,
      completedAt: new Date(),
    })
    const res = await request(app).get(`/api/admin/dev/projects/${p._id}/dashboard`).expect(200)
    expect(res.body.project.key).toBe('VEN')
    expect(res.body.counts.total).toBe(2)
    expect(res.body.counts.urgent).toBe(1)
    expect(res.body.byStatus.IN_PROGRESS).toBe(1)
    expect(res.body.byPriority.URGENT).toBe(1)
    expect(res.body.byType.BUG).toBe(1)
    expect(res.body.velocity.days).toHaveLength(14)
    expect(res.body.urgent).toHaveLength(1)
  })
})
