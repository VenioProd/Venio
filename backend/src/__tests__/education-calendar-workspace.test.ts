import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

/**
 * VENIO-44 — Workspace persistant pour événement Apple Calendar.
 *
 * On vérifie que :
 *   - GET sur un occurrenceId inconnu renvoie un workspace vide stable
 *     (et flag exists=false) sans 404 ;
 *   - PUT crée puis met à jour la fiche idempotemment par (owner, occurrenceId) ;
 *   - les entrées vides sont silencieusement filtrées (cohérence avec les
 *     séances internes — VENIO-43) ;
 *   - les workspaces de deux owners différents ne se croisent jamais ;
 *   - l'événement Apple lui-même n'est jamais altéré (on touche uniquement
 *     un document Mongo séparé indexé par occurrenceId).
 */

const OWNER_ID = new mongoose.Types.ObjectId().toString()
const OTHER_OWNER_ID = new mongoose.Types.ObjectId().toString()
let currentOwner = OWNER_ID

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: currentOwner, role: 'SUPER_ADMIN' } as Request['user']
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
  currentOwner = OWNER_ID
})

const OCCURRENCE = 'apple-uid-001@2026-05-21T14:00:00.000Z'

describe('VENIO-44 — workspace événement calendrier', () => {
  it('renvoie un workspace vide stable pour un occurrenceId inconnu', async () => {
    const r = await request(app)
      .get('/api/admin/education/calendar/workspace')
      .query({ occurrenceId: OCCURRENCE })
      .expect(200)
    expect(r.body.exists).toBe(false)
    expect(r.body.workspace.occurrenceId).toBe(OCCURRENCE)
    expect(r.body.workspace.notes).toBe('')
    expect(r.body.workspace.remarks).toEqual([])
    expect(r.body.workspace.links).toEqual([])
    expect(r.body.workspace.reminders).toEqual([])
    expect(r.body.workspace.duties).toEqual([])
  })

  it('rejette une requête sans occurrenceId', async () => {
    await request(app)
      .get('/api/admin/education/calendar/workspace')
      .expect(400)
    await request(app)
      .put('/api/admin/education/calendar/workspace')
      .send({ notes: 'sans id' })
      .expect(400)
  })

  it('PUT crée la fiche puis re-PUT met à jour idempotemment', async () => {
    const first = await request(app)
      .put('/api/admin/education/calendar/workspace')
      .send({
        occurrenceId: OCCURRENCE,
        uid: 'apple-uid-001',
        title: 'Cours EMA — Marketing',
        start: '2026-05-21T14:00:00.000Z',
        source: 'Apple Calendar',
        notes: 'À retenir : 12 étudiants présents.',
        duties: [
          { label: 'Préparer le quiz' },
          { label: '   ' }, // ignoré
        ],
        links: [{ label: 'Slides', url: 'https://example.com/slides' }],
      })
      .expect(200)
    expect(first.body.exists).toBe(true)
    expect(first.body.workspace.occurrenceId).toBe(OCCURRENCE)
    expect(first.body.workspace.title).toBe('Cours EMA — Marketing')
    expect(first.body.workspace.duties).toHaveLength(1)
    expect(first.body.workspace.duties[0].id).toBeTruthy()
    expect(first.body.workspace.links).toHaveLength(1)
    const dutyId = first.body.workspace.duties[0].id

    const second = await request(app)
      .put('/api/admin/education/calendar/workspace')
      .send({
        occurrenceId: OCCURRENCE,
        uid: 'apple-uid-001',
        title: 'Cours EMA — Marketing',
        start: '2026-05-21T14:00:00.000Z',
        duties: [{ id: dutyId, label: 'Préparer le quiz', done: true }],
      })
      .expect(200)
    expect(second.body.workspace.duties).toHaveLength(1)
    expect(second.body.workspace.duties[0].id).toBe(dutyId)
    expect(second.body.workspace.duties[0].done).toBe(true)
    // Le doc Mongo ne doit pas être dupliqué.
    expect(second.body.workspace._id).toBe(first.body.workspace._id)

    // Un GET ramène bien la fiche persistée.
    const fetched = await request(app)
      .get('/api/admin/education/calendar/workspace')
      .query({ occurrenceId: OCCURRENCE })
      .expect(200)
    expect(fetched.body.exists).toBe(true)
    expect(fetched.body.workspace.duties[0].done).toBe(true)
    expect(fetched.body.workspace.notes).toContain('12 étudiants')
  })

  it('rattache la fiche à une EducationClass quand classId est fourni', async () => {
    const klass = await request(app)
      .post('/api/admin/education/classes')
      .send({ name: 'EMA B3 Marketing' })
      .expect(201)
    const r = await request(app)
      .put('/api/admin/education/calendar/workspace')
      .send({
        occurrenceId: OCCURRENCE,
        uid: 'apple-uid-002',
        title: 'Cours EMA',
        classId: klass.body.class._id,
      })
      .expect(200)
    expect(r.body.workspace.classId).toBe(klass.body.class._id)
  })

  it('isole les workspaces entre owners', async () => {
    await request(app)
      .put('/api/admin/education/calendar/workspace')
      .send({ occurrenceId: OCCURRENCE, uid: 'u', notes: 'privé Raphael' })
      .expect(200)
    currentOwner = OTHER_OWNER_ID
    const r = await request(app)
      .get('/api/admin/education/calendar/workspace')
      .query({ occurrenceId: OCCURRENCE })
      .expect(200)
    expect(r.body.exists).toBe(false)
    expect(r.body.workspace.notes).toBe('')
  })

  it('persiste les remarques avec id stable et filtre les entrées vides', async () => {
    const r = await request(app)
      .put('/api/admin/education/calendar/workspace')
      .send({
        occurrenceId: OCCURRENCE,
        uid: 'u',
        remarks: [
          { text: 'Penser à demander les retours après la séance' },
          { text: '' }, // ignoré
        ],
        reminders: [
          { label: 'Apporter le rétroprojecteur', dueAt: '2026-06-01T08:00:00.000Z' },
        ],
      })
      .expect(200)
    expect(r.body.workspace.remarks).toHaveLength(1)
    expect(r.body.workspace.remarks[0].id).toBeTruthy()
    expect(r.body.workspace.reminders).toHaveLength(1)
    expect(r.body.workspace.reminders[0].dueAt).toBe('2026-06-01T08:00:00.000Z')
  })
})
