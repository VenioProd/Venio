import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import clientQuoteRoutes from '../routes/client/quotes.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import QuoteProposal from '../models/QuoteProposal.js'
import BillingDocument from '../models/BillingDocument.js'
import ProjectItem from '../models/ProjectItem.js'

let app: Express
let ownerId: string
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

const CONSENT = { signerName: 'Jean Client', consent: true }

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
  const owner = await User.create({ name: 'Owner', email: 'owner@example.test', passwordHash, role: 'CLIENT' })
  ownerId = String(owner._id)
  const project = await Project.create({ name: 'Site', client: owner._id })
  projectId = String(project._id)
})

describe('signature d’une proposition', () => {
  it('produit un BillingDocument avec les seules lignes retenues', async () => {
    const proposal = await createProposal()
    const optionalId = String(proposal.lines[1]!._id)
    await QuoteProposal.findByIdAndUpdate(proposal._id, { selectedOptionalLineIds: [optionalId] })

    const response = await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(201)

    expect(response.body.billingDocument.type).toBe('QUOTE')
    expect(response.body.billingDocument.number).toMatch(/^DEV-/)
    expect(response.body.billingDocument.lines).toHaveLength(2)
    expect(response.body.billingDocument.total).toBe(3120)

    const signed = await QuoteProposal.findById(proposal._id)
    expect(signed!.status).toBe('SIGNED')
    expect(signed!.signature.signerName).toBe('Jean Client')
    expect(signed!.signature.signedAt).toBeInstanceOf(Date)
    expect(signed!.signature.ip).not.toBe('')
    expect(signed!.billingDocument).not.toBeNull()
  })

  it('annexe le cahier des charges figé au projet', async () => {
    const proposal = await createProposal()
    await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(201)

    const item = await ProjectItem.findOne({ project: projectId, type: 'CAHIER_DES_CHARGES' })
    expect(item).not.toBeNull()
  })

  it('refuse sans consentement explicite', async () => {
    const proposal = await createProposal()
    await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ signerName: 'Jean Client', consent: false })
      .expect(422)
  })

  it('refuse tant qu’une question requise est sans réponse', async () => {
    const proposal = await createProposal({
      questions: [{ type: 'text', label: 'Délai ?', required: true, order: 0 }],
    })
    const response = await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(422)

    expect(response.body.code).toBe('MISSING_REQUIRED_ANSWERS')
    expect(response.body.missingQuestionIds).toHaveLength(1)
  })

  it('refuse une proposition expirée', async () => {
    const proposal = await createProposal({ expiresAt: new Date(Date.now() - 1000) })
    const response = await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(410)

    expect(response.body.code).toBe('PROPOSAL_EXPIRED')
  })

  it('ne signe qu’une fois malgré deux appels concurrents', async () => {
    const proposal = await createProposal()
    const cookie = await cookieFor(ownerId)

    const results = await Promise.all([
      request(app)
        .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
        .set('Cookie', cookie)
        .send(CONSENT),
      request(app)
        .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
        .set('Cookie', cookie)
        .send(CONSENT),
    ])

    const statuses = results.map((r) => r.status).sort()
    expect(statuses).toEqual([201, 409])
    expect(await BillingDocument.countDocuments({ project: projectId })).toBe(1)
  })

  it('rend la proposition immuable après signature', async () => {
    const proposal = await createProposal()
    await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(201)

    await request(app)
      .patch(`/api/projects/${projectId}/proposals/${proposal._id}/selection`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ selectedOptionalLineIds: [] })
      .expect(409)
  })
})
