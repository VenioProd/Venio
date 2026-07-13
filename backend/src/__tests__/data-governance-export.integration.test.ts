import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import express, { type Express } from 'express'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import User from '../models/User.js'
import AuditLog from '../models/AuditLog.js'

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

async function sessionCookie(steppedUp = true): Promise<string> {
  const user = await User.create({
    email: `governance-${Date.now()}@venio.test`,
    passwordHash: await bcrypt.hash('test', 10),
    name: 'Governance test',
    role: 'SUPER_ADMIN',
    twoFactorEnabled: true,
    twoFactorSecret: 'JBSWY3DPEHPK3PXP',
  })
  const { token } = await createSession(String(user._id), steppedUp ? { mfaVerifiedAt: new Date() } : {})
  return `venio_session=${token}`
}

async function seedEducationExport(cookie: string): Promise<{ classId: string; assignmentId: string; sessionId: string }> {
  const klass = await request(app)
    .post('/api/admin/education/classes')
    .set('Cookie', cookie)
    .send({ name: 'Classe test', school: 'École test', level: 'Test' })
    .expect(201)
  const classId = klass.body.class._id as string

  await request(app)
    .post('/api/admin/education/students')
    .set('Cookie', cookie)
    .send({
      classId,
      firstName: 'Test',
      lastName: 'Student',
      email: 'student@venio.test',
      phone: '+33600000000',
      notes: 'Ne doit pas sortir',
    })
    .expect(201)

  const assignment = await request(app)
    .post('/api/admin/education/assignments')
    .set('Cookie', cookie)
    .send({ classId, title: 'Évaluation test', status: 'OUVERT' })
    .expect(201)

  const session = await request(app)
    .post('/api/admin/education/sessions')
    .set('Cookie', cookie)
    .send({
      classId,
      title: 'Séance; "test"\npartie 2',
      date: '2026-07-13T09:00:00.000Z',
      agenda: 'Point; "important"\nà conserver',
      supports: ['https://private.example.test/signed-document'],
    })
    .expect(201)

  return { classId, assignmentId: assignment.body.assignment._id, sessionId: session.body.session._id }
}

