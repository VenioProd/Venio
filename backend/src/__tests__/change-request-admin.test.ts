import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import * as changeRequestFlow from '../lib/changeRequestFlow.js'
import { createSession } from '../lib/session.js'
import adminChangeRequestRoutes from '../routes/admin/changeRequests.js'
import ChangeRequest from '../models/ChangeRequest.js'
import QuoteProposal from '../models/QuoteProposal.js'
import Notification from '../models/Notification.js'
import AuditLog from '../models/AuditLog.js'
import User from '../models/User.js'
import Project from '../models/Project.js'

let app: Express
let adminId: string
let viewerId: string
let clientId: string
let otherClientId: string
let projectId: string
let otherProjectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function seedRequest(overrides: Record<string, unknown> = {}) {
  return ChangeRequest.create({
    client: clientId,
    title: 'Module de réservation en ligne',
    description: 'Réserver un créneau d’atelier avec acompte.',
    createdBy: clientId,
    createdByName: 'Claire Corbel',
    ...overrides,
  })
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/change-requests', adminChangeRequestRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [admin, viewer, client, otherClient] = await User.create([
    { name: 'Raphael', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN', isActive: true },
    { name: 'Viewer', email: 'viewer@example.test', passwordHash, role: 'VIEWER' },
    { name: 'Claire Corbel', email: 'claire@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Novane', email: 'novane@example.test', passwordHash, role: 'CLIENT' },
  ])
  adminId = String(admin._id)
  viewerId = String(viewer._id)
  clientId = String(client._id)
  otherClientId = String(otherClient._id)
  projectId = String((await Project.create({ name: 'Refonte du site', client: client._id }))._id)
  otherProjectId = String((await Project.create({ name: 'Plateforme', client: otherClient._id }))._id)
})

