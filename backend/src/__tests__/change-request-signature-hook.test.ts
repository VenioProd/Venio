import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import clientQuoteRoutes from '../routes/client/quotes.js'
import adminQuoteRoutes from '../routes/admin/quoteProposals.js'
import ChangeRequest from '../models/ChangeRequest.js'
import QuoteProposal from '../models/QuoteProposal.js'
import Notification from '../models/Notification.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import { promoteChangeRequestOnSignature } from '../lib/changeRequestFlow.js'

// vi.spyOn ne fonctionne pas sur un namespace de module ESM : on remplace le
// module en gardant l'implémentation réelle par défaut, et on ne force le rejet
// que dans le test qui l'exige.
vi.mock('../lib/changeRequestFlow.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/changeRequestFlow.js')>('../lib/changeRequestFlow.js')
  return { ...actual, promoteChangeRequestOnSignature: vi.fn(actual.promoteChangeRequestOnSignature) }
})

let app: Express
let adminId: string
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
    title: 'Module de réservation',
    status: 'SENT',
    lines: [{ description: 'Développement', quantity: 1, unitPrice: 1240, taxRate: 20, isOptional: false, order: 0 }],
    ...overrides,
  })
}

async function createLinkedRequest(proposalId: unknown, overrides: Record<string, unknown> = {}) {
  return ChangeRequest.create({
    client: ownerId,
    project: projectId,
    title: 'Module de réservation en ligne',
    description: 'Réserver un créneau avec acompte.',
    createdBy: ownerId,
    createdByName: 'Owner',
    status: 'A_CHIFFRER',
    qualification: 'A_CHIFFRER',
    quoteProposal: proposalId,
    ...overrides,
  })
}

const CONSENT = { signerName: 'Claire Corbel', consent: true }

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/projects', clientQuoteRoutes)
  app.use('/api/admin/quote-proposals', adminQuoteRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  // clearAllMocks (et non resetAllMocks) : l'implémentation réelle du mock est conservée.
  vi.clearAllMocks()
  const passwordHash = await bcrypt.hash('test', 4)
  const [owner, admin] = await User.create([
    { name: 'Owner', email: 'owner@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Raphael', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN', isActive: true },
  ])
  ownerId = String(owner._id)
  adminId = String(admin._id)
  projectId = String((await Project.create({ name: 'Refonte du site', client: owner._id }))._id)
})

describe('signature → PLANIFIEE', () => {
  it('planifie la demande liée et notifie les super admins', async () => {
    const proposal = await createProposal()
    const changeRequest = await createLinkedRequest(proposal._id)

    await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(201)

    // Le hook est asynchrone et détaché de la réponse.
    await vi.waitFor(async () => {
      expect((await ChangeRequest.findById(changeRequest._id))!.status).toBe('PLANIFIEE')
    })
    const promoted = await ChangeRequest.findById(changeRequest._id)
    expect(promoted!.statusHistory.at(-1)!.status).toBe('PLANIFIEE')
    expect(promoted!.statusHistory.at(-1)!.note).toBe('Devis signé')
    await vi.waitFor(async () => {
      expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_PLANNED' })).toBe(1)
    })
  })

  it('signe sans effet parasite quand aucune demande n’est liée', async () => {
    const proposal = await createProposal()

    await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(201)

    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_PLANNED' })).toBe(0)
  })

  it('laisse une demande refusée intacte', async () => {
    const proposal = await createProposal()
    const changeRequest = await createLinkedRequest(proposal._id, {
      status: 'REFUSEE',
      refusalReason: 'Devis expiré',
    })

    await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(201)

    expect((await ChangeRequest.findById(changeRequest._id))!.status).toBe('REFUSEE')
  })

  it('ne fait pas échouer la signature si le hook lève', async () => {
    const proposal = await createProposal()
    await createLinkedRequest(proposal._id)
    vi.mocked(promoteChangeRequestOnSignature).mockRejectedValueOnce(new Error('mongo down'))

    const response = await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(201)

    expect(response.body.billingDocument.number).toMatch(/^DEV-/)
    expect((await QuoteProposal.findById(proposal._id))!.status).toBe('SIGNED')
  })
})

describe('envoi du devis lié', () => {
  it('notifie le client quand le devis d’une demande passe en SENT', async () => {
    const proposal = await createProposal({ status: 'DRAFT' })
    await createLinkedRequest(proposal._id)

    await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/send`)
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    await vi.waitFor(async () => {
      expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_QUOTE_SENT', recipient: ownerId })).toBe(1)
    })
    const notification = await Notification.findOne({ type: 'CHANGE_REQUEST_QUOTE_SENT' })
    expect(notification!.link).toBe(`/espace-client/projets/${projectId}/propositions/${proposal._id}`)
  })

  it('n’émet rien pour un devis sans demande liée', async () => {
    const proposal = await createProposal({ status: 'DRAFT' })

    await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/send`)
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_QUOTE_SENT' })).toBe(0)
  })
})
