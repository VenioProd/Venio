import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminQuoteRoutes from '../routes/admin/quoteProposals.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import QuoteProposal from '../models/QuoteProposal.js'
import BillingDocument from '../models/BillingDocument.js'

let app: Express
let adminId: string
let clientId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/quote-proposals', adminQuoteRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [admin, client] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN' },
    { name: 'Client', email: 'client@example.test', passwordHash, role: 'CLIENT' },
  ])
  adminId = String(admin._id)
  clientId = String(client._id)
  const project = await Project.create({ name: 'Site', client: client._id })
  projectId = String(project._id)
})

describe('reprise de génération', () => {
  it('reconstruit le document manquant d’une proposition signée', async () => {
    const proposal = await QuoteProposal.create({
      project: projectId,
      client: clientId,
      createdBy: adminId,
      title: 'Refonte',
      status: 'SIGNED',
      billingDocument: null,
      lines: [{ description: 'Conception', quantity: 1, unitPrice: 1000, taxRate: 20, isOptional: false, order: 0 }],
    })

    await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/rebuild-document`)
      .set('Cookie', await cookieFor(adminId))
      .expect(201)

    expect((await QuoteProposal.findById(proposal._id))!.billingDocument).not.toBeNull()
    expect(await BillingDocument.countDocuments({ project: projectId })).toBe(1)
  })

  it('est idempotent et ne consomme pas un second numéro', async () => {
    const proposal = await QuoteProposal.create({
      project: projectId,
      client: clientId,
      createdBy: adminId,
      title: 'Refonte',
      status: 'SIGNED',
      lines: [{ description: 'Conception', quantity: 1, unitPrice: 1000, taxRate: 20, isOptional: false, order: 0 }],
    })
    const cookie = await cookieFor(adminId)

    const first = await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/rebuild-document`)
      .set('Cookie', cookie)
      .expect(201)
    const second = await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/rebuild-document`)
      .set('Cookie', cookie)
      .expect(201)

    expect(second.body.billingDocument.number).toBe(first.body.billingDocument.number)
    expect(await BillingDocument.countDocuments({ project: projectId })).toBe(1)
  })

  it('refuse une proposition non signée', async () => {
    const proposal = await QuoteProposal.create({
      project: projectId,
      client: clientId,
      createdBy: adminId,
      title: 'Brouillon',
      status: 'DRAFT',
    })
    await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/rebuild-document`)
      .set('Cookie', await cookieFor(adminId))
      .expect(409)
  })

  it('refuse une session client', async () => {
    const proposal = await QuoteProposal.create({
      project: projectId,
      client: clientId,
      createdBy: adminId,
      title: 'Refonte',
      status: 'SIGNED',
    })
    await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/rebuild-document`)
      .set('Cookie', await cookieFor(clientId))
      .expect(403)
  })
})
