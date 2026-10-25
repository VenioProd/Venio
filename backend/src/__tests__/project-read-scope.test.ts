import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import User from '../models/User.js'
import Project from '../models/Project.js'
import Task from '../models/Task.js'
import ProjectItem from '../models/ProjectItem.js'
import ProjectPhase from '../models/ProjectPhase.js'
import ProjectUpdate from '../models/ProjectUpdate.js'
import AuditLog from '../models/AuditLog.js'
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
let commercial: ReturnType<typeof User.hydrate>
let superAdmin: ReturnType<typeof User.hydrate>
let outside: ReturnType<typeof Project.hydrate>
let owned: ReturnType<typeof Project.hydrate>
let item: ReturnType<typeof ProjectItem.hydrate>
let directory: string

function actAs(user: typeof commercial) {
  authState.user = { id: String(user._id), role: user.role, email: user.email, name: user.name }
}

beforeAll(async () => {
  await setupMongo()
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'project-read-scope-'))
  fs.writeFileSync(path.join(directory, 'document.txt'), 'Document confidentiel')
  app = express()
  app.use(express.json())
  const routes = [
    ['/api/admin/projects', '../routes/admin/projects/index.js'],
    ['/api/admin/search', '../routes/admin/search.js'],
    ['/api/admin/clients', '../routes/admin/clients/index.js'],
    ['/api/admin/admins', '../routes/admin/admins.js'],
    ['/api/mobile/sync', '../routes/mobile/sync.js'],
    ['/api/auth', '../routes/auth.js'],
    ['/api/auth/mobile', '../routes/mobileAuth.js'],
    ['/api/documents', '../routes/documents.js'],
    ['/api/admin/billing', '../routes/admin/billing.js'],
    ['/api/admin/quote-proposals', '../routes/admin/quoteProposals.js'],
    ['/api/admin/change-requests', '../routes/admin/changeRequests.js'],
    ['/api/admin/calendar', '../routes/admin/calendar.js'],
    ['/api/admin/dashboard', '../routes/admin/dashboard.js'],
    ['/api/admin/analytics', '../routes/admin/analytics.js'],
    ['/api/admin/accounting', '../routes/admin/accounting/index.js'],
    ['/api/admin/activity-center', '../routes/admin/activityCenter.js'],
    ['/api/admin/users', '../routes/admin/users.js'],
    ['/api/admin/crm', '../routes/admin/crm.js'],
    ['/api/admin/inbox', '../routes/admin/inbox.js'],
    ['/api/admin/briefs', '../routes/admin/briefs.js'],
    ['/api/admin/gestion', '../routes/admin/gestion.js'],
    ['/api/mobile/today', '../routes/mobile/today.js'],
  ]
  for (const [prefix, module] of routes) app.use(prefix!, (await import(module!)).default)
})

afterAll(async () => {
  authState.user = null
  if (directory) fs.rmSync(directory, { recursive: true, force: true })
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  ;[commercial, superAdmin] = await User.create([
    { email: 'commercial@test.local', name: 'Commercial', role: 'COMMERCIAL', passwordHash: 'x' },
    { email: 'super@test.local', name: 'Super', role: 'SUPER_ADMIN', passwordHash: 'x', twoFactorEnabled: true },
  ])
  const [client, ownClient] = await User.create([
    { email: 'client@test.local', name: 'Client', role: 'CLIENT', passwordHash: 'x' },
    {
      email: 'owned@test.local',
      name: 'Portefeuille',
      role: 'CLIENT',
      ownerAdminId: commercial._id,
      passwordHash: 'x',
    },
  ])
  ;[outside, owned] = await Project.create([
    { name: 'Secret extérieur', client: client._id, startDate: new Date(), endDate: new Date() },
    { name: 'Secret portefeuille', client: ownClient._id },
  ])
  await Task.create({ project: outside._id, title: 'Secret tâche', createdBy: superAdmin._id, dueDate: new Date(0) })
  item = await ProjectItem.create({
    project: outside._id,
    type: 'DOCUMENTATION',
    title: 'Secret document',
    createdBy: superAdmin._id,
    file: {
      storagePath: path.join(directory, 'document.txt'),
      originalName: 'document.txt',
      mimeType: 'text/plain',
      size: 22,
    },
  })
  actAs(commercial)
})

it('ouvre les lectures à un associé sans lui ouvrir la création de tâches', async () => {
  await User.updateOne({ _id: commercial._id }, { isAssociate: true })
  for (const suffix of ['', '/tasks', '/items']) {
    await request(app).get(`/api/admin/projects/${outside._id}${suffix}`).expect(200)
  }
  const listed = await request(app).get('/api/admin/projects').expect(200)
  expect(listed.body.projects.map((p: { _id: string }) => p._id)).toContain(String(outside._id))
  const search = await request(app).get('/api/admin/search?q=Secret').expect(200)
  expect(search.body.results.map((r: { title: string }) => r.title)).toEqual(
    expect.arrayContaining(['Secret extérieur', 'Secret tâche']),
  )
  await request(app)
    .post(`/api/admin/projects/${outside._id}/tasks`)
    .send({ title: 'Intrusion', assignee: commercial._id })
    .expect(403)
  expect(await Task.countDocuments({ project: outside._id })).toBe(1)
  await request(app).get(`/api/admin/projects/${outside._id}/items/${item._id}/download`).expect(200)
  await User.updateOne({ _id: commercial._id }, { isAssociate: false })
  await request(app).get(`/api/admin/projects/${outside._id}`).expect(404)
})

