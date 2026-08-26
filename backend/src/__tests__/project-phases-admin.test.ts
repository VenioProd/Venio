import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminProjectRoutes from '../routes/admin/projects/index.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectItem from '../models/ProjectItem.js'
import ProjectPhase from '../models/ProjectPhase.js'

let app: Express
let adminId: string
let commercialId: string
let clientId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

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
  const [admin, commercial, client] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN' },
    { name: 'Commercial', email: 'commercial@example.test', passwordHash, role: 'COMMERCIAL' },
    { name: 'Client', email: 'client@example.test', passwordHash, role: 'CLIENT' },
  ])
  adminId = String(admin._id)
  commercialId = String(commercial._id)
  clientId = String(client._id)
  const project = await Project.create({ name: 'Site', client: client._id })
  projectId = String(project._id)
})

describe('lecture des étapes', () => {
  it('liste les étapes triées par ordre avec leurs livrables peuplés', async () => {
    const item = await ProjectItem.create({
      project: projectId,
      type: 'MAQUETTE',
      title: 'Maquettes desktop',
      createdBy: adminId,
    })
    await createPhase({ title: 'Développement', order: 1 })
    await createPhase({ title: 'Cadrage', order: 0, linkedItems: [item._id] })

    const response = await request(app)
      .get(`/api/admin/projects/${projectId}/phases`)
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    expect(response.body.phases.map((p: { title: string }) => p.title)).toEqual(['Cadrage', 'Développement'])
    expect(response.body.phases[0].linkedItems[0].title).toBe('Maquettes desktop')
  })

  it('renvoie 404 sur un projet inconnu', async () => {
    await request(app)
      .get('/api/admin/projects/64b7f0000000000000000000/phases')
      .set('Cookie', await cookieFor(adminId))
      .expect(404)
  })

  it('refuse 403 la création à un rôle sans manage_phases', async () => {
    await request(app)
      .post(`/api/admin/projects/${projectId}/phases`)
      .set('Cookie', await cookieFor(commercialId))
      .send({ title: 'Cadrage' })
      .expect(403)
  })
})

describe('création d’une étape', () => {
  it('crée une étape A_VENIR avec un ordre auto-incrémenté', async () => {
    const cookie = await cookieFor(adminId)
    const first = await request(app)
      .post(`/api/admin/projects/${projectId}/phases`)
      .set('Cookie', cookie)
      .send({ title: 'Cadrage', requiresClientValidation: true })
      .expect(201)
    const second = await request(app)
      .post(`/api/admin/projects/${projectId}/phases`)
      .set('Cookie', cookie)
      .send({ title: 'Maquettes' })
      .expect(201)

    expect(first.body.phase.status).toBe('A_VENIR')
    expect(first.body.phase.order).toBe(0)
    expect(first.body.phase.requiresClientValidation).toBe(true)
    expect(second.body.phase.order).toBe(1)
  })

  it('refuse 400 sans titre', async () => {
    await request(app)
      .post(`/api/admin/projects/${projectId}/phases`)
      .set('Cookie', await cookieFor(adminId))
      .send({ description: 'sans titre' })
      .expect(400)
  })

  it('refuse 422 INVALID_LINKED_ITEMS un livrable d’un autre projet', async () => {
    const otherProject = await Project.create({ name: 'Autre', client: clientId })
    const foreignItem = await ProjectItem.create({
      project: otherProject._id,
      type: 'LIVRABLE',
      title: 'Étranger',
      createdBy: adminId,
    })

    const response = await request(app)
      .post(`/api/admin/projects/${projectId}/phases`)
      .set('Cookie', await cookieFor(adminId))
      .send({ title: 'Cadrage', linkedItems: [String(foreignItem._id)] })
      .expect(422)

    expect(response.body.code).toBe('INVALID_LINKED_ITEMS')
  })
})

describe('modification et suppression', () => {
  it('modifie les champs éditables', async () => {
    const phase = await createPhase()
    const response = await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/${phase._id}`)
      .set('Cookie', await cookieFor(adminId))
      .send({ title: 'Cadrage détaillé', description: 'Ateliers', requiresClientValidation: true })
      .expect(200)

    expect(response.body.phase.title).toBe('Cadrage détaillé')
    expect(response.body.phase.description).toBe('Ateliers')
    expect(response.body.phase.requiresClientValidation).toBe(true)
  })

  it('ignore un statut envoyé par PATCH', async () => {
    const phase = await createPhase()
    await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/${phase._id}`)
      .set('Cookie', await cookieFor(adminId))
      .send({ status: 'TERMINEE' })
      .expect(200)

    expect((await ProjectPhase.findById(phase._id))!.status).toBe('A_VENIR')
  })

  it('fige le contenu d’une étape validée mais laisse passer l’ordre', async () => {
    const phase = await createPhase({
      status: 'TERMINEE',
      validation: { validatedByName: 'Claire', validatedAt: new Date() },
    })
    const cookie = await cookieFor(adminId)

    const refused = await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/${phase._id}`)
      .set('Cookie', cookie)
      .send({ title: 'Réécriture' })
      .expect(409)
    expect(refused.body.code).toBe('VALIDATED_PHASE_IMMUTABLE')

    await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/${phase._id}`)
      .set('Cookie', cookie)
      .send({ order: 3 })
      .expect(200)
    expect((await ProjectPhase.findById(phase._id))!.order).toBe(3)
  })

  it('supprime une étape non validée et refuse 409 une étape validée', async () => {
    const cookie = await cookieFor(adminId)
    const plain = await createPhase()
    await request(app).delete(`/api/admin/projects/${projectId}/phases/${plain._id}`).set('Cookie', cookie).expect(200)
    expect(await ProjectPhase.countDocuments({ _id: plain._id })).toBe(0)

    const validated = await createPhase({
      status: 'TERMINEE',
      validation: { validatedByName: 'Claire', validatedAt: new Date() },
    })
    const refused = await request(app)
      .delete(`/api/admin/projects/${projectId}/phases/${validated._id}`)
      .set('Cookie', cookie)
      .expect(409)
    expect(refused.body.code).toBe('VALIDATED_PHASE_IMMUTABLE')
  })
})

describe('réordonnancement', () => {
  it('réécrit les ordres selon la liste fournie', async () => {
    const a = await createPhase({ title: 'A', order: 0 })
    const b = await createPhase({ title: 'B', order: 1 })
    const c = await createPhase({ title: 'C', order: 2 })

    const response = await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/reorder`)
      .set('Cookie', await cookieFor(adminId))
      .send({ phaseIds: [String(c._id), String(a._id), String(b._id)] })
      .expect(200)

    expect(response.body.phases.map((p: { title: string }) => p.title)).toEqual(['C', 'A', 'B'])
    expect(response.body.phases.map((p: { order: number }) => p.order)).toEqual([0, 1, 2])
  })

  it('refuse 422 INVALID_PHASE_LIST une liste incomplète', async () => {
    const a = await createPhase({ title: 'A', order: 0 })
    await createPhase({ title: 'B', order: 1 })

    const response = await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/reorder`)
      .set('Cookie', await cookieFor(adminId))
      .send({ phaseIds: [String(a._id)] })
      .expect(422)

    expect(response.body.code).toBe('INVALID_PHASE_LIST')
  })
})
