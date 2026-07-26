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
import BillingDocument from '../models/BillingDocument.js'

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

describe('mutations client', () => {
  it('enregistre les réponses et régénère le cahier des charges', async () => {
    const proposal = await createProposal({
      questions: [{ type: 'text', label: 'Délai ?', required: true, order: 0 }],
    })
    const questionId = String(proposal.questions[0]!._id)

    const response = await request(app)
      .patch(`/api/projects/${projectId}/proposals/${proposal._id}/answers`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ answers: [{ question: questionId, value: 'Trois mois' }] })
      .expect(200)

    expect(response.body.proposal.answers[0].value).toBe('Trois mois')
    expect(response.body.proposal.specification.content).toContain('Trois mois')
  })

  it('recalcule le total après un arbitrage et ignore tout montant posté', async () => {
    const proposal = await createProposal()
    const optionalId = String(proposal.lines[1]!._id)

    const response = await request(app)
      .patch(`/api/projects/${projectId}/proposals/${proposal._id}/selection`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ selectedOptionalLineIds: [optionalId], total: 1 })
      .expect(200)

    expect(response.body.totals).toEqual({ subtotal: 2600, taxTotal: 520, total: 3120 })
  })

  it('rejette la sélection d’une ligne obligatoire', async () => {
    const proposal = await createProposal()
    const mandatoryId = String(proposal.lines[0]!._id)

    const response = await request(app)
      .patch(`/api/projects/${projectId}/proposals/${proposal._id}/selection`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ selectedOptionalLineIds: [mandatoryId] })
      .expect(422)

    expect(response.body.code).toBe('INVALID_LINE_SELECTION')
  })

  it('interdit à un collaborateur invité d’arbitrer', async () => {
    const proposal = await createProposal()
    await request(app)
      .patch(`/api/projects/${projectId}/proposals/${proposal._id}/selection`)
      .set('Cookie', await cookieFor(viewerId))
      .send({ selectedOptionalLineIds: [] })
      .expect(403)
  })

  it('refuse toute mutation sur une proposition signée', async () => {
    const proposal = await createProposal({ status: 'SIGNED' })
    await request(app)
      .patch(`/api/projects/${projectId}/proposals/${proposal._id}/selection`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ selectedOptionalLineIds: [] })
      .expect(409)
  })
})

describe('vitrine facturation', () => {
  it('expose les documents émis et masque brouillons et annulés', async () => {
    await BillingDocument.create([
      { type: 'INVOICE', number: 'FAC-001', project: projectId, client: ownerId, status: 'PAID', createdBy: ownerId },
      { type: 'QUOTE', number: 'DEV-001', project: projectId, client: ownerId, status: 'DRAFT', createdBy: ownerId },
      {
        type: 'QUOTE',
        number: 'DEV-002',
        project: projectId,
        client: ownerId,
        status: 'CANCELLED',
        createdBy: ownerId,
      },
    ])

    const response = await request(app)
      .get(`/api/projects/${projectId}/billing`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)

    expect(response.body.documents).toHaveLength(1)
    expect(response.body.documents[0].number).toBe('FAC-001')
  })

  // Le corps est asserté, pas seulement le statut : un 404 par défaut d'Express
  // sur une route absente passerait autrement pour un contrôle d'accès réussi.
  it('refuse un client étranger au projet', async () => {
    const response = await request(app)
      .get(`/api/projects/${projectId}/billing`)
      .set('Cookie', await cookieFor(outsiderId))
      .expect(404)

    expect(response.body.error).toBe('Projet non trouvé')
  })

  it('renvoie 404 quand le PDF n’a pas été généré', async () => {
    const doc = await BillingDocument.create({
      type: 'INVOICE',
      number: 'FAC-010',
      project: projectId,
      client: ownerId,
      status: 'SENT',
      createdBy: ownerId,
    })

    const response = await request(app)
      .get(`/api/projects/${projectId}/billing/${doc._id}/pdf`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(404)

    expect(response.body.error).toBe('Document non disponible')
  })
})
