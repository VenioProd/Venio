import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

/**
 * VENIO-43 — Fiche séance enrichie.
 * On vérifie que les notes/remarques/liens/rappels/devoirs sont persistés
 * et que les entrées vides sont silencieusement ignorées par les helpers.
 */

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
})

async function seedSession() {
  const klass = await request(app)
    .post('/api/admin/education/classes')
    .send({ name: 'Promo X' })
    .expect(201)
  const session = await request(app)
    .post('/api/admin/education/sessions')
    .send({ classId: klass.body.class._id, title: 'S1', date: new Date().toISOString() })
    .expect(201)
  return session.body.session
}

describe('VENIO-43 — fiche séance enrichie', () => {
  it('initialise les collections enrichies à des tableaux vides', async () => {
    const s = await seedSession()
    expect(s.notes).toBe('')
    expect(s.remarks).toEqual([])
    expect(s.links).toEqual([])
    expect(s.reminders).toEqual([])
    expect(s.duties).toEqual([])
  })

  it('persiste un workspace complet via PUT /:id/workspace', async () => {
    const s = await seedSession()
    const r = await request(app)
      .put(`/api/admin/education/sessions/${s._id}/workspace`)
      .send({
        notes: 'À retenir : la cohorte est à 80% sur la pratique.',
        remarks: [
          { text: 'Sasha a besoin d\'un suivi sur le brief' },
          { text: '   ' }, // doit être ignoré
        ],
        links: [
          { label: 'Slides cours 3', url: 'https://example.com/3' },
          { label: '', url: '' }, // doit être ignoré
        ],
        reminders: [
          { label: 'Préparer un cas pratique', done: false, dueAt: '2026-06-10T10:00:00.000Z' },
          { label: '' }, // doit être ignoré
        ],
        duties: [
          { label: 'Lecture chapitre 4 pour la prochaine séance', done: false },
        ],
      })
      .expect(200)

    expect(r.body.session.notes).toContain('cohorte')
    expect(r.body.session.remarks).toHaveLength(1)
    expect(r.body.session.remarks[0].text).toContain('Sasha')
    expect(r.body.session.remarks[0].id).toBeTruthy()
    expect(r.body.session.links).toHaveLength(1)
    expect(r.body.session.reminders).toHaveLength(1)
    expect(r.body.session.duties).toHaveLength(1)
  })

  it('coche un devoir/un rappel en ré-envoyant la collection', async () => {
    const s = await seedSession()
    const initial = await request(app)
      .put(`/api/admin/education/sessions/${s._id}/workspace`)
      .send({ duties: [{ label: 'Recherche docu' }] })
      .expect(200)
    const dutyId = initial.body.session.duties[0].id

    const toggled = await request(app)
      .put(`/api/admin/education/sessions/${s._id}/workspace`)
      .send({ duties: [{ id: dutyId, label: 'Recherche docu', done: true }] })
      .expect(200)
    expect(toggled.body.session.duties[0].id).toBe(dutyId)
    expect(toggled.body.session.duties[0].done).toBe(true)
  })

  it('PATCH /:id accepte aussi les enrichissements (compat alternative)', async () => {
    const s = await seedSession()
    const r = await request(app)
      .patch(`/api/admin/education/sessions/${s._id}`)
      .send({
        notes: 'Plan de séance',
        links: [{ label: 'Vidéo', url: 'https://video.example' }],
      })
      .expect(200)
    expect(r.body.session.notes).toBe('Plan de séance')
    expect(r.body.session.links).toHaveLength(1)
  })

  it('renvoie 404 quand la séance est introuvable', async () => {
    const missing = new mongoose.Types.ObjectId().toString()
    await request(app)
      .put(`/api/admin/education/sessions/${missing}/workspace`)
      .send({ notes: 'tentative' })
      .expect(404)
  })
})
