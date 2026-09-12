import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

const OWNER_ID = new mongoose.Types.ObjectId().toString()

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: OWNER_ID, role: 'SUPER_ADMIN' } as Request['user']
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
  delete process.env.NOTION_API_TOKEN
})

describe('education / notion route', () => {
  it('GET /logs returns an empty list when no import has run', async () => {
    const r = await request(app).get('/api/admin/education/notion/logs').expect(200)
    expect(r.body.logs).toEqual([])
    expect(r.body.total).toBe(0)
  })

  it('POST /preview returns 503 when NOTION_API_TOKEN is missing', async () => {
    const r = await request(app)
      .post('/api/admin/education/notion/preview')
      .send({ pageIdOrUrl: 'https://www.notion.so/p-1234abcd5678ef901234abcd5678ef90' })
      .expect(503)
    expect(r.body.error).toMatch(/NOTION_API_TOKEN/)
  })

  it('POST /import rejects an invalid Notion id', async () => {
    process.env.NOTION_API_TOKEN = 'tok_test'
    const r = await request(app)
      .post('/api/admin/education/notion/import')
      .send({ pageIdOrUrl: 'not-an-id' })
      .expect(400)
    expect(r.body.error).toMatch(/invalide/i)
  })

  it('POST /preview rejects missing pageIdOrUrl and databaseIdOrUrl', async () => {
    process.env.NOTION_API_TOKEN = 'tok_test'
    const r = await request(app).post('/api/admin/education/notion/preview').send({}).expect(400)
    expect(r.body.error).toMatch(/requis/i)
  })

  it('POST /preview rejects database import without classId', async () => {
    process.env.NOTION_API_TOKEN = 'tok_test'
    const r = await request(app)
      .post('/api/admin/education/notion/preview')
      .send({ databaseIdOrUrl: '1234abcd5678ef901234abcd5678ef90' })
      .expect(400)
    expect(r.body.error).toMatch(/classId/i)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.NOTION_API_TOKEN
})
it('previews without writes then updates the same imported note on a second import', async () => {
  process.env.NOTION_API_TOKEN = 'test-only'
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('/children')
              ? {
                  results: [
                    { id: 'block-1', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Cours importé' }] } },
                  ],
                  has_more: false,
                }
              : {
                  id: '1234abcd-5678-ef90-1234-abcd5678ef90',
                  properties: { title: { type: 'title', title: [{ plain_text: 'Cours Notion' }] } },
                },
          ),
          { status: 200 },
        ),
    ),
  )
  const body = { pageIdOrUrl: '1234abcd5678ef901234abcd5678ef90' }
  const { default: EducationNote } = await import('../models/education/EducationNote.js')
  await request(app).post('/api/admin/education/notion/preview').send(body).expect(200)
  expect(await EducationNote.countDocuments()).toBe(0)
  const first = await request(app).post('/api/admin/education/notion/import').send(body).expect(200)
  expect(first.body.log.stats.created).toBe(1)
  const second = await request(app).post('/api/admin/education/notion/import').send(body).expect(200)
  expect(second.body.log.stats.updated).toBe(1)
  expect(await EducationNote.countDocuments()).toBe(1)
  expect((await EducationNote.findOne())?.blocks[0].text).toBe('Cours importé')
})
