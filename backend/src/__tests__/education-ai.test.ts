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

describe('education AI assistance — review-gated drafts', () => {
  const cases = [
    ['session_plan', { topic: 'Analyse de campagne', level: 'BTS 1', objectives: ['Identifier une cible'] }, 'agenda'],
    [
      'session_synthesis',
      { instructorNotes: 'Le groupe a analysé deux affiches. Les arguments ont été justifiés.' },
      'recap',
    ],
    [
      'assignment_feedback',
      { comments: 'Argumentation claire, mais sources à citer.', rubric: ['Argumentation', 'Sources'] },
      'feedback',
    ],
    ['checklist_action_plan', { context: 'Préparer une activité de mise en pratique' }, 'checklist'],
  ] as const

  it.each(cases)('generates a %s editable draft without writing a domain entity', async (mode, input, field) => {
    const { EducationSession, EducationAssignment, EducationSubmission, EducationAiGeneration } = await import(
      '../models/education/index.js'
    )
    const response = await request(app).post('/api/admin/education/ai/generate').send({ mode, input }).expect(201)

    expect(response.body.draft.fields[field]).toBeDefined()
    expect(response.body.provenance).toEqual({ reviewRequired: true, persistedInput: false, automaticActions: false })
    expect(await EducationSession.countDocuments()).toBe(0)
    expect(await EducationAssignment.countDocuments()).toBe(0)
    expect(await EducationSubmission.countDocuments()).toBe(0)

    const audit = await EducationAiGeneration.findById(response.body.generation.id).lean()
    expect(audit?.inputFields).toEqual(Object.keys(input).sort())
    expect(JSON.stringify(audit)).not.toContain(JSON.stringify(Object.values(input)[0]))
    expect(audit?.reviewedAt).toBeNull()
  })

  it('requires an explicit review acknowledgement and records only that acknowledgement', async () => {
    const generated = await request(app)
      .post('/api/admin/education/ai/generate')
      .send({ mode: 'session_synthesis', input: { instructorNotes: 'Notes privées à ne pas persister.' } })
      .expect(201)

    await request(app)
      .post(`/api/admin/education/ai/generations/${generated.body.generation.id}/review`)
      .send({})
      .expect(400)
    const reviewed = await request(app)
      .post(`/api/admin/education/ai/generations/${generated.body.generation.id}/review`)
      .send({ reviewed: true })
      .expect(200)

    expect(reviewed.body.generation.reviewed).toBe(true)
    const { EducationAiGeneration } = await import('../models/education/index.js')
    const audit = await EducationAiGeneration.findById(generated.body.generation.id).lean()
    expect(audit?.reviewedAt).not.toBeNull()
    expect(JSON.stringify(audit)).not.toContain('Notes privées à ne pas persister.')
  })
})
