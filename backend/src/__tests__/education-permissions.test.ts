import { describe, it, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

/**
 * VENIO-27 — Accès Education :
 * l'espace pédagogique contient des données de cours personnelles et reste
 * volontairement réservé au SUPER_ADMIN. Les permissions view/manage ne doivent
 * pas ouvrir cette zone à un rôle interne non super-admin.
 */

const OWNER_ID = new mongoose.Types.ObjectId().toString()

// Mock du modèle User pour le résolveur de permissions (granted/denied).
vi.mock('../models/User.js', () => ({
  default: {
    findById: () => ({
      select: () => Promise.resolve({ grantedPermissions: [], deniedPermissions: [] }),
    }),
  },
}))

// Auth permissive : injecte un user VIEWER.
vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: OWNER_ID, role: 'VIEWER' } as Request['user']
    next()
  },
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

describe('education access — super-admin only', () => {
  it('VIEWER ne peut pas lire le dashboard', async () => {
    await request(app).get('/api/admin/education/dashboard').expect(403)
  })

  it('VIEWER ne peut pas lister les classes', async () => {
    await request(app).get('/api/admin/education/classes').expect(403)
  })

  it('VIEWER ne peut pas créer une classe (POST → 403)', async () => {
    await request(app)
      .post('/api/admin/education/classes')
      .send({ name: 'Refusée' })
      .expect(403)
  })

  it('VIEWER ne peut pas créer un étudiant (POST → 403)', async () => {
    await request(app)
      .post('/api/admin/education/students')
      .send({ classId: new mongoose.Types.ObjectId().toString(), lastName: 'Test' })
      .expect(403)
  })

  it('VIEWER ne peut pas créer une séance (POST → 403)', async () => {
    await request(app)
      .post('/api/admin/education/sessions')
      .send({ classId: new mongoose.Types.ObjectId().toString(), title: 'X', date: new Date().toISOString() })
      .expect(403)
  })

  it('VIEWER ne peut pas créer un devoir (POST → 403)', async () => {
    await request(app)
      .post('/api/admin/education/assignments')
      .send({ classId: new mongoose.Types.ObjectId().toString(), title: 'X' })
      .expect(403)
  })

  it('VIEWER ne peut pas créer une note (POST → 403)', async () => {
    await request(app)
      .post('/api/admin/education/notes')
      .send({ title: 'X', blocks: [] })
      .expect(403)
  })

  it('VIEWER ne peut pas patcher une classe (PATCH → 403)', async () => {
    const id = new mongoose.Types.ObjectId().toString()
    await request(app)
      .patch(`/api/admin/education/classes/${id}`)
      .send({ name: 'Refusé' })
      .expect(403)
  })

  it('VIEWER ne peut pas supprimer une classe (DELETE → 403)', async () => {
    const id = new mongoose.Types.ObjectId().toString()
    await request(app)
      .delete(`/api/admin/education/classes/${id}`)
      .expect(403)
  })

  it('VIEWER ne peut pas patcher une présence de séance (PATCH /:id/attendance → 403)', async () => {
    const id = new mongoose.Types.ObjectId().toString()
    await request(app)
      .patch(`/api/admin/education/sessions/${id}/attendance`)
      .send({ attendance: [] })
      .expect(403)
  })

  it('VIEWER ne peut pas patcher une soumission (PATCH /assignments/:id/submissions/:studentId → 403)', async () => {
    const aId = new mongoose.Types.ObjectId().toString()
    const sId = new mongoose.Types.ObjectId().toString()
    await request(app)
      .patch(`/api/admin/education/assignments/${aId}/submissions/${sId}`)
      .send({ grade: 12 })
      .expect(403)
  })

  it('VIEWER ne peut pas importer un CSV étudiants (POST /students/import → 403)', async () => {
    await request(app)
      .post('/api/admin/education/students/import')
      .send({ classId: new mongoose.Types.ObjectId().toString(), csv: 'nom\nTest' })
      .expect(403)
  })

  it('VIEWER ne peut pas créer un template (POST /templates → 403)', async () => {
    await request(app)
      .post('/api/admin/education/templates')
      .send({ kind: 'session', name: 'T' })
      .expect(403)
  })

  it('VIEWER ne peut pas uploader un document (POST /documents → 403)', async () => {
    await request(app)
      .post('/api/admin/education/documents')
      .send({ title: 'X', url: 'https://example.com' })
      .expect(403)
  })
})

// Note : la couverture "ADMIN peut écrire" est déjà assurée par
// education-routes.test.ts (mock SUPER_ADMIN qui bypass toutes les permissions).
// On ne dédouble pas ici car la ré-import des routes provoque OverwriteModelError
// sur les modèles Mongoose dans une même suite de tests.
