import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import clientQuoteRoutes from '../routes/client/quotes.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectMember from '../models/ProjectMember.js'
import QuoteProposal from '../models/QuoteProposal.js'

let app: Express
let ownerId: string
let viewerId: string
let outsiderId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function createProposal(overrides: Record<string, unknown> = {}) {
  return QuoteProposal.create({
    project: projectId,
    client: ownerId,
    createdBy: ownerId,
    title: 'Refonte',
    status: 'SENT',
    lines: [
      { description: 'Conception', quantity: 1, unitPrice: 2000, taxRate: 20, isOptional: false, order: 0 },
      { description: 'Rédaction', quantity: 1, unitPrice: 600, taxRate: 20, isOptional: true, order: 1 },
    ],
    ...overrides,
  })
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/projects', clientQuoteRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [owner, viewer, outsider] = await User.create([
    { name: 'Owner', email: 'owner@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Viewer', email: 'viewer@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Outsider', email: 'outsider@example.test', passwordHash, role: 'CLIENT' },
  ])
  ownerId = String(owner._id)
  viewerId = String(viewer._id)
  outsiderId = String(outsider._id)
  const project = await Project.create({ name: 'Site', client: owner._id })
  projectId = String(project._id)
  await ProjectMember.create({ project: project._id, user: viewer._id, role: 'VIEWER', createdBy: owner._id })
})

describe('lecture des propositions côté client', () => {
  it('liste les propositions envoyées avec leurs totaux serveur', async () => {
    await createProposal()
    const response = await request(app)
      .get(`/api/projects/${projectId}/proposals`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)

    expect(response.body.proposals).toHaveLength(1)
    expect(response.body.proposals[0].totals).toEqual({ subtotal: 2000, taxTotal: 400, total: 2400 })
  })

  it('masque un DRAFT et un CANCELLED', async () => {
    const draft = await createProposal({ status: 'DRAFT' })
    await createProposal({ status: 'CANCELLED' })

    const list = await request(app)
      .get(`/api/projects/${projectId}/proposals`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)
    expect(list.body.proposals).toHaveLength(0)

    await request(app)
      .get(`/api/projects/${projectId}/proposals/${draft._id}`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(404)
  })

  it('autorise un collaborateur invité à consulter', async () => {
    const proposal = await createProposal()
    await request(app)
      .get(`/api/projects/${projectId}/proposals/${proposal._id}`)
      .set('Cookie', await cookieFor(viewerId))
      .expect(200)
  })

  it('refuse un client étranger au projet', async () => {
    const proposal = await createProposal()
    await request(app)
      .get(`/api/projects/${projectId}/proposals/${proposal._id}`)
      .set('Cookie', await cookieFor(outsiderId))
      .expect(404)
  })

  it('bascule en EXPIRED une proposition dont la date de validité est dépassée', async () => {
    const proposal = await createProposal({ expiresAt: new Date(Date.now() - 1000) })
    const response = await request(app)
      .get(`/api/projects/${projectId}/proposals/${proposal._id}`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)

    expect(response.body.proposal.status).toBe('EXPIRED')
    expect((await QuoteProposal.findById(proposal._id))!.status).toBe('EXPIRED')
  })

  it('exige une session', async () => {
    await request(app).get(`/api/projects/${projectId}/proposals`).expect(401)
  })
})
