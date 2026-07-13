import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const OWNER_ID = new mongoose.Types.ObjectId().toString()

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: OWNER_ID, role: 'SUPER_ADMIN' } as Request['user']
    next()
  },
}))
vi.mock('../middleware/role.js', () => ({
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

let app: Express

beforeAll(async () => {
  await setupMongo()
  const { default: educationRoutes } = await import('../routes/admin/education/index.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/education', educationRoutes)
})

afterAll(teardownMongo)
beforeEach(clearDb)

describe('education class council preparation', () => {
  it('returns a read-only factual class report without creating a note or communication', async () => {
    const klass = await request(app)
      .post('/api/admin/education/classes')
      .send({ name: 'BTS NDRC 1', school: 'EMA', level: 'BTS 1' })
      .expect(201)
    const classId = klass.body.class._id
    const ada = await request(app)
      .post('/api/admin/education/students')
      .send({ classId, firstName: 'Ada', lastName: 'Lovelace' })
      .expect(201)
    const grace = await request(app)
      .post('/api/admin/education/students')
      .send({ classId, firstName: 'Grace', lastName: 'Hopper' })
      .expect(201)
    const session = await request(app)
      .post('/api/admin/education/sessions')
      .send({ classId, title: 'Séance 1', date: new Date().toISOString(), status: 'TERMINEE' })
      .expect(201)
    await request(app)
      .patch(`/api/admin/education/sessions/${session.body.session._id}`)
      .send({ recap: 'Bilan fait.' })
      .expect(200)
    await request(app)
      .patch(`/api/admin/education/sessions/${session.body.session._id}/attendance`)
      .send({
        attendance: [
          { studentId: ada.body.student._id, state: 'PRESENT', comment: '' },
          { studentId: grace.body.student._id, state: 'ABSENT', comment: '' },
        ],
      })
      .expect(200)
    const assignment = await request(app)
      .post('/api/admin/education/assignments')
      .send({ classId, title: 'Étude de cas', status: 'OUVERT' })
      .expect(201)
    await request(app)
      .patch(`/api/admin/education/assignments/${assignment.body.assignment._id}/submissions/bulk`)
      .send({
        updates: [
          { studentId: ada.body.student._id, status: 'CORRIGE', grade: 16 },
          { studentId: grace.body.student._id, status: 'EN_RETARD' },
        ],
      })
      .expect(200)

    const report = await request(app).get(`/api/admin/education/classes/${classId}/council-prep`).expect(200)

    expect(report.body.class).toMatchObject({ _id: classId, name: 'BTS NDRC 1', school: 'EMA' })
    expect(report.body.summary).toMatchObject({
      activeStudents: 2,
      sessions: { total: 1, completed: 1, withRecap: 1 },
      assignments: { total: 1, open: 1 },
      attendance: { recorded: 1, absences: 1, late: 0 },
      grades: { gradedStudents: 1, average: 16 },
    })
    expect(report.body.students).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ firstName: 'Ada', averageGrade: 16, pendingAssignments: 0 }),
        expect.objectContaining({ firstName: 'Grace', pendingAssignments: 1, lateAssignments: 1 }),
      ]),
    )
    expect(report.body.provenance).toMatchObject({ automaticActions: false })

    const { EducationNote, EducationAiGeneration } = await import('../models/education/index.js')
    expect(await EducationNote.countDocuments()).toBe(0)
    expect(await EducationAiGeneration.countDocuments()).toBe(0)
  })
})
