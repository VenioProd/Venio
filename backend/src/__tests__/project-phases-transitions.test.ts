import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminProjectRoutes from '../routes/admin/projects/index.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectPhase from '../models/ProjectPhase.js'
import ActivityLog from '../models/ActivityLog.js'
import Notification from '../models/Notification.js'

let app: Express
let adminId: string
let adminCookie: string
let clientId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

const post = (path: string) =>
  request(app).post(`/api/admin/projects/${projectId}/phases${path}`).set('Cookie', adminCookie)

async function createPhase(overrides: Record<string, unknown> = {}) {
  return ProjectPhase.create({ project: projectId, title: 'Cadrage', createdBy: adminId, ...overrides })
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/projects', adminProjectRoutes)
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
  adminCookie = await cookieFor(adminId)
  clientId = String(client._id)
  const project = await Project.create({ name: 'Site', client: client._id })
  projectId = String(project._id)
})

describe('verrouillage du démarrage', () => {
  it('refuse 409 PHASE_LOCKED tant que le jalon précédent n’est pas validé, puis accepte', async () => {
    const jalon = await createPhase({ title: 'Maquettes', order: 0, requiresClientValidation: true })
    const suivante = await createPhase({ title: 'Développement', order: 1 })

    const refused = await post(`/${suivante._id}/start`).expect(409)
    expect(refused.body.code).toBe('PHASE_LOCKED')
    expect(refused.body.blockingPhase).toEqual({ _id: String(jalon._id), title: 'Maquettes' })

    jalon.status = 'TERMINEE'
    jalon.validation.validatedByName = 'Claire Corbel'
    jalon.validation.validatedAt = new Date()
    await jalon.save()

    const accepted = await post(`/${suivante._id}/start`).expect(200)
    expect(accepted.body.phase.status).toBe('EN_COURS')
  })

  it('regarde toutes les étapes précédentes, pas seulement l’immédiate', async () => {
    await createPhase({ title: 'Cadrage', order: 0, requiresClientValidation: true })
    await createPhase({ title: 'Ateliers', order: 1, status: 'TERMINEE' })
    const derniere = await createPhase({ title: 'Développement', order: 2 })

    const refused = await post(`/${derniere._id}/start`).expect(409)
    expect(refused.body.blockingPhase.title).toBe('Cadrage')
  })

  it('journalise le changement de statut', async () => {
    const phase = await createPhase()
    await post(`/${phase._id}/start`).expect(200)

    const log = await ActivityLog.findOne({ project: projectId, action: 'PHASE_STATUS_CHANGED' })
    expect(log).not.toBeNull()
    expect(log!.summary).toContain('Cadrage')
    expect(log!.metadata).toMatchObject({ from: 'A_VENIR', to: 'EN_COURS' })
  })
})

describe('demande de validation client', () => {
  it('passe l’étape en attente et notifie le client propriétaire', async () => {
    const phase = await createPhase({ status: 'EN_COURS', requiresClientValidation: true })

    const response = await post(`/${phase._id}/request-validation`).expect(200)
    expect(response.body.phase.status).toBe('EN_ATTENTE_VALIDATION')

    const notification = await Notification.findOne({ recipient: clientId, type: 'PHASE_VALIDATION_REQUESTED' })
    expect(notification).not.toBeNull()
    expect(notification!.link).toBe(`/espace-client/projets/${projectId}?tab=progress`)
    expect(notification!.metadata).toMatchObject({ projectId, phaseId: String(phase._id) })
  })

  it('refuse 409 VALIDATION_NOT_REQUIRED hors jalon client', async () => {
    const phase = await createPhase({ status: 'EN_COURS' })
    const response = await post(`/${phase._id}/request-validation`).expect(409)
    expect(response.body.code).toBe('VALIDATION_NOT_REQUIRED')
  })
})

describe('fin d’étape et retours arrière', () => {
  it('termine une étape sans validation client', async () => {
    const phase = await createPhase({ status: 'EN_COURS' })
    const response = await post(`/${phase._id}/complete`).expect(200)
    expect(response.body.phase.status).toBe('TERMINEE')
  })

  it('refuse 409 CLIENT_VALIDATION_REQUIRED de court-circuiter un jalon client', async () => {
    const phase = await createPhase({ status: 'EN_COURS', requiresClientValidation: true })
    const response = await post(`/${phase._id}/complete`).expect(409)
    expect(response.body.code).toBe('CLIENT_VALIDATION_REQUIRED')
  })

  it('annule une demande de validation', async () => {
    const phase = await createPhase({ status: 'EN_ATTENTE_VALIDATION', requiresClientValidation: true })
    const response = await post(`/${phase._id}/cancel-validation-request`).expect(200)
    expect(response.body.phase.status).toBe('EN_COURS')
    expect(response.body.phase.revisionRequests).toHaveLength(0)
  })

  it('rouvre une étape terminée non validée mais refuse 409 une étape validée', async () => {
    const libre = await createPhase({ title: 'Recette', status: 'TERMINEE' })
    const reverted = await post(`/${libre._id}/revert`).expect(200)
    expect(reverted.body.phase.status).toBe('EN_COURS')

    const validee = await createPhase({
      title: 'Maquettes',
      status: 'TERMINEE',
      validation: { validatedByName: 'Claire', validatedAt: new Date() },
    })
    const refused = await post(`/${validee._id}/revert`).expect(409)
    expect(refused.body.code).toBe('VALIDATED_PHASE_IMMUTABLE')
  })

  it('refuse 409 INVALID_TRANSITION une transition non listée', async () => {
    const phase = await createPhase({ status: 'A_VENIR' })
    const response = await post(`/${phase._id}/complete`).expect(409)
    expect(response.body.code).toBe('INVALID_TRANSITION')
  })
})

describe('résolution des demandes de retouches', () => {
  it('horodate la résolution puis refuse 409 la seconde', async () => {
    const phase = await createPhase({ status: 'EN_COURS' })
    phase.revisionRequests.push({
      requestedBy: clientId,
      requestedByName: 'Claire Corbel',
      comment: 'Header trop dense',
    } as never)
    await phase.save()
    const revisionId = String(phase.revisionRequests[0]._id)

    const response = await post(`/${phase._id}/revisions/${revisionId}/resolve`).expect(200)
    expect(response.body.phase.revisionRequests[0].resolvedAt).not.toBeNull()

    const stored = await ProjectPhase.findById(phase._id)
    expect(String(stored!.revisionRequests[0].resolvedBy)).toBe(adminId)

    const again = await post(`/${phase._id}/revisions/${revisionId}/resolve`).expect(409)
    expect(again.body.code).toBe('REVISION_ALREADY_RESOLVED')
  })

  it('renvoie 404 sur une demande inconnue', async () => {
    const phase = await createPhase()
    await post(`/${phase._id}/revisions/64b7f0000000000000000000/resolve`).expect(404)
  })
})
