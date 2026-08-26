import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
import ActivityLog from '../models/ActivityLog.js'
import ProjectTemplate from '../models/ProjectTemplate.js'

let app: Express
let adminId: string
let ownerId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/projects', adminProjectRoutes)
  app.use('/api/projects', clientPhaseRoutes)
})

afterAll(teardownMongo)
afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [admin, owner] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN' },
    { name: 'Claire Corbel', email: 'owner@example.test', passwordHash, role: 'CLIENT', status: 'ACTIF' },
  ])
  adminId = String(admin._id)
  ownerId = String(owner._id)
  const project = await Project.create({ name: 'Site', client: owner._id, assignedTo: admin._id })
  projectId = String(project._id)
})

describe('une écriture persistée n’est jamais annulée par un effet de bord', () => {
  it('valide l’étape même si la recherche des destinataires échoue', async () => {
    const phase = await ProjectPhase.create({
      project: projectId,
      title: 'Maquettes',
      createdBy: adminId,
      requiresClientValidation: true,
      status: 'EN_ATTENTE_VALIDATION',
    })
    // Panne de la résolution des destinataires : elle ne doit pas transformer
    // une validation déjà écrite en 500 (le client relancerait et prendrait 409).
    vi.spyOn(User, 'find').mockImplementation(
      () => ({ select: () => ({ lean: () => Promise.reject(new Error('mongo down')) }) }) as never,
    )

    await request(app)
      .post(`/api/projects/${projectId}/phases/${phase._id}/validate`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)

    const stored = await ProjectPhase.findById(phase._id)
    expect(stored!.status).toBe('TERMINEE')
    expect(stored!.validation.validatedAt).not.toBeNull()
  })
})

describe('instanciation depuis un template', () => {
  it('ne laisse pas de projet orphelin si la création des étapes échoue', async () => {
    const template = await ProjectTemplate.create({
      name: 'Site vitrine',
      defaultPhases: [{ title: 'Cadrage' }, { title: 'Maquettes' }],
      createdBy: adminId,
    })
    vi.spyOn(ProjectPhase, 'insertMany').mockRejectedValue(new Error('mongo down') as never)

    await request(app)
      .post('/api/admin/projects')
      .set('Cookie', await cookieFor(adminId))
      .send({ clientId: ownerId, name: 'Site fantôme', templateId: String(template._id) })
      .expect(500)

    expect(await Project.countDocuments({ name: 'Site fantôme' })).toBe(0)
    expect(await ProjectPhase.countDocuments({})).toBe(0)
  })
})

describe('traçabilité des modifications d’étape', () => {
  it('journalise les champs modifiés et l’avant/après de la validation client requise', async () => {
    const phase = await ProjectPhase.create({
      project: projectId,
      title: 'Maquettes',
      createdBy: adminId,
      requiresClientValidation: true,
      status: 'EN_COURS',
    })

    await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/${phase._id}`)
      .set('Cookie', await cookieFor(adminId))
      .send({ requiresClientValidation: false, description: 'Sans validation' })
      .expect(200)

    const log = await ActivityLog.findOne({ project: projectId, action: 'PHASE_UPDATED' })
    expect(log).not.toBeNull()
    const metadata = log!.metadata as Record<string, unknown>
    expect(metadata.changedFields).toEqual(expect.arrayContaining(['requiresClientValidation', 'description']))
    expect(metadata.requiresClientValidation).toEqual({ from: true, to: false })
    expect(log!.summary).toContain('validation client')
  })
})
