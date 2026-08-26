import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import clientVaultRoutes from '../routes/client/vault.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectMember from '../models/ProjectMember.js'
import BillingDocument from '../models/BillingDocument.js'
import ProjectItem from '../models/ProjectItem.js'
import Document from '../models/Document.js'
import QuoteProposal from '../models/QuoteProposal.js'

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/client', clientVaultRoutes)
})

afterAll(teardownMongo)
beforeEach(clearDb)

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function makeClient(email: string) {
  const passwordHash = await bcrypt.hash('x', 4)
  return User.create({ name: 'Client', email, passwordHash, role: 'CLIENT' })
}

describe('GET /api/client/documents', () => {
  it('agrège BillingDocument visibles, ProjectItem téléchargeables et Document legacy du propriétaire', async () => {
    const owner = await makeClient('owner@example.test')
    const project = await Project.create({ name: 'Site vitrine', client: owner._id })

    await BillingDocument.create({
      type: 'INVOICE',
      number: 'FAC-001',
      project: project._id,
      client: owner._id,
      status: 'ISSUED',
      issuedAt: new Date(),
      pdfStoragePath: 'uploads/billing/x/FAC-001.pdf',
      createdBy: owner._id,
    })
    // Draft: ne doit pas apparaître
    await BillingDocument.create({
      type: 'QUOTE',
      number: 'DEV-DRAFT',
      project: project._id,
      client: owner._id,
      status: 'DRAFT',
      pdfStoragePath: null,
      createdBy: owner._id,
    })

    await ProjectItem.create({
      project: project._id,
      type: 'LIVRABLE',
      title: 'Maquette v1',
      isVisible: true,
      isDownloadable: true,
      file: {
        originalName: 'maquette.pdf',
        storagePath: 'uploads/items/x.pdf',
        mimeType: 'application/pdf',
        size: 100,
      },
      createdBy: owner._id,
    })
    // isVisible: false -> absent
    await ProjectItem.create({
      project: project._id,
      type: 'LIVRABLE',
      title: 'Interne',
      isVisible: false,
      isDownloadable: true,
      file: { originalName: 'x.pdf', storagePath: 'uploads/items/y.pdf', mimeType: 'application/pdf', size: 1 },
      createdBy: owner._id,
    })
    // isDownloadable: false -> absent
    await ProjectItem.create({
      project: project._id,
      type: 'CONTRAT',
      title: 'Contrat',
      isVisible: true,
      isDownloadable: false,
      file: { originalName: 'c.pdf', storagePath: 'uploads/items/z.pdf', mimeType: 'application/pdf', size: 1 },
      createdBy: owner._id,
    })
    // Sans fichier -> absent
    await ProjectItem.create({
      project: project._id,
      type: 'NOTE',
      title: 'Note',
      isVisible: true,
      isDownloadable: true,
      createdBy: owner._id,
    })

    await Document.create({
      project: project._id,
      type: 'FICHIER_PROJET',
      originalName: 'brief.pdf',
      storagePath: 'uploads/x/brief.pdf',
      mimeType: 'application/pdf',
      uploadedBy: owner._id,
    })

    const response = await request(app)
      .get('/api/client/documents')
      .set('Cookie', await cookieFor(String(owner._id)))
      .expect(200)

    expect(response.body.documents).toHaveLength(3)
    const types = response.body.documents.map((d: { type: string }) => d.type).sort()
    expect(types).toEqual(['FACTURE', 'FICHIER_PROJET', 'LIVRABLE'])
    for (const doc of response.body.documents) {
      expect(doc.storagePath).toBeUndefined()
      expect(doc.pdfStoragePath).toBeUndefined()
    }
  })

  it('un collaborateur voit les documents du projet partagé, un tiers ne voit rien', async () => {
    const owner = await makeClient('owner2@example.test')
    const collaborator = await makeClient('collab@example.test')
    const outsider = await makeClient('outsider@example.test')
    const project = await Project.create({ name: 'Projet partagé', client: owner._id })
    await ProjectMember.create({ project: project._id, user: collaborator._id, role: 'VIEWER', createdBy: owner._id })

    await Document.create({
      project: project._id,
      type: 'FICHIER_PROJET',
      originalName: 'partage.pdf',
      storagePath: 'uploads/x/partage.pdf',
      mimeType: 'application/pdf',
      uploadedBy: owner._id,
    })

    const collabResponse = await request(app)
      .get('/api/client/documents')
      .set('Cookie', await cookieFor(String(collaborator._id)))
      .expect(200)
    expect(collabResponse.body.documents).toHaveLength(1)

    const outsiderResponse = await request(app)
      .get('/api/client/documents')
      .set('Cookie', await cookieFor(String(outsider._id)))
      .expect(200)
    expect(outsiderResponse.body.documents).toHaveLength(0)
  })

  it('filtre par type, projectId (y compris étranger -> vide) et q', async () => {
    const owner = await makeClient('owner3@example.test')
    const otherOwner = await makeClient('other@example.test')
    const project = await Project.create({ name: 'Filtrage', client: owner._id })
    const foreignProject = await Project.create({ name: 'Étranger', client: otherOwner._id })

    await Document.create({
      project: project._id,
      type: 'FICHIER_PROJET',
      originalName: 'rapport-final.pdf',
      storagePath: 'uploads/x/a.pdf',
      mimeType: 'application/pdf',
      uploadedBy: owner._id,
    })
    await Document.create({
      project: project._id,
      type: 'DEVIS',
      originalName: 'devis.pdf',
      storagePath: 'uploads/x/b.pdf',
      mimeType: 'application/pdf',
      uploadedBy: owner._id,
    })

    const cookie = await cookieFor(String(owner._id))

    const byType = await request(app).get('/api/client/documents?type=DEVIS').set('Cookie', cookie).expect(200)
    expect(byType.body.documents).toHaveLength(1)
    expect(byType.body.documents[0].type).toBe('DEVIS')

    const byForeignProject = await request(app)
      .get(`/api/client/documents?projectId=${foreignProject._id}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(byForeignProject.body.documents).toHaveLength(0)

    const byQuery = await request(app).get('/api/client/documents?q=rapport').set('Cookie', cookie).expect(200)
    expect(byQuery.body.documents).toHaveLength(1)
    expect(byQuery.body.documents[0].title).toBe('rapport-final.pdf')
  })
})

describe('GET /api/client/action-items', () => {
  it('inclut une proposition SENT du propriétaire avec le bon montant, exclut une proposition expirée sans la muter', async () => {
    const owner = await makeClient('owner4@example.test')
    const project = await Project.create({ name: 'Devis', client: owner._id })

    await QuoteProposal.create({
      project: project._id,
      client: owner._id,
      createdBy: owner._id,
      title: 'Refonte',
      status: 'SENT',
      expiresAt: new Date(Date.now() + 86400000),
      lines: [{ description: 'Ligne', quantity: 1, unitPrice: 1000, taxRate: 20 }],
    })
    const expired = await QuoteProposal.create({
      project: project._id,
      client: owner._id,
      createdBy: owner._id,
      title: 'Expirée',
      status: 'SENT',
      expiresAt: new Date(Date.now() - 86400000),
      lines: [{ description: 'Ligne', quantity: 1, unitPrice: 500, taxRate: 0 }],
    })

    const response = await request(app)
      .get('/api/client/action-items')
      .set('Cookie', await cookieFor(String(owner._id)))
      .expect(200)

    const devisItems = response.body.items.filter((i: { type: string }) => i.type === 'DEVIS_A_SIGNER')
    expect(devisItems).toHaveLength(1)
    expect(devisItems[0].amount).toBe(1200)

    const stillSent = await QuoteProposal.findById(expired._id).select('status').lean()
    expect(stillSent?.status).toBe('SENT')
  })

  it('exclut une proposition dont le client est seulement membre, inclut une facture ISSUED et exclut PAID/DRAFT', async () => {
    const owner = await makeClient('owner5@example.test')
    const collaborator = await makeClient('collab2@example.test')
    const project = await Project.create({ name: 'Mixte', client: owner._id })
    await ProjectMember.create({ project: project._id, user: collaborator._id, role: 'EDITOR', createdBy: owner._id })

    await QuoteProposal.create({
      project: project._id,
      client: owner._id,
      createdBy: owner._id,
      title: 'Pour le propriétaire',
      status: 'SENT',
      expiresAt: null,
      lines: [],
    })
    await BillingDocument.create({
      type: 'INVOICE',
      number: 'FAC-100',
      project: project._id,
      client: owner._id,
      status: 'ISSUED',
      total: 500,
      createdBy: owner._id,
    })
    await BillingDocument.create({
      type: 'INVOICE',
      number: 'FAC-101',
      project: project._id,
      client: owner._id,
      status: 'PAID',
      total: 300,
      createdBy: owner._id,
    })

    const collabResponse = await request(app)
      .get('/api/client/action-items')
      .set('Cookie', await cookieFor(String(collaborator._id)))
      .expect(200)
    expect(collabResponse.body.items).toHaveLength(0)

    const ownerResponse = await request(app)
      .get('/api/client/action-items')
      .set('Cookie', await cookieFor(String(owner._id)))
      .expect(200)
    const types = ownerResponse.body.items.map((i: { type: string }) => i.type).sort()
    expect(types).toEqual(['DEVIS_A_SIGNER', 'FACTURE_A_PAYER'])
    const facture = ownerResponse.body.items.find((i: { type: string }) => i.type === 'FACTURE_A_PAYER')
    expect(facture.amount).toBe(500)
  })
})
