import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

const TEST_USER_ID = new mongoose.Types.ObjectId().toString()
const OTHER_USER_ID = new mongoose.Types.ObjectId().toString()

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    ;(req as any).user = { id: TEST_USER_ID, role: 'COMMERCIAL' }
    next()
  },
}))
vi.mock('../middleware/role.js', () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  userHasPermission: async () => true,
}))

let app: Express
let WorkspaceNote: typeof import('../models/WorkspaceNote.js').default
let PersonalTask: typeof import('../models/PersonalTask.js').default

beforeAll(async () => {
  await setupMongo()
  const { default: routes } = await import('../routes/admin/workspace.js')
  WorkspaceNote = (await import('../models/WorkspaceNote.js')).default
  PersonalTask = (await import('../models/PersonalTask.js')).default
  app = express()
  app.use(express.json())
  app.use('/api/admin/workspace', routes)
})
afterAll(teardownMongo)
beforeEach(clearDb)

describe('layout', () => {
  it('GET /layout crée et renvoie un layout par défaut', async () => {
    const res = await request(app).get('/api/admin/workspace/layout').expect(200)
    expect(res.body).toHaveProperty('widgets')
    expect(Array.isArray(res.body.widgets)).toBe(true)
  })
  it('PUT /layout persiste les widgets', async () => {
    const widgets = [{ key: 'todo', enabled: true, x: 0, y: 0, w: 6, h: 4 }]
    const res = await request(app).put('/api/admin/workspace/layout').send({ widgets }).expect(200)
    expect(res.body.widgets).toHaveLength(1)
    expect(res.body.widgets[0].key).toBe('todo')
  })
  it('PUT /layout persiste les raccourcis personnels', async () => {
    const shortcuts = [{ label: 'CRM', link: '/admin/crm', icon: 'users' }]
    const res = await request(app).put('/api/admin/workspace/layout').send({ shortcuts }).expect(200)
    expect(res.body.shortcuts).toEqual(shortcuts)
  })
})

describe('tasks', () => {
  it('POST puis GET ne renvoie que mes tâches', async () => {
    await request(app).post('/api/admin/workspace/tasks').send({ title: 'Mienne' }).expect(201)
    await PersonalTask.create({ userId: OTHER_USER_ID, title: 'Autre' })
    const res = await request(app).get('/api/admin/workspace/tasks').expect(200)
    const titles = res.body.map((t: { title: string }) => t.title)
    expect(titles).toContain('Mienne')
    expect(titles).not.toContain('Autre')
  })
  it("PATCH refuse la tâche d'un autre user (404)", async () => {
    const other = await PersonalTask.create({ userId: OTHER_USER_ID, title: 'Autre' })
    await request(app).patch(`/api/admin/workspace/tasks/${other._id}`).send({ status: 'TERMINE' }).expect(404)
  })
})

describe('notes', () => {
  it('CRUD note owner-scopé', async () => {
    const created = await request(app)
      .post('/api/admin/workspace/notes')
      .send({ type: 'NOTE', title: 'N1' })
      .expect(201)
    const id = created.body._id
    await request(app)
      .get('/api/admin/workspace/notes?type=NOTE')
      .expect(200)
      .then((r) => {
        expect(r.body.map((n: { _id: string }) => n._id)).toContain(id)
      })
    await request(app).delete(`/api/admin/workspace/notes/${id}`).expect(200)
  })
  it('convert idée → PersonalTask', async () => {
    const idea = await WorkspaceNote.create({ userId: TEST_USER_ID, type: 'IDEA', title: 'Idée géniale' })
    const res = await request(app).post(`/api/admin/workspace/notes/${idea._id}/convert`).expect(201)
    expect(res.body.title).toBe('Idée géniale')
    const reloaded = await WorkspaceNote.findById(idea._id)
    expect(reloaded?.status).toBe('CONVERTED')
  })
  it("PATCH et DELETE refusent la note d'un autre user (404)", async () => {
    const other = await WorkspaceNote.create({ userId: OTHER_USER_ID, type: 'NOTE', title: 'Autre' })
    await request(app).patch(`/api/admin/workspace/notes/${other._id}`).send({ title: 'X' }).expect(404)
    await request(app).delete(`/api/admin/workspace/notes/${other._id}`).expect(404)
  })
})

describe('overview', () => {
  it('GET /overview renvoie kpis, overdue, week, pinned, activity', async () => {
    const res = await request(app).get('/api/admin/workspace/overview').expect(200)
    expect(res.body).toHaveProperty('kpis')
    expect(res.body).toHaveProperty('overdue')
    expect(res.body).toHaveProperty('week')
    expect(res.body).toHaveProperty('pinned')
    expect(res.body).toHaveProperty('activity')
  })
})
