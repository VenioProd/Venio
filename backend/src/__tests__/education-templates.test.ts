import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

/**
 * VENIO-29 — Templates pédagogiques.
 *
 * On vérifie : kind enum, ownership, CRUD soft-delete (delete masque l'élément),
 * et que les notes peuvent porter des liens (VENIO-31 backlinks côté API).
 */

const OWNER_ID = new mongoose.Types.ObjectId().toString()
const OTHER_ID = new mongoose.Types.ObjectId().toString()

let currentUserId = OWNER_ID

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: currentUserId, role: 'SUPER_ADMIN' } as Request['user']
    next()
  },
}))
vi.mock('../middleware/role.js', () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  requireAnyPermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

let app: Express

beforeAll(async () => {
  await setupMongo()
  const { default: educationRoutes } = await import('../routes/admin/education/index.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/education', educationRoutes)
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  currentUserId = OWNER_ID
})

describe('education templates', () => {
  it('CRUD: create / list / update / soft-delete', async () => {
    const created = await request(app)
      .post('/api/admin/education/templates')
      .send({
        kind: 'note',
        name: 'Brief de séance',
        description: 'Squelette de brief 2h',
        body: { blocks: [{ id: 'a', type: 'heading', text: 'Objectifs', level: 2 }] },
        tags: ['brief', 'cours'],
      })
      .expect(201)
    expect(created.body.template._id).toBeDefined()
    expect(created.body.template.kind).toBe('note')
    expect(created.body.template.tags).toEqual(['brief', 'cours'])

    const list = await request(app).get('/api/admin/education/templates').expect(200)
    expect(list.body.total).toBe(1)

    const id = created.body.template._id
    const updated = await request(app)
      .patch(`/api/admin/education/templates/${id}`)
      .send({ name: 'Brief 2h V2', description: 'V2', tags: ['brief'] })
      .expect(200)
    expect(updated.body.template.name).toBe('Brief 2h V2')

    await request(app).delete(`/api/admin/education/templates/${id}`).expect(200)
    const afterDelete = await request(app).get('/api/admin/education/templates').expect(200)
    expect(afterDelete.body.total).toBe(0)
  })

  it('rejette un kind invalide à la création', async () => {
    const res = await request(app)
      .post('/api/admin/education/templates')
      .send({ kind: 'oops', name: 'X' })
      .expect(400)
    expect(res.body.error).toMatch(/kind/i)
  })

  it('rejette un nom vide', async () => {
    const res = await request(app)
      .post('/api/admin/education/templates')
      .send({ kind: 'session', name: '   ' })
      .expect(400)
    expect(res.body.error).toMatch(/name/i)
  })

  it('filtre par kind', async () => {
    await request(app).post('/api/admin/education/templates').send({ kind: 'note', name: 'A', body: {} }).expect(201)
    await request(app).post('/api/admin/education/templates').send({ kind: 'session', name: 'B', body: {} }).expect(201)
    await request(app).post('/api/admin/education/templates').send({ kind: 'assignment', name: 'C', body: {} }).expect(201)

    const noteOnly = await request(app).get('/api/admin/education/templates?kind=note').expect(200)
    expect(noteOnly.body.total).toBe(1)
    expect(noteOnly.body.templates[0].name).toBe('A')

    const sessionOnly = await request(app).get('/api/admin/education/templates?kind=session').expect(200)
    expect(sessionOnly.body.total).toBe(1)
  })

  it('isole les templates par owner', async () => {
    currentUserId = OWNER_ID
    await request(app)
      .post('/api/admin/education/templates')
      .send({ kind: 'note', name: 'Mine', body: {} })
      .expect(201)

    currentUserId = OTHER_ID
    const otherList = await request(app).get('/api/admin/education/templates').expect(200)
    expect(otherList.body.total).toBe(0)

    currentUserId = OWNER_ID
    const myList = await request(app).get('/api/admin/education/templates').expect(200)
    expect(myList.body.total).toBe(1)
  })
})

describe('education notes — backlinks (VENIO-31)', () => {
  it('liste des notes filtrées par linkType + linkId', async () => {
    const { body: classBody } = await request(app)
      .post('/api/admin/education/classes')
      .send({ name: 'BTS Comm' })
      .expect(201)
    const classId: string = classBody.class._id

    // 2 notes liées à la classe, 1 autre orpheline.
    await request(app)
      .post('/api/admin/education/notes')
      .send({ title: 'Plan cours', blocks: [], links: [{ type: 'class', refId: classId }] })
      .expect(201)
    await request(app)
      .post('/api/admin/education/notes')
      .send({ title: 'Idées atelier', blocks: [], links: [{ type: 'class', refId: classId }] })
      .expect(201)
    await request(app)
      .post('/api/admin/education/notes')
      .send({ title: 'Note libre', blocks: [] })
      .expect(201)

    const linked = await request(app)
      .get(`/api/admin/education/notes?linkType=class&linkId=${classId}`)
      .expect(200)
    expect(linked.body.total).toBe(2)
    expect(linked.body.notes.map((n: { title: string }) => n.title)).toEqual(
      expect.arrayContaining(['Plan cours', 'Idées atelier'])
    )

    const allNotes = await request(app).get('/api/admin/education/notes').expect(200)
    expect(allNotes.body.total).toBe(3)
  })

  it('rejette un linkId invalide silencieusement (ne crash pas)', async () => {
    const r = await request(app)
      .get('/api/admin/education/notes?linkType=class&linkId=not-an-id')
      .expect(200)
    expect(r.body.total).toBe(0)
  })
})
