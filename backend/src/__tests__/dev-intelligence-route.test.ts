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

describe('GET /api/admin/dev/projects/:id/intelligence', () => {
  it('returns 400 on invalid id', async () => {
    await request(app).get('/api/admin/dev/projects/nope/intelligence').expect(400)
  })

  it('returns 404 on unknown id', async () => {
    const ghost = new mongoose.Types.ObjectId().toString()
    await request(app).get(`/api/admin/dev/projects/${ghost}/intelligence`).expect(404)
  })

  it('returns the full intelligence shape with safe defaults', async () => {
    const { default: DevProject } = await import('../models/DevProject.js')
    const p = await DevProject.create({ key: 'VEN', name: 'Venio', createdBy: systemUserId })
    const res = await request(app).get(`/api/admin/dev/projects/${p._id}/intelligence`).expect(200)
    expect(res.body.projectId).toBe(String(p._id))
    expect(res.body.github).toBeDefined()
    expect(res.body.tokens).toBeDefined()
    expect(res.body.code).toBeDefined()
    // Tokens placeholder
    expect(res.body.tokens.available).toBe(false)
    expect(res.body.tokens.totalTokens).toBeNull()
    expect(res.body.tokens.missing).toBeInstanceOf(Array)
    // GitHub unconfigured
    expect(res.body.github.configured).toBe(false)
    // Code metrics unconfigured (no DEV_REPO_ROOT/DEV_DEFAULT_REPO_PATH)
    expect(res.body.code.available).toBe(false)
  })

  it('persists a github config via PATCH and surfaces it on intelligence', async () => {
    const { default: DevProject } = await import('../models/DevProject.js')
    const p = await DevProject.create({ key: 'VEN', name: 'Venio', createdBy: systemUserId })

    await request(app)
      .patch(`/api/admin/dev/projects/${p._id}`)
      .send({
        github: {
          owner: 'venio',
          repo: 'app',
          defaultBranch: 'main',
          htmlUrl: null,
          repoPath: null,
        },
      })
      .expect(200)

    const res = await request(app)
      .get(`/api/admin/dev/projects/${p._id}/intelligence`)
      .expect(200)
    expect(res.body.github.configured).toBe(true)
    expect(res.body.github.owner).toBe('venio')
    expect(res.body.github.links.repoUrl).toBe('https://github.com/venio/app')
  })

  it('rejects path-traversal repoPath on PATCH', async () => {
    const { default: DevProject } = await import('../models/DevProject.js')
    const p = await DevProject.create({ key: 'VEN', name: 'Venio', createdBy: systemUserId })
    const res = await request(app)
      .patch(`/api/admin/dev/projects/${p._id}`)
      .send({ github: { repoPath: '../etc/passwd' } })
      .expect(200)
    // The traversal is sanitized to null — config still applies but the path is dropped.
    expect(res.body.github?.repoPath).toBeNull()
  })
})

describe('GET /api/admin/dev/projects/:id/large-files', () => {
  it('returns the empty/unconfigured payload by default', async () => {
    const { default: DevProject } = await import('../models/DevProject.js')
    const p = await DevProject.create({ key: 'VEN', name: 'Venio', createdBy: systemUserId })
    const res = await request(app).get(`/api/admin/dev/projects/${p._id}/large-files`).expect(200)
    expect(res.body.available).toBe(false)
    expect(res.body.largeFiles).toEqual([])
  })
})
