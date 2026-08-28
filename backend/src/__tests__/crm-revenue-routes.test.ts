import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = authState.user
    next()
  },
}))

let app: Express
let superAdminId: mongoose.Types.ObjectId
let commercialId: mongoose.Types.ObjectId
let otherCommercialId: mongoose.Types.ObjectId
let clientId: mongoose.Types.ObjectId

function actAs(id: mongoose.Types.ObjectId, role: NonNullable<Request['user']>['role']) {
  authState.user = { id: id.toString(), role, email: `${role}@test.local`, name: role }
}

async function seedLead(overrides: Record<string, unknown> = {}) {
  const { default: Lead } = await import('../models/Lead.js')
  return Lead.create({
    company: 'Acme',
    status: 'WON',
    assignedTo: commercialId,
    clientAccountId: clientId,
    ...overrides,
  })
}

async function seedProject(overrides: Record<string, unknown> = {}) {
  const { default: Project } = await import('../models/Project.js')
  return Project.create({ name: 'Refonte', client: clientId, status: 'EN_COURS', ...overrides })
}

async function seedDocument(projectId: unknown, overrides: Record<string, unknown> = {}) {
  const { default: BillingDocument } = await import('../models/BillingDocument.js')
  return BillingDocument.create({
    type: 'QUOTE',
    number: `DEV-${Math.floor(Math.random() * 100000)}`,
    project: projectId,
    client: clientId,
    status: 'ACCEPTED',
    total: 5000,
    createdBy: superAdminId,
    ...overrides,
  })
}

beforeAll(async () => {
  await setupMongo()
  const { default: crmRoutes } = await import('../routes/admin/crm.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/crm', crmRoutes)
})

afterAll(async () => {
  authState.user = null
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  const { default: User } = await import('../models/User.js')
  const [superAdmin, commercial, other, client] = await User.create([
    { email: 'super@test.local', name: 'Super', role: 'SUPER_ADMIN', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'com@test.local', name: 'Com', role: 'COMMERCIAL', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'com2@test.local', name: 'Com2', role: 'COMMERCIAL', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'client@acme.fr', name: 'Acme SAS', role: 'CLIENT', passwordHash: 'x' },
  ])
  superAdminId = superAdmin._id as mongoose.Types.ObjectId
  commercialId = commercial._id as mongoose.Types.ObjectId
  otherCommercialId = other._id as mongoose.Types.ObjectId
  clientId = client._id as mongoose.Types.ObjectId
})

describe('GET /crm/leads/:id/revenue', () => {
  it("remonte le signé et l'encaissé sans les confondre", async () => {
    const lead = await seedLead()
    const project = await seedProject({ sourceLead: lead._id })
    await seedDocument(project._id, { type: 'QUOTE', status: 'ACCEPTED', total: 12000 })
    await seedDocument(project._id, { type: 'INVOICE', status: 'PAID', total: 4000 })

    actAs(commercialId, 'COMMERCIAL')
    const response = await request(app).get(`/api/admin/crm/leads/${lead._id}/revenue`).expect(200)

    expect(response.body.summary.signed).toBe(12000)
    expect(response.body.summary.collected).toBe(4000)
    expect(response.body.projects).toHaveLength(1)
  })

  it("rend une chaîne vide sans erreur quand rien n'est rattaché", async () => {
    const lead = await seedLead()
    actAs(commercialId, 'COMMERCIAL')
    const response = await request(app).get(`/api/admin/crm/leads/${lead._id}/revenue`).expect(200)

    expect(response.body.projects).toEqual([])
    expect(response.body.summary).toEqual({ signed: 0, collected: 0, documents: 0 })
  })

  it('refuse un lead hors périmètre', async () => {
    const lead = await seedLead({ assignedTo: otherCommercialId })
    actAs(commercialId, 'COMMERCIAL')
    await request(app).get(`/api/admin/crm/leads/${lead._id}/revenue`).expect(404)
  })
})

