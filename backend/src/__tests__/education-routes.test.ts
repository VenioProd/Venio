import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
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
})

describe('education routes', () => {
  it('classes: create / list / detail / update / delete (soft)', async () => {
    const created = await request(app)
      .post('/api/admin/education/classes')
      .send({ name: 'BTS Communication 1A', school: 'ESIC', level: 'BAC+1', program: 'Comm' })
      .expect(201)
    expect(created.body.class._id).toBeDefined()
    expect(created.body.class.owner).toBe(OWNER_ID)

    const list = await request(app).get('/api/admin/education/classes').expect(200)
    expect(list.body.total).toBe(1)
    expect(list.body.classes).toHaveLength(1)

    const id = created.body.class._id
    const detail = await request(app).get(`/api/admin/education/classes/${id}`).expect(200)
    expect(detail.body.class.name).toBe('BTS Communication 1A')
    expect(detail.body.stats.studentCount).toBe(0)

    const updated = await request(app)
      .patch(`/api/admin/education/classes/${id}`)
      .send({ name: 'BTS Comm 1A', status: 'PAUSE' })
      .expect(200)
    expect(updated.body.class.name).toBe('BTS Comm 1A')
    expect(updated.body.class.status).toBe('PAUSE')

    await request(app).delete(`/api/admin/education/classes/${id}`).expect(200)
    const afterDelete = await request(app).get('/api/admin/education/classes').expect(200)
    expect(afterDelete.body.total).toBe(0)
  })

  it('students: create + CSV import + ownership scope', async () => {
    const { body: classBody } = await request(app)
      .post('/api/admin/education/classes')
      .send({ name: 'Promo X' })
      .expect(201)
    const classId = classBody.class._id

    await request(app)
      .post('/api/admin/education/students')
      .send({ classId, lastName: 'Dupont', firstName: 'Jean', email: 'jean@ex.fr' })
      .expect(201)

    // Ligne 3 a un lastName vide → doit être ignorée
    const csv = 'prenom,nom,email\nMarie,Curie,marie@ex.fr\nPierre,Curie,pierre@ex.fr\nEmpty,,'
    const imported = await request(app)
      .post('/api/admin/education/students/import')
      .send({ classId, csv })
      .expect(201)
    expect(imported.body.inserted).toBe(2)

    const list = await request(app).get(`/api/admin/education/students?classId=${classId}`).expect(200)
    expect(list.body.total).toBe(3)
  })

  it('sessions: create pré-remplit attendance ; PATCH attendance met à jour compteurs étudiant', async () => {
    const { body: classBody } = await request(app)
      .post('/api/admin/education/classes')
      .send({ name: 'P' })
      .expect(201)
    const classId = classBody.class._id

    const { body: s1 } = await request(app)
      .post('/api/admin/education/students')
      .send({ classId, lastName: 'A' })
      .expect(201)
    const { body: s2 } = await request(app)
      .post('/api/admin/education/students')
      .send({ classId, lastName: 'B' })
      .expect(201)

    const session = await request(app)
      .post('/api/admin/education/sessions')
      .send({ classId, title: 'S1', date: new Date().toISOString() })
      .expect(201)
    expect(session.body.session.attendance).toHaveLength(2)

    await request(app)
      .patch(`/api/admin/education/sessions/${session.body.session._id}/attendance`)
      .send({
        attendance: [
          { studentId: s1.student._id, state: 'PRESENT' },
          { studentId: s2.student._id, state: 'ABSENT' },
        ],
      })
      .expect(200)

    const { body: stu1 } = await request(app).get(`/api/admin/education/students/${s1.student._id}`).expect(200)
    expect(stu1.student.attendanceCount).toBe(1)
    expect(stu1.student.absenceCount).toBe(0)
    const { body: stu2 } = await request(app).get(`/api/admin/education/students/${s2.student._id}`).expect(200)
    expect(stu2.student.absenceCount).toBe(1)
  })

  it('assignments: passer de DRAFT à OUVERT crée les soumissions ; PATCH grade met à jour moyenne étudiant', async () => {
    const { body: classBody } = await request(app)
      .post('/api/admin/education/classes')
      .send({ name: 'P' })
      .expect(201)
    const classId = classBody.class._id

    const { body: s1 } = await request(app)
      .post('/api/admin/education/students')
      .send({ classId, lastName: 'A' })
      .expect(201)
    await request(app)
      .post('/api/admin/education/students')
      .send({ classId, lastName: 'B' })
      .expect(201)

    const draft = await request(app)
      .post('/api/admin/education/assignments')
      .send({ classId, title: 'Devoir 1', status: 'DRAFT' })
      .expect(201)
    const aid = draft.body.assignment._id

    // DRAFT ⇒ pas de soumissions encore
    let subs = await request(app).get(`/api/admin/education/assignments/${aid}/submissions`).expect(200)
    expect(subs.body.submissions).toHaveLength(0)

    await request(app).patch(`/api/admin/education/assignments/${aid}`).send({ status: 'OUVERT' }).expect(200)
    subs = await request(app).get(`/api/admin/education/assignments/${aid}/submissions`).expect(200)
    expect(subs.body.submissions).toHaveLength(2)

    await request(app)
      .patch(`/api/admin/education/assignments/${aid}/submissions/${s1.student._id}`)
      .send({ status: 'CORRIGE', grade: 16 })
      .expect(200)

    const { body: stu1 } = await request(app).get(`/api/admin/education/students/${s1.student._id}`).expect(200)
    expect(stu1.student.averageGrade).toBe(16)
  })

  // Flaky en suite complète (passe en isolation) — l'index $text sur EducationNote
  // n'est pas systématiquement créé à temps avec mongodb-memory-server quand plusieurs
  // fichiers de tests partagent la mémoire. À fixer en forçant Model.init() au beforeAll.
  // Tracking : VENIO-52 (commentaire chantier #3 — CI).
  it.skip('notes: blocks → markdown miroir + recherche full-text', async () => {
    await request(app)
      .post('/api/admin/education/notes')
      .send({
        title: 'Bilan séance Mongoose',
        blocks: [
          { id: '1', type: 'heading', text: 'Objectifs', level: 2 },
          { id: '2', type: 'checklist', text: 'Préparer le cours', checked: true },
        ],
      })
      .expect(201)

    const found = await request(app).get('/api/admin/education/search?q=Mongoose').expect(200)
    expect(found.body.results.notes).toHaveLength(1)
  })

  it('dashboard: counters cohérents', async () => {
    const { body: classBody } = await request(app)
      .post('/api/admin/education/classes')
      .send({ name: 'P' })
      .expect(201)
    await request(app)
      .post('/api/admin/education/sessions')
      .send({ classId: classBody.class._id, title: 'Today', date: new Date().toISOString() })
      .expect(201)

    const dash = await request(app).get('/api/admin/education/dashboard').expect(200)
    expect(dash.body.counters.activeClasses).toBe(1)
    expect(dash.body.counters.todaySessions).toBe(1)
  })
})