describe('file admin', () => {
  it('liste toutes les demandes et filtre par statut, client et projet', async () => {
    await seedRequest({ title: 'À qualifier' })
    await seedRequest({ title: 'Sur projet', project: projectId, status: 'EN_COURS' })
    await seedRequest({ title: 'Autre compte', client: otherClientId, createdBy: otherClientId })
    const cookie = await cookieFor(adminId)

    const all = await request(app).get('/api/admin/change-requests').set('Cookie', cookie).expect(200)
    expect(all.body.changeRequests).toHaveLength(3)

    const byStatus = await request(app)
      .get('/api/admin/change-requests?status=EN_COURS')
      .set('Cookie', cookie)
      .expect(200)
    expect(byStatus.body.changeRequests).toHaveLength(1)

    const byClient = await request(app)
      .get(`/api/admin/change-requests?client=${otherClientId}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(byClient.body.changeRequests[0].title).toBe('Autre compte')

    const byProject = await request(app)
      .get(`/api/admin/change-requests?project=${projectId}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(byProject.body.changeRequests[0].title).toBe('Sur projet')
  })

  it('compte les demandes à traiter et en cours pour le badge sidebar', async () => {
    await seedRequest()
    await seedRequest({ status: 'PLANIFIEE' })
    await seedRequest({ status: 'LIVREE' })
    await seedRequest({ status: 'VALIDEE' })

    const response = await request(app)
      .get('/api/admin/change-requests/stats')
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    expect(response.body).toEqual({ aTraiter: 1, enCours: 2 })
  })
})

describe('qualification', () => {
  it('inclut une demande : SOUMISE → PLANIFIEE avec qualification INCLUSE', async () => {
    const created = await seedRequest({ project: projectId })

    const response = await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-include`)
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    expect(response.body.changeRequest.status).toBe('PLANIFIEE')
    expect(response.body.changeRequest.qualification).toBe('INCLUSE')
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_QUALIFIED' })).toBe(1)
    expect(await AuditLog.countDocuments({ action: 'CHANGE_REQUEST_QUALIFIED' })).toBe(1)
  })

  it('crée un devis DRAFT prérempli et lie la demande', async () => {
    const created = await seedRequest({ project: projectId })

    const response = await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-quote`)
      .set('Cookie', await cookieFor(adminId))
      .send({ expiresAt: '2026-09-30T00:00:00.000Z' })
      .expect(200)

    expect(response.body.changeRequest.status).toBe('A_CHIFFRER')
    expect(response.body.changeRequest.qualification).toBe('A_CHIFFRER')
    expect(response.body.proposal.status).toBe('DRAFT')
    expect(response.body.proposal.title).toBe('Module de réservation en ligne')
    expect(response.body.proposal.intro).toBe('Réserver un créneau d’atelier avec acompte.')
    expect(String(response.body.proposal.project)).toBe(projectId)
    expect(String(response.body.proposal.client)).toBe(clientId)
    expect(String(response.body.changeRequest.quoteProposal)).toBe(String(response.body.proposal._id))
  })

  it('pose le projet fourni sur une demande qui n’en avait pas', async () => {
    const created = await seedRequest()

    const response = await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-quote`)
      .set('Cookie', await cookieFor(adminId))
      .send({ projectId })
      .expect(200)

    expect(String(response.body.changeRequest.project)).toBe(projectId)
  })

  it('exige un projet pour chiffrer une demande hors projet', async () => {
    const created = await seedRequest()

    const response = await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-quote`)
      .set('Cookie', await cookieFor(adminId))
      .send({})
      .expect(400)

    expect(response.body.code).toBe('PROJECT_REQUIRED_FOR_QUOTE')
    expect(await QuoteProposal.countDocuments()).toBe(0)
  })

  it('refuse un projet appartenant à un autre compte', async () => {
    const created = await seedRequest()

    await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-quote`)
      .set('Cookie', await cookieFor(adminId))
      .send({ projectId: otherProjectId })
      .expect(422)
  })

  it('refuse avec motif obligatoire, depuis SOUMISE comme depuis A_CHIFFRER', async () => {
    const cookie = await cookieFor(adminId)
    const soumise = await seedRequest()
    const aChiffrer = await seedRequest({ status: 'A_CHIFFRER', qualification: 'A_CHIFFRER' })

    await request(app)
      .post(`/api/admin/change-requests/${soumise._id}/refuse`)
      .set('Cookie', cookie)
      .send({ reason: '   ' })
      .expect(400)

    const first = await request(app)
      .post(`/api/admin/change-requests/${soumise._id}/refuse`)
      .set('Cookie', cookie)
      .send({ reason: 'Hors périmètre de la maintenance' })
      .expect(200)
    expect(first.body.changeRequest.status).toBe('REFUSEE')
    expect(first.body.changeRequest.refusalReason).toBe('Hors périmètre de la maintenance')

    const second = await request(app)
      .post(`/api/admin/change-requests/${aChiffrer._id}/refuse`)
      .set('Cookie', cookie)
      .send({ reason: 'Devis expiré' })
      .expect(200)
    expect(second.body.changeRequest.status).toBe('REFUSEE')
  })
})

describe('compensation de qualify-quote', () => {
  it('ne supprime pas un devis qui a quitté l’état DRAFT pendant la course', async () => {
    const created = await seedRequest({ project: projectId })

    // Simule la course : la transition échoue alors que le devis vient d'être
    // envoyé au client par un autre admin. Le devis engage désormais Venio.
    const spy = vi.spyOn(changeRequestFlow, 'transitionChangeRequest').mockImplementation(async () => {
      await QuoteProposal.updateMany({}, { $set: { status: 'SENT' } })
      return null
    })

    const response = await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-quote`)
      .set('Cookie', await cookieFor(adminId))
      .send({})
      .expect(409)
    spy.mockRestore()

    expect(response.body.code).toBe('INVALID_TRANSITION')
    const survivor = await QuoteProposal.findOne({})
    expect(survivor, 'un devis déjà envoyé ne doit jamais être supprimé').not.toBeNull()
    expect(survivor!.status).toBe('SENT')
  })

  it('supprime le devis resté brouillon quand la transition échoue', async () => {
    const created = await seedRequest({ project: projectId })
    const spy = vi.spyOn(changeRequestFlow, 'transitionChangeRequest').mockResolvedValue(null)

    await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-quote`)
      .set('Cookie', await cookieFor(adminId))
      .send({})
      .expect(409)
    spy.mockRestore()

    expect(await QuoteProposal.countDocuments()).toBe(0)
  })
})

describe('transitions admin', () => {
  it('démarre puis livre une demande planifiée', async () => {
    const cookie = await cookieFor(adminId)
    const created = await seedRequest({ status: 'PLANIFIEE', project: projectId })

    const started = await request(app)
      .post(`/api/admin/change-requests/${created._id}/start`)
      .set('Cookie', cookie)
      .expect(200)
    expect(started.body.changeRequest.status).toBe('EN_COURS')
    // Le client n'est pas notifié au démarrage (décision de la spec).
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_DELIVERED' })).toBe(0)

    const delivered = await request(app)
      .post(`/api/admin/change-requests/${created._id}/deliver`)
      .set('Cookie', cookie)
      .expect(200)
    expect(delivered.body.changeRequest.status).toBe('LIVREE')
    expect(delivered.body.changeRequest.deliveredAt).not.toBeNull()
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_DELIVERED' })).toBe(1)
  })

  it('rejette une transition hors cycle en 409', async () => {
    const cookie = await cookieFor(adminId)
    const soumise = await seedRequest()
    const validee = await seedRequest({ status: 'VALIDEE' })

    const deliverTooEarly = await request(app)
      .post(`/api/admin/change-requests/${soumise._id}/deliver`)
      .set('Cookie', cookie)
      .expect(409)
    expect(deliverTooEarly.body.code).toBe('INVALID_TRANSITION')

    await request(app).post(`/api/admin/change-requests/${validee._id}/start`).set('Cookie', cookie).expect(409)
    await request(app)
      .post(`/api/admin/change-requests/${validee._id}/refuse`)
      .set('Cookie', cookie)
      .send({ reason: 'Trop tard' })
      .expect(409)
  })

  it('répond dans le fil et notifie le compte et l’auteur', async () => {
    const created = await seedRequest()

    const response = await request(app)
      .post(`/api/admin/change-requests/${created._id}/reply`)
      .set('Cookie', await cookieFor(adminId))
      .field('message', 'Nous vous préparons un devis.')
      .expect(200)

    expect(response.body.changeRequest.replies).toHaveLength(1)
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_REPLY', recipient: clientId })).toBe(1)
  })
})

describe('service de fichiers admin', () => {
  it('sert la pièce jointe d’une demande en téléchargement opaque', async () => {
    const filename = `${Date.now()}-piege.html`
    const uploadsDir = path.resolve('uploads/change-requests')
    fs.mkdirSync(uploadsDir, { recursive: true })
    fs.writeFileSync(path.join(uploadsDir, filename), '<script>alert(1)</script>')
    await seedRequest({
      attachments: [{ filename, originalName: 'piege.html', mimetype: 'text/html', size: 25 }],
    })

    const response = await request(app)
      .get(`/api/admin/change-requests/files/${filename}`)
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    expect(response.headers['content-type']).toBe('application/octet-stream')
    expect(response.headers['content-disposition']).toMatch(/^attachment;/)
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })

  it('renvoie 404 pour un fichier qui n’appartient à aucune demande', async () => {
    await request(app)
      .get('/api/admin/change-requests/files/inconnu.png')
      .set('Cookie', await cookieFor(adminId))
      .expect(404)
  })

  it('refuse le service de fichiers à un admin sans view_change_requests', async () => {
    await User.findByIdAndUpdate(viewerId, { deniedPermissions: ['view_change_requests'] })
    await request(app)
      .get('/api/admin/change-requests/files/quelconque.png')
      .set('Cookie', await cookieFor(viewerId))
      .expect(403)
  })
})

describe('RBAC', () => {
  it('refuse la file à un admin sans view_change_requests', async () => {
    await User.findByIdAndUpdate(viewerId, { deniedPermissions: ['view_change_requests'] })
    await request(app)
      .get('/api/admin/change-requests')
      .set('Cookie', await cookieFor(viewerId))
      .expect(403)
  })

  it('refuse les actions à un admin sans manage_change_requests', async () => {
    const created = await seedRequest()
    await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-include`)
      .set('Cookie', await cookieFor(viewerId))
      .expect(403)
  })

  it('refuse qualify-quote à un admin sans manage_billing', async () => {
    const created = await seedRequest({ project: projectId })
    await User.findByIdAndUpdate(viewerId, {
      grantedPermissions: ['view_change_requests', 'manage_change_requests'],
    })
    await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-quote`)
      .set('Cookie', await cookieFor(viewerId))
      .send({})
      .expect(403)
  })

  it('refuse un client sur les routes admin', async () => {
    await request(app)
      .get('/api/admin/change-requests')
      .set('Cookie', await cookieFor(clientId))
      .expect(403)
  })
})