describe('Rattachement de projet', () => {
  it('propose les projets du client non encore rattachés', async () => {
    const lead = await seedLead()
    await seedProject({ name: 'Libre' })
    await seedProject({ name: 'Déjà pris', sourceLead: new mongoose.Types.ObjectId() })

    actAs(commercialId, 'COMMERCIAL')
    const response = await request(app).get(`/api/admin/crm/leads/${lead._id}/project-candidates`).expect(200)

    expect(response.body.candidates.map((project: { name: string }) => project.name)).toEqual(['Libre'])
  })

  it("explique l'absence de candidats quand le lead n'a pas de compte client", async () => {
    const lead = await seedLead({ clientAccountId: null })
    actAs(commercialId, 'COMMERCIAL')
    const response = await request(app).get(`/api/admin/crm/leads/${lead._id}/project-candidates`).expect(200)

    expect(response.body.candidates).toEqual([])
    expect(response.body.reason).toBe('NO_CLIENT_ACCOUNT')
  })

  it('rattache un projet et le journalise', async () => {
    const { default: LeadActivity } = await import('../models/LeadActivity.js')
    const lead = await seedLead()
    const project = await seedProject()

    actAs(commercialId, 'COMMERCIAL')
    await request(app).post(`/api/admin/crm/leads/${lead._id}/projects/${project._id}`).expect(200)

    const { default: Project } = await import('../models/Project.js')
    const reloaded = await Project.findById(project._id).lean()
    expect(String(reloaded!.sourceLead)).toBe(String(lead._id))

    const activities = await LeadActivity.find({ leadId: lead._id, type: 'PROJECT_LINKED' })
    expect(activities).toHaveLength(1)
  })

  it('refuse un projet déjà rattaché à un autre lead', async () => {
    const lead = await seedLead()
    const other = await seedLead({ company: 'Autre' })
    const project = await seedProject({ sourceLead: other._id })

    actAs(commercialId, 'COMMERCIAL')
    await request(app).post(`/api/admin/crm/leads/${lead._id}/projects/${project._id}`).expect(409)
  })

  it('accepte un rattachement déjà en place, sans le dupliquer', async () => {
    const lead = await seedLead()
    const project = await seedProject({ sourceLead: lead._id })

    actAs(commercialId, 'COMMERCIAL')
    await request(app).post(`/api/admin/crm/leads/${lead._id}/projects/${project._id}`).expect(200)
  })

  it('détache un projet', async () => {
    const lead = await seedLead()
    const project = await seedProject({ sourceLead: lead._id })

    actAs(commercialId, 'COMMERCIAL')
    await request(app).delete(`/api/admin/crm/leads/${lead._id}/projects/${project._id}`).expect(200)

    const { default: Project } = await import('../models/Project.js')
    expect((await Project.findById(project._id).lean())!.sourceLead).toBeNull()
  })

  it('ne détache pas un projet rattaché à un autre lead', async () => {
    const lead = await seedLead()
    const project = await seedProject({ sourceLead: new mongoose.Types.ObjectId() })

    actAs(commercialId, 'COMMERCIAL')
    await request(app).delete(`/api/admin/crm/leads/${lead._id}/projects/${project._id}`).expect(404)
  })
})

describe('Pilotage enrichi', () => {
  it('confronte le budget déclaré au montant réellement signé', async () => {
    const lead = await seedLead({ budget: 20000 })
    const project = await seedProject({ sourceLead: lead._id })
    await seedDocument(project._id, { type: 'QUOTE', status: 'ACCEPTED', total: 14000 })

    actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/crm/pilotage').expect(200)

    expect(response.body.revenue.declaredBudget).toBe(20000)
    expect(response.body.revenue.signed).toBe(14000)
    expect(response.body.revenue.linkedProjects).toBe(1)
  })

  it('ventile le montant signé par source, à côté du budget déclaré', async () => {
    const lead = await seedLead({ budget: 20000, source: 'Ads' })
    const project = await seedProject({ sourceLead: lead._id })
    await seedDocument(project._id, { type: 'QUOTE', status: 'ACCEPTED', total: 9000 })

    actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/crm/pilotage').expect(200)

    const ads = response.body.bySource.find((row: { key: string }) => row.key === 'Ads')
    expect(ads.wonBudget).toBe(20000)
    expect(ads.wonSigned).toBe(9000)
  })

  it('marque le prévisionnel non fiable sur une cohorte trop petite', async () => {
    await seedLead({ status: 'PROPOSAL', budget: 5000 })

    actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/crm/pilotage').expect(200)

    expect(response.body.pipeline.reliable).toBe(false)
    expect(response.body.pipeline.cohortSize).toBeLessThan(20)
  })

  it('compte les leads sans budget dans le prévisionnel', async () => {
    await seedLead({ status: 'DEMO', budget: null })

    actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/crm/pilotage').expect(200)
    expect(response.body.pipeline.withoutBudget).toBe(1)
  })
})

describe('Création automatique de projet', () => {
  it("pose le lead d'origine sur le projet créé depuis un lead gagné", async () => {
    const { autoCreateProjectFromLead } = await import('../lib/crmAutomations.js')
    const lead = await seedLead({ budget: 3000 })

    const project = await autoCreateProjectFromLead(
      {
        _id: lead._id,
        company: lead.company,
        clientAccountId: clientId,
        contactEmail: '',
        notes: '',
        priority: 'NORMALE',
        serviceType: '',
        budget: 3000,
      },
      String(superAdminId),
    )

    expect(project).not.toBeNull()
    expect(String(project!.sourceLead)).toBe(String(lead._id))
  })
})