describe('VENIO-103 — exports pédagogiques sensibles', () => {
  it('refuse un export sans confirmation explicite', async () => {
    const cookie = await sessionCookie()
    const { classId, assignmentId } = await seedEducationExport(cookie)

    const response = await request(app)
      .get(`/api/admin/education/assignments/${assignmentId}/export.csv`)
      .set('Cookie', cookie)

    expect(response.status).toBe(428)
    expect(response.body.error).toBe('SENSITIVE_ACTION_CONFIRMATION_REQUIRED')

    const classResponse = await request(app)
      .get(`/api/admin/education/exports/classes/${classId}?format=json`)
      .set('Cookie', cookie)
    expect(classResponse.status).toBe(428)
    expect(classResponse.body.error).toBe('SENSITIVE_ACTION_CONFIRMATION_REQUIRED')
  })

  it('refuse un export avec une confirmation qui ne correspond pas à l’action', async () => {
    const cookie = await sessionCookie()
    const { sessionId } = await seedEducationExport(cookie)

    const response = await request(app)
      .get(`/api/admin/education/sessions/${sessionId}/export.csv`)
      .set('Cookie', cookie)
      .set('X-Venio-Confirm', 'EDUCATION_ASSIGNMENT_EXPORT')

    expect(response.status).toBe(403)
    expect(response.body.error).toBe('SENSITIVE_ACTION_CONFIRMATION_INVALID')
  })

  it('exige un step-up MFA récent avant un export', async () => {
    const cookie = await sessionCookie(false)
    const { assignmentId } = await seedEducationExport(cookie)

    const response = await request(app)
      .get(`/api/admin/education/assignments/${assignmentId}/export.csv`)
      .set('Cookie', cookie)
      .set('X-Venio-Confirm', 'EDUCATION_ASSIGNMENT_EXPORT')

    expect(response.status).toBe(403)
    expect(response.body.error).toBe('MFA_STEP_UP_REQUIRED')
  })

  it('produit le CSV des cours avec encodage, échappement et nom déterministe', async () => {
    const cookie = await sessionCookie()
    const { classId } = await seedEducationExport(cookie)

    const response = await request(app)
      .get(`/api/admin/education/exports/classes/${classId}?format=csv`)
      .set('Cookie', cookie)
      .set('X-Venio-Confirm', 'EDUCATION_CLASS_EXPORT')
      .expect(200)

    expect(response.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/)
    expect(response.headers['content-disposition']).toBe('attachment; filename="classe-classe-test-cours.csv"')
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.text.startsWith('\uFEFF')).toBe(true)
    expect(response.text).toContain('"Séance; ""test""\npartie 2"')
    expect(response.text).toContain('"Point; ""important""\nà conserver"')
  })

  it('produit un instantané JSON versionné sans URLs privées ni champs internes', async () => {
    const cookie = await sessionCookie()
    const { classId } = await seedEducationExport(cookie)

    const response = await request(app)
      .get(`/api/admin/education/exports/classes/${classId}?format=json`)
      .set('Cookie', cookie)
      .set('X-Venio-Confirm', 'EDUCATION_CLASS_EXPORT')
      .expect(200)

    expect(response.headers['content-type']).toMatch(/^application\/json; charset=utf-8/)
    expect(response.headers['content-disposition']).toBe('attachment; filename="classe-classe-test-workspace.json"')
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.body).toMatchObject({
      schema: 'venio.education.class-export',
      schemaVersion: 1,
      class: { name: 'Classe test' },
      students: [
        {
          reference: 'student-1',
          email: 'student@venio.test',
          status: 'ACTIVE',
        },
      ],
      sessions: [
        {
          title: 'Séance; "test"\npartie 2',
          date: '2026-07-13T09:00:00.000Z',
          attendance: [{ studentReference: 'student-1', state: 'NON_RENSEIGNE' }],
        },
      ],
    })
    expect(response.body.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(response.body.students[0]).not.toHaveProperty('phone')
    expect(response.body.students[0]).not.toHaveProperty('notes')
    expect(response.body.sessions[0]).not.toHaveProperty('supports')
    expect(response.text).not.toContain('private.example.test')
  })

  it('journalise les exports réussis sans en copier le contenu', async () => {
    const cookie = await sessionCookie()
    const { classId, assignmentId, sessionId } = await seedEducationExport(cookie)

    await request(app)
      .get(`/api/admin/education/assignments/${assignmentId}/export.csv`)
      .set('Cookie', cookie)
      .set('X-Venio-Confirm', 'EDUCATION_ASSIGNMENT_EXPORT')
      .expect(200)
    await request(app)
      .get(`/api/admin/education/sessions/${sessionId}/export.csv`)
      .set('Cookie', cookie)
      .set('X-Venio-Confirm', 'EDUCATION_SESSION_EXPORT')
      .expect(200)
    await request(app)
      .get(`/api/admin/education/exports/classes/${classId}?format=json`)
      .set('Cookie', cookie)
      .set('X-Venio-Confirm', 'EDUCATION_CLASS_EXPORT')
      .expect(200)

    await expect
      .poll(
        async () =>
          AuditLog.countDocuments({
            action: 'SENSITIVE_ACTION_EXECUTED',
            'metadata.sensitiveAction': {
              $in: ['EDUCATION_ASSIGNMENT_EXPORT', 'EDUCATION_SESSION_EXPORT', 'EDUCATION_CLASS_EXPORT'],
            },
          }),
        { timeout: 2_000 },
      )
      .toBe(3)

    const audit = await AuditLog.findOne({
      action: 'SENSITIVE_ACTION_EXECUTED',
      'metadata.sensitiveAction': 'EDUCATION_ASSIGNMENT_EXPORT',
    }).lean()
    expect(audit?.metadata).toMatchObject({
      method: 'GET',
      path: `/api/admin/education/assignments/${assignmentId}/export.csv`,
    })
    expect(audit?.metadata).not.toHaveProperty('before')
    expect(audit?.metadata).not.toHaveProperty('after')
  })
})
