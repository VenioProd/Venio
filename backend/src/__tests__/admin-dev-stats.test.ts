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
afterAll(async () => { await teardownMongo() })

beforeEach(async () => {
  await clearDb()
  const { default: User } = await import('../models/User.js')
  const u = await User.create({
    email: 'sys@test.local', name: 'Sys', role: 'SUPER_ADMIN', passwordHash: 'x',
  })
  systemUserId = u._id as mongoose.Types.ObjectId
})

describe('GET /api/admin/dev/stats', () => {
  it('returns the documented shape with new fields', async () => {
    const res = await request(app).get('/api/admin/dev/stats').expect(200)
    expect(res.body).toMatchObject({
      total: 0, open: 0, completedRecent: 0, completed7d: 0, completed14d: 0,
      urgent: 0, blocked: 0, totalProjects: 0, velocity14d: 0,
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
      project: p._id, identifier: 'VEN-1', title: 'T', number: 1,
      status: 'DONE', priority: 'MEDIUM', type: 'TASK', reporter: systemUserId,
    })
    const res = await request(app).get('/api/admin/dev/overview').expect(200)
    expect(res.body.projects).toHaveLength(1)
    expect(res.body.projects[0]).toMatchObject({
      key: 'VEN', progress: 100, health: 'on_track',
    })
    expect(res.body.projects[0].counts).toMatchObject({ total: 1, done: 1, open: 0 })
  })
})
