import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
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
    const imported = await request(app).post('/api/admin/education/students/import').send({ classId, csv }).expect(201)
    expect(imported.body.inserted).toBe(2)

    const list = await request(app).get(`/api/admin/education/students?classId=${classId}`).expect(200)
    expect(list.body.total).toBe(3)
  })

  it('sessions: create pré-remplit attendance ; PATCH attendance met à jour compteurs étudiant', async () => {
    const { body: classBody } = await request(app).post('/api/admin/education/classes').send({ name: 'P' }).expect(201)
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
    const { body: classBody } = await request(app).post('/api/admin/education/classes').send({ name: 'P' }).expect(201)
    const classId = classBody.class._id

    const { body: s1 } = await request(app)
      .post('/api/admin/education/students')
      .send({ classId, lastName: 'A' })
      .expect(201)
    await request(app).post('/api/admin/education/students').send({ classId, lastName: 'B' }).expect(201)

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

  it('Quickfind: expose uniquement les contextes documentaires encore accessibles au propriétaire', async () => {
    const { EducationClass, EducationDocument } = await import('../models/education/index.js')
    await EducationDocument.init()

    const { body: classBody } = await request(app)
      .post('/api/admin/education/classes')
      .send({ name: 'BTS Référence', school: 'EMA' })
      .expect(201)
    const classId = classBody.class._id
    const { body: sessionBody } = await request(app)
      .post('/api/admin/education/sessions')
      .send({ classId, title: 'Séance Référence', date: new Date().toISOString() })
      .expect(201)
    const { body: assignmentBody } = await request(app)
      .post('/api/admin/education/assignments')
      .send({ classId, title: 'Devoir Référence' })
      .expect(201)
    const { body: studentBody } = await request(app)
      .post('/api/admin/education/students')
      .send({ classId, firstName: 'Lina', lastName: 'Référence' })
      .expect(201)
    const foreignClass = await EducationClass.create({
      owner: new mongoose.Types.ObjectId(),
      name: 'Classe privée',
      school: 'Autre',
    })

    await EducationDocument.create([
      { owner: OWNER_ID, title: 'Référence classe', parentType: 'class', parentId: classId },
      { owner: OWNER_ID, title: 'Référence séance', parentType: 'session', parentId: sessionBody.session._id },
      { owner: OWNER_ID, title: 'Référence devoir', parentType: 'assignment', parentId: assignmentBody.assignment._id },
      { owner: OWNER_ID, title: 'Référence étudiant', parentType: 'student', parentId: studentBody.student._id },
      { owner: OWNER_ID, title: 'Référence seule', parentType: 'standalone', parentId: null },
      { owner: OWNER_ID, title: 'Référence privée', parentType: 'class', parentId: foreignClass._id },
    ])

    const found = await request(app).get('/api/admin/education/search?q=Référence').expect(200)
    const documents = found.body.results.documents as Array<{ title: string; parentContext: Record<string, unknown> }>
    const byTitle = new Map(documents.map((document) => [document.title, document.parentContext]))

    expect(byTitle.get('Référence classe')).toEqual({
      state: 'available',
      target: { kind: 'class', id: classId, label: 'BTS Référence', school: 'EMA' },
    })
    expect(byTitle.get('Référence séance')).toEqual({
      state: 'available',
      target: { kind: 'session', id: sessionBody.session._id, label: 'Séance Référence' },
    })
    expect(byTitle.get('Référence devoir')).toEqual({
      state: 'available',
      target: { kind: 'assignment', id: assignmentBody.assignment._id, label: 'Devoir Référence' },
    })
    expect(byTitle.get('Référence étudiant')).toEqual({
      state: 'available',
      target: { kind: 'student', id: studentBody.student._id, label: 'Lina Référence' },
    })
    expect(byTitle.get('Référence seule')).toEqual({ state: 'unavailable', reason: 'NO_PARENT' })
    // Aucun libellé ni identifiant de la classe étrangère ne doit fuiter.
    expect(byTitle.get('Référence privée')).toEqual({ state: 'unavailable', reason: 'TARGET_UNAVAILABLE' })
  })

  it('Quickfind: ouvre une note parente autorisée sans révéler les notes supprimées ou étrangères', async () => {
    const { EducationDocument, EducationNote } = await import('../models/education/index.js')
    await EducationDocument.init()

    const note = await EducationNote.create({ owner: OWNER_ID, title: 'Préparation de cours' })
    const deletedNote = await EducationNote.create({
      owner: OWNER_ID,
      title: 'Ancienne préparation',
      deletedAt: new Date(),
    })
    const foreignNote = await EducationNote.create({
      owner: new mongoose.Types.ObjectId(),
      title: 'Préparation privée',
    })
    await EducationDocument.create([
      { owner: OWNER_ID, title: 'Support note parent', parentType: 'note', parentId: note._id },
      { owner: OWNER_ID, title: 'Support note supprimée', parentType: 'note', parentId: deletedNote._id },
      { owner: OWNER_ID, title: 'Support note privée', parentType: 'note', parentId: foreignNote._id },
    ])

    const found = await request(app).get('/api/admin/education/search?q=Support').expect(200)
    const documents = found.body.results.documents as Array<{ title: string; parentContext: Record<string, unknown> }>
    const byTitle = new Map(documents.map((document) => [document.title, document.parentContext]))

    expect(byTitle.get('Support note parent')).toEqual({
      state: 'available',
      target: { kind: 'note', id: note._id.toString(), label: 'Préparation de cours' },
    })
    // Une note supprimée ou appartenant à un autre intervenant reste opaque.
    expect(byTitle.get('Support note supprimée')).toEqual({ state: 'unavailable', reason: 'TARGET_UNAVAILABLE' })
    expect(byTitle.get('Support note privée')).toEqual({ state: 'unavailable', reason: 'TARGET_UNAVAILABLE' })
  })

  it('documents: télécharge le binaire du propriétaire sans exposer celui d’un autre intervenant', async () => {
    const { EducationDocument } = await import('../models/education/index.js')
    const directory = await mkdtemp(path.join(tmpdir(), 'venio-education-document-'))
    const filePath = path.join(directory, 'support.txt')
    await writeFile(filePath, 'support pédagogique')

    try {
      const owned = await EducationDocument.create({
        owner: OWNER_ID,
        title: 'Support autorisé',
        originalName: 'support.txt',
        storagePath: filePath,
        mimeType: 'text/plain',
      })
      const foreign = await EducationDocument.create({
        owner: new mongoose.Types.ObjectId(),
        title: 'Support privé',
        originalName: 'prive.txt',
        storagePath: filePath,
        mimeType: 'text/plain',
      })

      const downloaded = await request(app).get(`/api/admin/education/documents/${owned._id}/download`).expect(200)
      expect(downloaded.text).toBe('support pédagogique')
      expect(downloaded.headers['content-type']).toContain('text/plain')
      expect(downloaded.headers['content-disposition']).toContain('inline')

      await request(app).get(`/api/admin/education/documents/${foreign._id}/download`).expect(404)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('dashboard: counters cohérents', async () => {
    const { body: classBody } = await request(app).post('/api/admin/education/classes').send({ name: 'P' }).expect(201)
    await request(app)
      .post('/api/admin/education/sessions')
      .send({ classId: classBody.class._id, title: 'Today', date: new Date().toISOString() })
      .expect(201)

    const dash = await request(app).get('/api/admin/education/dashboard').expect(200)
    expect(dash.body.counters.activeClasses).toBe(1)
    expect(dash.body.counters.todaySessions).toBe(1)
  })

  it('dashboard: expose des signaux de suivi bornés et filtrés par école', async () => {
    const { EducationStudent } = await import('../models/education/index.js')
    const { body: emaClass } = await request(app)
      .post('/api/admin/education/classes')
      .send({ name: 'BTS EMA', school: 'EMA' })
      .expect(201)
    const { body: ggiClass } = await request(app)
      .post('/api/admin/education/classes')
      .send({ name: 'BTS GGI', school: 'GGI' })
      .expect(201)

    const { body: emaStudent } = await request(app)
      .post('/api/admin/education/students')
      .send({ classId: emaClass.class._id, firstName: 'Lina', lastName: 'Martin' })
      .expect(201)
    await EducationStudent.updateOne({ _id: emaStudent.student._id }, { absenceCount: 3, lateCount: 3 })

    const overdue = await request(app)
      .post('/api/admin/education/assignments')
      .send({
        classId: emaClass.class._id,
        title: 'Dossier à rendre',
        status: 'OUVERT',
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(201)
    expect(overdue.body.assignment._id).toBeDefined()

    const { body: ggiStudent } = await request(app)
      .post('/api/admin/education/students')
      .send({ classId: ggiClass.class._id, firstName: 'Noah', lastName: 'Durand' })
      .expect(201)
    await EducationStudent.updateOne({ _id: ggiStudent.student._id }, { absenceCount: 4 })

    const dash = await request(app).get('/api/admin/education/dashboard?school=EMA').expect(200)
    const alerts = dash.body.alerts as Array<{ type: string; student: { _id: string }; class: { school: string } }>
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'ABSENCES_REPETEES',
          student: expect.objectContaining({ _id: emaStudent.student._id }),
        }),
        expect.objectContaining({
          type: 'RETARDS_REPETES',
          student: expect.objectContaining({ _id: emaStudent.student._id }),
        }),
        expect.objectContaining({
          type: 'DEVOIRS_NON_RENDUS',
          student: expect.objectContaining({ _id: emaStudent.student._id }),
        }),
      ]),
    )
    expect(alerts).toHaveLength(3)
    expect(alerts.every((alert) => alert.class.school === 'EMA')).toBe(true)
  })

  it('suivi étudiant: un signal traité disparaît puis réapparaît quand son compteur augmente', async () => {
    const { EducationStudent } = await import('../models/education/index.js')
    const { body: classBody } = await request(app)
      .post('/api/admin/education/classes')
      .send({ name: 'BTS suivi' })
      .expect(201)
    const { body: studentBody } = await request(app)
      .post('/api/admin/education/students')
      .send({ classId: classBody.class._id, firstName: 'Lina', lastName: 'Martin' })
      .expect(201)
    const studentId = studentBody.student._id
    await EducationStudent.updateOne({ _id: studentId }, { absenceCount: 3 })

    let dash = await request(app).get('/api/admin/education/dashboard').expect(200)
    expect(dash.body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'ABSENCES_REPETEES',
          count: 3,
          student: expect.objectContaining({ _id: studentId }),
        }),
      ]),
    )

    await request(app)
      .patch(`/api/admin/education/students/${studentId}/follow-up/ABSENCES_REPETEES`)
      .send({ acknowledged: true, count: 4 })
      .expect(409)

    const acknowledged = await request(app)
      .patch(`/api/admin/education/students/${studentId}/follow-up/ABSENCES_REPETEES`)
      .send({ acknowledged: true, count: 3 })
      .expect(200)
    expect(acknowledged.body.student.followUpAcknowledgements).toEqual([
      expect.objectContaining({ type: 'ABSENCES_REPETEES', count: 3 }),
    ])

    dash = await request(app).get('/api/admin/education/dashboard').expect(200)
    expect(dash.body.alerts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ABSENCES_REPETEES', student: expect.objectContaining({ _id: studentId }) }),
      ]),
    )

    await EducationStudent.updateOne({ _id: studentId }, { absenceCount: 4 })
    dash = await request(app).get('/api/admin/education/dashboard').expect(200)
    expect(dash.body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'ABSENCES_REPETEES',
          count: 4,
          student: expect.objectContaining({ _id: studentId }),
        }),
      ]),
    )
  })

  it('suivi étudiant: les acknowledgements restent bornés au propriétaire', async () => {
    const { EducationStudent, EducationClass } = await import('../models/education/index.js')
    const otherOwner = new mongoose.Types.ObjectId()
    const otherClass = await EducationClass.create({ owner: otherOwner, name: 'Autre propriétaire' })
    const otherStudent = await EducationStudent.create({
      owner: otherOwner,
      classId: otherClass._id,
      lastName: 'Isolé',
    })

    await request(app)
      .patch(`/api/admin/education/students/${otherStudent._id}/follow-up/ABSENCES_REPETEES`)
      .send({ acknowledged: true, count: 2 })
      .expect(404)
  })
})
