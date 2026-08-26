import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminProjectRoutes from '../routes/admin/projects/index.js'
import adminTemplateRoutes from '../routes/admin/templates.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectPhase from '../models/ProjectPhase.js'
import ProjectTemplate from '../models/ProjectTemplate.js'

let app: Express
let adminId: string
let clientId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/projects', adminProjectRoutes)
  app.use('/api/admin/templates', adminTemplateRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [admin, client] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN' },
    { name: 'Client', email: 'client@example.test', passwordHash, role: 'CLIENT', status: 'ACTIF' },
  ])
  adminId = String(admin._id)
  clientId = String(client._id)
})

async function createTemplate() {
  return ProjectTemplate.create({
    name: 'Site vitrine',
    defaultPhases: [
      { title: 'Cadrage', description: 'Ateliers', requiresClientValidation: false },
      { title: 'Maquettes', requiresClientValidation: true },
      { title: 'Développement' },
    ],
    createdBy: adminId,
  })
}

describe('champ defaultPhases des templates', () => {
  it('accepte et filtre les étapes par défaut à la création', async () => {
    const response = await request(app)
      .post('/api/admin/templates')
      .set('Cookie', await cookieFor(adminId))
      .send({
        name: 'Site vitrine',
        defaultPhases: [
          { title: 'Cadrage' },
          { description: 'sans titre — doit être filtrée' },
          { title: 'Maquettes', requiresClientValidation: true },
        ],
      })
      .expect(201)

    expect(response.body.template.defaultPhases).toHaveLength(2)
    expect(response.body.template.defaultPhases[1]).toMatchObject({
      title: 'Maquettes',
      requiresClientValidation: true,
    })
  })

  it('met à jour les étapes par défaut', async () => {
    const template = await createTemplate()
    const response = await request(app)
      .patch(`/api/admin/templates/${template._id}`)
      .set('Cookie', await cookieFor(adminId))
      .send({ defaultPhases: [{ title: 'Recette', requiresClientValidation: true }] })
      .expect(200)

    expect(response.body.template.defaultPhases).toHaveLength(1)
    expect(response.body.template.defaultPhases[0].title).toBe('Recette')
  })
})

describe('instanciation du pipeline à la création de projet', () => {
  it('crée une étape A_VENIR par entrée du template, dans l’ordre', async () => {
    const template = await createTemplate()

    const response = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', await cookieFor(adminId))
      .send({ clientId, name: 'Site Corbel', templateId: String(template._id) })
      .expect(201)

    const phases = await ProjectPhase.find({ project: response.body.project._id }).sort({ order: 1 })
    expect(phases.map((p) => p.title)).toEqual(['Cadrage', 'Maquettes', 'Développement'])
    expect(phases.map((p) => p.order)).toEqual([0, 1, 2])
    expect(phases.map((p) => p.status)).toEqual(['A_VENIR', 'A_VENIR', 'A_VENIR'])
    expect(phases.map((p) => p.requiresClientValidation)).toEqual([false, true, false])
    expect(phases[0].description).toBe('Ateliers')
    expect(phases[0].dueAt).toBeNull()
    expect(phases[0].linkedItems).toHaveLength(0)
    expect(String(phases[0].createdBy)).toBe(adminId)
  })

  it('refuse 400 un templateId inconnu sans créer de projet', async () => {
    await request(app)
      .post('/api/admin/projects')
      .set('Cookie', await cookieFor(adminId))
      .send({ clientId, name: 'Site fantôme', templateId: '64b7f0000000000000000000' })
      .expect(400)

    expect(await Project.countDocuments({ name: 'Site fantôme' })).toBe(0)
  })

  it('ne crée aucune étape sans templateId', async () => {
    const response = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', await cookieFor(adminId))
      .send({ clientId, name: 'Site nu' })
      .expect(201)

    expect(await ProjectPhase.countDocuments({ project: response.body.project._id })).toBe(0)
  })

  it('laisse les étapes instanciées librement modifiables (aucun couplage au template)', async () => {
    const template = await createTemplate()
    const created = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', await cookieFor(adminId))
      .send({ clientId, name: 'Site Corbel', templateId: String(template._id) })
      .expect(201)
    const projectId = created.body.project._id
    const phase = await ProjectPhase.findOne({ project: projectId, order: 0 })

    await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/${phase!._id}`)
      .set('Cookie', await cookieFor(adminId))
      .send({ title: 'Cadrage renommé' })
      .expect(200)
    await request(app)
      .delete(`/api/admin/projects/${projectId}/phases/${phase!._id}`)
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    expect(await ProjectPhase.countDocuments({ project: projectId })).toBe(2)
    const untouched = await ProjectTemplate.findById(template._id)
    expect(untouched!.defaultPhases).toHaveLength(3)
  })
})
