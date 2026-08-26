import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminProjectRoutes from '../routes/admin/projects/index.js'
import clientPhaseRoutes from '../routes/client/projectPhases.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectPhase from '../models/ProjectPhase.js'
import Notification from '../models/Notification.js'
import { isPhaseValidated } from '../lib/projectPhases.js'

let app: Express
let adminId: string
let adminCookie: string
let ownerId: string
let ownerCookie: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function waitingPhase() {
  return ProjectPhase.create({
    project: projectId,
    title: 'Maquettes',
    createdBy: adminId,
    requiresClientValidation: true,
    status: 'EN_ATTENTE_VALIDATION',
  })
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/projects', adminProjectRoutes)
  app.use('/api/projects', clientPhaseRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [admin, owner] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN' },
    { name: 'Claire Corbel', email: 'owner@example.test', passwordHash, role: 'CLIENT' },
  ])
  adminId = String(admin._id)
  ownerId = String(owner._id)
  adminCookie = await cookieFor(adminId)
  ownerCookie = await cookieFor(ownerId)
  const project = await Project.create({ name: 'Site', client: owner._id, assignedTo: admin._id })
  projectId = String(project._id)
})

describe('une étape ne peut pas être validée deux fois', () => {
  it('n’accepte qu’une seule des deux validations simultanées', async () => {
    const phase = await waitingPhase()
    const validate = () =>
      request(app).post(`/api/projects/${projectId}/phases/${phase._id}/validate`).set('Cookie', ownerCookie)

    const responses = await Promise.all([validate(), validate()])
    const statuses = responses.map((r) => r.status).sort()

    expect(statuses).toEqual([200, 409])
    expect(await Notification.countDocuments({ type: 'PHASE_VALIDATED' })).toBe(1)
  })
})

describe('validation et demande de retouches simultanées', () => {
  it('ne laisse jamais une étape validée repartir en production', async () => {
    const phase = await waitingPhase()

    const responses = await Promise.all([
      request(app).post(`/api/projects/${projectId}/phases/${phase._id}/validate`).set('Cookie', ownerCookie),
      request(app)
        .post(`/api/projects/${projectId}/phases/${phase._id}/revisions`)
        .set('Cookie', ownerCookie)
        .send({ comment: 'Header trop dense' }),
    ])

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])

    const stored = await ProjectPhase.findById(phase._id)
    // L'invariant : une étape validée est TERMINEE, et une étape rouverte n'est pas validée.
    if (isPhaseValidated(stored!)) {
      expect(stored!.status).toBe('TERMINEE')
      expect(stored!.revisionRequests).toHaveLength(0)
    } else {
      expect(stored!.status).toBe('EN_COURS')
      expect(stored!.revisionRequests).toHaveLength(1)
    }
  })
})

describe('résolution simultanée d’une demande de retouches', () => {
  it('n’accepte qu’un seul traitement', async () => {
    const phase = await ProjectPhase.create({
      project: projectId,
      title: 'Maquettes',
      createdBy: adminId,
      status: 'EN_COURS',
    })
    phase.revisionRequests.push({
      requestedBy: ownerId,
      requestedByName: 'Claire Corbel',
      comment: 'Header trop dense',
    } as never)
    await phase.save()
    const revisionId = String(phase.revisionRequests[0]._id)

    const resolve = () =>
      request(app)
        .post(`/api/admin/projects/${projectId}/phases/${phase._id}/revisions/${revisionId}/resolve`)
        .set('Cookie', adminCookie)

    const responses = await Promise.all([resolve(), resolve()])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
  })
})

describe('transitions admin simultanées', () => {
  it('n’applique qu’une fois une transition demandée deux fois', async () => {
    const phase = await ProjectPhase.create({
      project: projectId,
      title: 'Cadrage',
      createdBy: adminId,
      status: 'EN_COURS',
    })
    const complete = () =>
      request(app).post(`/api/admin/projects/${projectId}/phases/${phase._id}/complete`).set('Cookie', adminCookie)

    const responses = await Promise.all([complete(), complete()])

    // Selon l'entrelacement, la perdante est refusée pour conflit d'écriture
    // (PHASE_CONFLICT) ou pour transition invalide — dans les deux cas 409.
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    const stored = await ProjectPhase.findById(phase._id)
    expect(stored!.status).toBe('TERMINEE')
  })

  it('refuse de démarrer deux fois la même étape', async () => {
    const phase = await ProjectPhase.create({
      project: projectId,
      title: 'Cadrage',
      createdBy: adminId,
      status: 'A_VENIR',
    })
    const start = () =>
      request(app).post(`/api/admin/projects/${projectId}/phases/${phase._id}/start`).set('Cookie', adminCookie)

    const responses = await Promise.all([start(), start()])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    expect((await ProjectPhase.findById(phase._id))!.status).toBe('EN_COURS')
  })
})

describe('modification concurrente d’une étape en cours de validation', () => {
  it('refuse le PATCH dont la cible vient d’être validée', async () => {
    const phase = await waitingPhase()

    const [validateRes, patchRes] = await Promise.all([
      request(app).post(`/api/projects/${projectId}/phases/${phase._id}/validate`).set('Cookie', ownerCookie),
      request(app)
        .patch(`/api/admin/projects/${projectId}/phases/${phase._id}`)
        .set('Cookie', adminCookie)
        .send({ title: 'Réécriture après coup' }),
    ])

    const stored = await ProjectPhase.findById(phase._id)
    if (validateRes.status === 200 && isPhaseValidated(stored!)) {
      // Le contenu attesté ne doit pas avoir bougé, quel que soit l'ordre d'arrivée.
      expect(stored!.title).toBe('Maquettes')
      expect(patchRes.status).toBe(409)
    }
  })

  it('refuse la suppression d’une étape validée entre-temps', async () => {
    const phase = await waitingPhase()

    const [validateRes] = await Promise.all([
      request(app).post(`/api/projects/${projectId}/phases/${phase._id}/validate`).set('Cookie', ownerCookie),
      request(app).delete(`/api/admin/projects/${projectId}/phases/${phase._id}`).set('Cookie', adminCookie),
    ])

    if (validateRes.status === 200) {
      const stored = await ProjectPhase.findById(phase._id)
      expect(stored, 'une validation ne doit pas pouvoir être effacée par une suppression concurrente').not.toBeNull()
    }
  })
})
