import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { invalidateRecommendationsCache } from '../lib/dev/recommendations.js'

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
  invalidateRecommendationsCache()
  const { default: User } = await import('../models/User.js')
  const u = await User.create({
    email: 'sys@test.local', name: 'Sys', role: 'SUPER_ADMIN', passwordHash: 'x',
  })
  systemUserId = u._id as mongoose.Types.ObjectId
})

async function makeProject(key = 'REC') {
  const { default: DevProject } = await import('../models/DevProject.js')
  return DevProject.create({ key, name: 'Reco Project', createdBy: systemUserId })
}

async function makeIssue(overrides: Record<string, unknown>) {
  const { default: DevIssue } = await import('../models/DevIssue.js')
  const project = overrides.project as mongoose.Types.ObjectId
  const number = (overrides.number as number) ?? Math.floor(Math.random() * 100000) + 1
  return DevIssue.create({
    project,
    number,
    identifier: `${overrides.identifier ?? `REC-${number}`}`,
    title: overrides.title ?? 'Issue de test',
    description: overrides.description ?? '',
    type: overrides.type ?? 'TASK',
    status: overrides.status ?? 'BACKLOG',
    priority: overrides.priority ?? 'MEDIUM',
    reporter: systemUserId,
    labels: overrides.labels ?? [],
    dueDate: overrides.dueDate ?? null,
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    github: overrides.github ?? null,
    ...overrides,
  })
}

describe('GET /api/admin/dev/projects/:id/recommendations', () => {
  it('returns 400 on invalid id', async () => {
    await request(app).get('/api/admin/dev/projects/nope/recommendations').expect(400)
  })

  it('returns 404 on unknown id', async () => {
    const ghost = new mongoose.Types.ObjectId().toString()
    await request(app).get(`/api/admin/dev/projects/${ghost}/recommendations`).expect(404)
  })

  it('returns empty/partial payload with safe defaults for a brand-new project', async () => {
    const p = await makeProject()
    const res = await request(app).get(`/api/admin/dev/projects/${p._id}/recommendations`).expect(200)

    expect(res.body.projectId).toBe(String(p._id))
    expect(typeof res.body.generatedAt).toBe('string')
    expect(typeof res.body.nextRefreshAt).toBe('string')
    expect(res.body.ttlSeconds).toBeGreaterThan(0)
    expect(res.body.fromCache).toBe(false)
    expect(res.body.sections.improve).toEqual([])
    expect(res.body.sections.add).toEqual([])
    expect(res.body.sections.optimize).toEqual([])
    expect(res.body.sections.large_files).toEqual([])
    expect(res.body.counts.total).toBe(0)
    // No source available → partial (with reasons) or empty.
    expect(['empty', 'partial']).toContain(res.body.status)
  })

  it('flags stale IN_PROGRESS issues in the improve section', async () => {
    const p = await makeProject()
    const oldUpdate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const issue = await makeIssue({
      project: p._id,
      identifier: 'REC-101',
      title: 'Refactor cockpit',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      startedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    })
    // Force updatedAt to be in the past — bypass Mongoose timestamps.
    const { default: DevIssue } = await import('../models/DevIssue.js')
    await DevIssue.updateOne({ _id: issue._id }, { $set: { updatedAt: oldUpdate } }, { timestamps: false })

    const res = await request(app).get(`/api/admin/dev/projects/${p._id}/recommendations`).expect(200)
    const improve = res.body.sections.improve
    expect(improve.length).toBeGreaterThan(0)
    const stale = improve.find((i: { id: string }) => i.id.startsWith('issue-stale-'))
    expect(stale).toBeDefined()
    expect(stale.priority === 'high' || stale.priority === 'medium').toBe(true)
    expect(stale.actions[0]?.kind).toBe('open_issue')
    expect(stale.evidence).toMatchObject({ source: expect.stringMatching(/issues/i), observedAt: expect.any(String) })
  })

  it('flags active issues without an owner with an assignment action', async () => {
    const p = await makeProject()
    const issue = await makeIssue({
      project: p._id,
      identifier: 'REC-OWNER',
      title: 'Décider le responsable',
      status: 'TODO',
      priority: 'HIGH',
      assignee: null,
    })

    const res = await request(app).get(`/api/admin/dev/projects/${p._id}/recommendations`).expect(200)
    const unowned = res.body.sections.improve.find((i: { id: string }) => i.id === `issue-unowned-${issue._id}`)
    expect(unowned).toMatchObject({
      source: 'issues',
      actions: [expect.objectContaining({ kind: 'open_issue', issueId: String(issue._id) })],
      evidence: {
        source: expect.stringMatching(/issues/i),
        observedAt: expect.any(String),
        limitation: expect.any(String),
      },
    })
  })

  it('surfaces open FEATURE issues in the add section sorted by priority', async () => {
    const p = await makeProject()
    await makeIssue({ project: p._id, identifier: 'REC-201', title: 'Feature mineure', type: 'FEATURE', priority: 'LOW' })
    await makeIssue({ project: p._id, identifier: 'REC-202', title: 'Feature critique', type: 'FEATURE', priority: 'URGENT' })

    const res = await request(app).get(`/api/admin/dev/projects/${p._id}/recommendations`).expect(200)
    const add = res.body.sections.add
    expect(add.length).toBe(2)
    expect(add[0].priority).toBe('critical')
    expect(add[0].title).toBe('Feature critique')
  })

  it('caches the payload and serves fromCache=true on second call', async () => {
    const p = await makeProject()
    await makeIssue({ project: p._id, identifier: 'REC-301', title: 'A feature', type: 'FEATURE', priority: 'MEDIUM' })

    const a = await request(app).get(`/api/admin/dev/projects/${p._id}/recommendations`).expect(200)
    expect(a.body.fromCache).toBe(false)

    const b = await request(app).get(`/api/admin/dev/projects/${p._id}/recommendations`).expect(200)
    expect(b.body.fromCache).toBe(true)
    expect(b.body.cacheAgeSeconds).toBeGreaterThanOrEqual(0)
    expect(b.body.generatedAt).toBe(a.body.generatedAt)

    const c = await request(app)
      .get(`/api/admin/dev/projects/${p._id}/recommendations?refresh=1`)
      .expect(200)
    expect(c.body.fromCache).toBe(false)
    expect(c.body.generatedAt).not.toBe(a.body.generatedAt)
  })
})
