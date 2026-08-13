import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

/**
 * VENIO-30 / VENIO-33 / VENIO-35 — Education V3 workflows.
 *  - Bulk update des soumissions (correction groupée)
 *  - Export CSV des corrections + des séances
 *  - Recherche avancée (filtres école / classe / type / date / statut)
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
vi.mock('../lib/security/sensitiveActions.js', () => ({
  sensitiveAction: () => (_req: Request, _res: Response, next: NextFunction) => next(),
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

async function seedClassWithStudents(name = 'BTS Communication 1A', school = 'ESIC', count = 3) {
  const klass = await request(app)
    .post('/api/admin/education/classes')
    .send({ name, school, level: 'BAC+1', program: 'Communication' })
    .expect(201)
  const studentIds: string[] = []
  for (let i = 0; i < count; i++) {
    const s = await request(app)
      .post('/api/admin/education/students')
      .send({ classId: klass.body.class._id, firstName: `Etu${i}`, lastName: `Nom${i}`, email: `etu${i}@ex.fr` })
      .expect(201)
    studentIds.push(s.body.student._id)
  }
  return { classId: klass.body.class._id, studentIds }
}

describe('VENIO-30 correction groupée — bulk submissions', () => {
  it("met à jour plusieurs soumissions en une seule requête, recalcule la moyenne et logge l'activité", async () => {
    const { classId, studentIds } = await seedClassWithStudents()
    const a = await request(app)
      .post('/api/admin/education/assignments')
      .send({ classId, title: 'Devoir 1', status: 'OUVERT', maxGrade: 20 })
      .expect(201)
    const aid = a.body.assignment._id

    const bulk = await request(app)
      .patch(`/api/admin/education/assignments/${aid}/submissions/bulk`)
      .send({
        updates: [
          { studentId: studentIds[0], status: 'CORRIGE', grade: 14, feedback: 'Bonne analyse' },
          { studentId: studentIds[1], status: 'CORRIGE', grade: 18, feedback: 'Excellent' },
          { studentId: studentIds[2], status: 'NON_RENDU' },
        ],
      })
      .expect(200)
    expect(bulk.body.updated).toBe(3)

    const detail = await request(app).get(`/api/admin/education/assignments/${aid}`).expect(200)
    expect(detail.body.stats.corrige).toBe(2)
    expect(detail.body.stats.moyenne).toBe(16)

    // moyenne étudiant rafraîchie
    const stu0 = await request(app).get(`/api/admin/education/students/${studentIds[0]}`).expect(200)
    expect(stu0.body.student.averageGrade).toBe(14)
  })

  it('rejette atomiquement un lot contenant un studentId invalide', async () => {
    const { classId, studentIds } = await seedClassWithStudents('P', 'X', 2)
    const a = await request(app)
      .post('/api/admin/education/assignments')
      .send({ classId, title: 'Q', status: 'OUVERT' })
      .expect(201)
    const aid = a.body.assignment._id

    await request(app)
      .patch(`/api/admin/education/assignments/${aid}/submissions/bulk`)
      .send({
        updates: [
          { studentId: studentIds[0], status: 'RENDU' },
          { studentId: 'not-an-id', status: 'RENDU' },
          { studentId: studentIds[1], status: 'RENDU' },
        ],
      })
      .expect(400)

    const submissions = await request(app).get(`/api/admin/education/assignments/${aid}/submissions`).expect(200)
    expect(
      submissions.body.submissions.every((submission: { status: string }) => submission.status === 'NON_RENDU'),
    ).toBe(true)
  })

  it('refuse un étudiant d’une autre classe et une note supérieure au barème', async () => {
    const { classId, studentIds } = await seedClassWithStudents('Classe A', 'X', 1)
    const { studentIds: foreignStudentIds } = await seedClassWithStudents('Classe B', 'X', 1)
    const assignment = await request(app)
      .post('/api/admin/education/assignments')
      .send({ classId, title: 'Barème strict', status: 'OUVERT', maxGrade: 20 })
      .expect(201)

    await request(app)
      .patch(`/api/admin/education/assignments/${assignment.body.assignment._id}/submissions/bulk`)
      .send({ updates: [{ studentId: foreignStudentIds[0], status: 'CORRIGE', grade: 12 }] })
      .expect(400)

    await request(app)
      .patch(`/api/admin/education/assignments/${assignment.body.assignment._id}/submissions/${studentIds[0]}`)
      .send({ status: 'CORRIGE', grade: 21 })
      .expect(400)
  })

  it("persiste la rubric et les feedbackSnippets sur l'assignment", async () => {
    const { classId } = await seedClassWithStudents('Pp', 'X', 1)
    const a = await request(app)
      .post('/api/admin/education/assignments')
      .send({ classId, title: 'Q', status: 'OUVERT', maxGrade: 20 })
      .expect(201)
    const aid = a.body.assignment._id

    const updated = await request(app)
      .patch(`/api/admin/education/assignments/${aid}`)
      .send({
        rubric: [
          { label: 'Méthode', max: 8 },
          { label: 'Fond', max: 8 },
          { label: 'Forme', max: 4 },
        ],
        feedbackSnippets: ['Bon travail', 'Argumentation à étoffer'],
      })
      .expect(200)
    expect(updated.body.assignment.rubric).toHaveLength(3)
    expect(updated.body.assignment.feedbackSnippets).toEqual(['Bon travail', 'Argumentation à étoffer'])
  })
})

describe('VENIO-35 export CSV', () => {
  it('exporte les corrections en CSV avec un BOM utf-8', async () => {
    const { classId, studentIds } = await seedClassWithStudents('BTS NDRC', 'EMA', 2)
    const a = await request(app)
      .post('/api/admin/education/assignments')
      .send({ classId, title: 'Cas final', status: 'OUVERT', maxGrade: 20 })
      .expect(201)
    await request(app)
      .patch(`/api/admin/education/assignments/${a.body.assignment._id}/submissions/bulk`)
      .send({
        updates: [
          { studentId: studentIds[0], status: 'CORRIGE', grade: 12, feedback: 'OK' },
          { studentId: studentIds[1], status: 'CORRIGE', grade: 17, feedback: 'Bien' },
        ],
      })
      .expect(200)

    const r = await request(app).get(`/api/admin/education/assignments/${a.body.assignment._id}/export.csv`).expect(200)
    expect(r.headers['content-type']).toContain('text/csv')
    expect(r.headers['content-disposition']).toContain('attachment')
    const body = r.text || (r.body as Buffer).toString('utf8')
    expect(body.charCodeAt(0)).toBe(0xfeff) // BOM
    expect(body).toContain('Etudiant,Email')
    expect(body).toContain('12')
    expect(body).toContain('17')
  })

  it('exporte la séance avec la présence détaillée', async () => {
    const { classId, studentIds } = await seedClassWithStudents('P', 'X', 2)
    const session = await request(app)
      .post('/api/admin/education/sessions')
      .send({ classId, title: 'Cours 1', date: new Date().toISOString() })
      .expect(201)
    await request(app)
      .patch(`/api/admin/education/sessions/${session.body.session._id}/attendance`)
      .send({
        attendance: [
          { studentId: studentIds[0], state: 'PRESENT', comment: '' },
          { studentId: studentIds[1], state: 'ABSENT', comment: 'Justifié' },
        ],
      })
      .expect(200)

    const r = await request(app).get(`/api/admin/education/sessions/${session.body.session._id}/export.csv`).expect(200)
    const body = r.text || (r.body as Buffer).toString('utf8')
    expect(body).toContain('PRESENT')
    expect(body).toContain('ABSENT')
    expect(body).toContain('Justifié')
  })
})

describe('VENIO-33 recherche avancée', () => {
  it('filtre par école et type de devoir, et liste les écoles disponibles', async () => {
    const { classId: c1 } = await seedClassWithStudents('Comm 1A', 'EMA', 1)
    const { classId: c2 } = await seedClassWithStudents('NDRC 1A', 'ISIFA', 1)
    await request(app)
      .post('/api/admin/education/assignments')
      .send({ classId: c1, title: 'Étude EMA', kind: 'PROJET', status: 'OUVERT' })
      .expect(201)
    await request(app)
      .post('/api/admin/education/assignments')
      .send({ classId: c2, title: 'QCM ISIFA', kind: 'QCM', status: 'OUVERT' })
      .expect(201)

    const r = await request(app)
      .get('/api/admin/education/search/advanced?school=EMA&entity=assignments&kind=PROJET')
      .expect(200)
    expect(r.body.results.assignments).toHaveLength(1)
    expect(r.body.results.assignments[0].title).toBe('Étude EMA')
    expect(r.body.schools).toEqual(expect.arrayContaining(['EMA', 'ISIFA']))
  })

  it('filtre les séances par intervalle de date', async () => {
    const { classId } = await seedClassWithStudents('P', 'X', 1)
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await request(app)
      .post('/api/admin/education/sessions')
      .send({ classId, title: 'Past', date: past.toISOString() })
      .expect(201)
    await request(app)
      .post('/api/admin/education/sessions')
      .send({ classId, title: 'Future', date: future.toISOString() })
      .expect(201)

    const r = await request(app)
      .get(
        `/api/admin/education/search/advanced?entity=sessions&from=${new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()}`,
      )
      .expect(200)
    const titles = r.body.results.sessions.map((s: { title: string }) => s.title)
    expect(titles).toContain('Future')
    expect(titles).not.toContain('Past')
  })

  it('expose les facettes (écoles + classes) pour le formulaire', async () => {
    await seedClassWithStudents('A', 'EMA', 1)
    await seedClassWithStudents('B', 'GGI', 1)
    const r = await request(app).get('/api/admin/education/search/facets').expect(200)
    expect(r.body.schools.length).toBeGreaterThanOrEqual(2)
    expect(r.body.classes.length).toBe(2)
  })

  it('regroupe par école dans /search/by-school avec les compteurs étudiants', async () => {
    await seedClassWithStudents('A', 'EMA', 2)
    await seedClassWithStudents('B', 'EMA', 1)
    await seedClassWithStudents('C', 'GGI', 3)
    const r = await request(app).get('/api/admin/education/search/by-school').expect(200)
    const buckets = r.body.schools as Array<{ school: string; studentCount: number; classes: unknown[] }>
    const ema = buckets.find((b) => b.school === 'EMA')!
    const ggi = buckets.find((b) => b.school === 'GGI')!
    expect(ema.studentCount).toBe(3)
    expect(ema.classes.length).toBe(2)
    expect(ggi.studentCount).toBe(3)
    expect(ggi.classes.length).toBe(1)
  })
})