it('masque les projets hors périmètre et conserve les projets du portefeuille client', async () => {
  for (const suffix of [
    '',
    '/tasks',
    '/items',
    `/items/${item._id}/download`,
    `/items/${item._id}/preview`,
    '/sections',
    '/phases',
    '/messages',
    '/activity',
    '/updates',
    '/documents',
  ]) {
    const response = await request(app).get(`/api/admin/projects/${outside._id}${suffix}`).expect(404)
    expect(response.body.error).toBe('Projet non trouvé')
  }
  const encodedId = String(outside._id)
    .split('')
    .map((char) => `%${char.charCodeAt(0).toString(16)}`)
    .join('')
  await request(app).get(`/api/admin/projects/${encodedId}/tasks`).expect(404)
  const listed = await request(app).get('/api/admin/projects').expect(200)
  expect(listed.body.projects.map((p: { _id: string }) => p._id)).toEqual([String(owned._id)])
  const search = await request(app).get('/api/admin/search?q=Secret').expect(200)
  expect(
    search.body.results
      .filter((r: { type: string }) => ['project', 'task'].includes(r.type))
      .map((r: { title: string }) => r.title),
  ).toEqual(['Secret portefeuille'])
  const clientProjects = await request(app).get(`/api/admin/clients/${outside.client}/projects`).expect(404)
  expect(JSON.stringify(clientProjects.body)).not.toContain(String(outside._id))
  await request(app).get(`/api/admin/projects/${owned._id}`).expect(200)
  const ownClientProjects = await request(app).get(`/api/admin/clients/${owned.client}/projects`).expect(200)
  expect(ownClientProjects.body.data.projects.map((p: { _id: string }) => p._id)).toEqual([String(owned._id)])

  const { default: BillingDocument } = await import('../models/BillingDocument.js')
  const { default: QuoteProposal } = await import('../models/QuoteProposal.js')
  const { default: ChangeRequest } = await import('../models/ChangeRequest.js')
  const { default: MissionBrief } = await import('../models/MissionBrief.js')
  const { default: Document } = await import('../models/Document.js')
  const legacyDocument = await Document.create({
    project: outside._id,
    type: 'FICHIER_PROJET',
    originalName: 'document.txt',
    storagePath: path.join(directory, 'document.txt'),
    mimeType: 'text/plain',
    uploadedBy: superAdmin._id,
  })
  await request(app).get(`/api/documents/${legacyDocument._id}/download`).expect(404)
  const { default: Lead } = await import('../models/Lead.js')
  const document = await BillingDocument.create({
    project: outside._id,
    client: outside.client,
    type: 'INVOICE',
    number: 'SCOPE-1',
    createdBy: superAdmin._id,
  })
  const quote = await QuoteProposal.create({
    project: outside._id,
    client: outside.client,
    title: 'Secret devis',
    createdBy: commercial._id,
    status: 'SENT',
    firstViewedAt: new Date(),
  })
  const change = await ChangeRequest.create({
    project: outside._id,
    client: outside.client,
    title: 'Secret demande',
    description: 'Secret',
    createdBy: superAdmin._id,
    createdByName: 'Super',
  })
  const brief = await MissionBrief.create({
    project: outside._id,
    intitule: 'Secret brief',
    destinataire: superAdmin._id,
    createdBy: superAdmin._id,
    briefPriority: 'P1',
    deadline: new Date(0),
  })
  await MissionBrief.collection.updateOne({ _id: brief._id }, { $unset: { destinataire: '' } })
  const lead = await Lead.create({ company: 'Lead', assignedTo: commercial._id, createdBy: commercial._id })
  await Project.updateOne({ _id: outside._id }, { sourceLead: lead._id })
  for (const route of [
    `/api/admin/billing/projects/${outside._id}/billing-documents`,
    `/api/admin/billing/PROJECTS/${outside._id}/billing-documents`,
    `/api/admin/accounting/projects/${outside._id}/finance`,
    `/api/admin/accounting/exports/payments.csv?projectId=${outside._id}`,
    `/api/admin/billing/${document._id}`,
    `/api/admin/billing/${document._id}/pdf`,
    `/api/admin/billing/${document._id}/accounting-entries`,
    `/api/admin/quote-proposals/${quote._id}`,
    `/api/admin/change-requests/${change._id}`,
    `/api/admin/briefs/${brief._id}`,
  ]) {
    await request(app).get(route).expect(404)
  }
  for (const route of [
    `/api/admin/quote-proposals?project=${outside._id}`,
    `/api/admin/change-requests?project=${outside._id}`,
    `/api/admin/users/${outside.client}/projects`,
    `/api/admin/crm/leads/${lead._id}/revenue`,
  ]) {
    const response = await request(app).get(route).expect(200)
    expect(JSON.stringify(response.body)).not.toContain(String(outside._id))
  }
  for (const route of ['progress', 'deliverables', 'billing/documents', 'billing/summary', 'files']) {
    await request(app).get(`/api/admin/clients/${outside.client}/${route}`).expect(404)
  }
  const calendar = await request(app).get('/api/admin/calendar/events?start=1970-01-01&end=2100-01-01').expect(200)
  expect(calendar.body.events).toEqual([])
  const dashboard = await request(app).get('/api/admin/dashboard').expect(200)
  expect(dashboard.body.overdueTasks).toEqual([])
  expect(dashboard.body.recentProjects.map((p: { _id: string }) => p._id)).toEqual([String(owned._id)])
  const analytics = await request(app).get('/api/admin/analytics').expect(200)
  expect(analytics.body.tasksByStatus).toEqual({})
  expect(analytics.body.overdueTaskCount).toBe(0)
  const activity = await request(app).get('/api/admin/activity-center').expect(200)
  expect(JSON.stringify(activity.body)).not.toContain(String(outside._id))
  const inbox = await request(app).get('/api/admin/inbox').expect(200)
  expect(JSON.stringify(inbox.body)).not.toContain('Secret brief')
  const today = await request(app).get('/api/mobile/today').expect(200)
  expect(today.body.quotesViewedNotSigned.items).toEqual([])
})

it('synchronise les projets et leurs données selon le statut relu en base, sans élargir canQuote', async () => {
  await ProjectPhase.create({ project: outside._id, title: 'Phase', createdBy: superAdmin._id })
  await ProjectUpdate.create({ project: outside._id, title: 'Actualité', createdBy: superAdmin._id })
  const oldDate = new Date(Date.now() - 10_000)
  for (const model of [Project, ProjectPhase, ProjectUpdate, ProjectItem]) {
    await model.collection.updateMany({}, { $set: { updatedAt: oldDate } })
  }
  for (const associate of [false, true, false]) {
    await User.updateOne({ _id: commercial._id }, { isAssociate: associate })
    for (const type of ['projects', 'projectPhases', 'projectUpdates', 'projectDocuments']) {
      const response = await request(app).get(`/api/mobile/sync/${type}`).expect(200)
      const projects = response.body.items.map((entry: { _id: string; project?: string }) =>
        type === 'projects' ? entry._id : entry.project,
      )
      expect(projects.includes(String(outside._id))).toBe(associate)
      if (type === 'projects') {
        expect(response.body.items.find((entry: { _id: string }) => entry._id === String(owned._id))).toMatchObject({
          canQuote: true,
        })
        if (associate)
          expect(response.body.items.find((entry: { _id: string }) => entry._id === String(outside._id)).canQuote).toBe(
            false,
          )
      }
    }
  }
})

it('réserve isAssociate à manage_admins et journalise son auteur ainsi que les valeurs avant/après', async () => {
  expect(commercial.isAssociate).toBe(false)
  await request(app).patch(`/api/admin/admins/${commercial._id}`).send({ isAssociate: true }).expect(403)
  await request(app).patch('/api/auth/profile').send({ isAssociate: true }).expect(400)
  expect((await User.findById(commercial._id))!.isAssociate).toBe(false)
  expect(await AuditLog.countDocuments({ action: 'PERMISSION_CHANGED' })).toBe(0)
  actAs(superAdmin)
  await request(app).patch(`/api/admin/admins/${commercial._id}`).send({ isAssociate: 'true' }).expect(400)
  await request(app).patch(`/api/admin/admins/${commercial._id}`).send({ isAssociate: true }).expect(200)
  expect((await User.findById(commercial._id))!.isAssociate).toBe(true)
  const audit = await AuditLog.findOne({ action: 'PERMISSION_CHANGED' }).lean()
  expect(String(audit!.userId)).toBe(String(superAdmin._id))
  expect(audit!.metadata).toMatchObject({
    entityId: String(commercial._id),
    before: { isAssociate: false },
    after: { isAssociate: true },
  })
  actAs(commercial)
  const me = await request(app).get('/api/auth/me').expect(200)
  expect(me.body.user.isAssociate).toBe(true)
  const { default: bcrypt } = await import('bcryptjs')
  await User.updateOne({ _id: commercial._id }, { passwordHash: await bcrypt.hash('test-password', 4) })
  const login = await request(app)
    .post('/api/auth/mobile/login')
    .send({ email: commercial.email, password: 'test-password', device: { name: 'Test', platform: 'ios' } })
    .expect(200)
  expect(login.body.user.isAssociate).toBe(true)
})
