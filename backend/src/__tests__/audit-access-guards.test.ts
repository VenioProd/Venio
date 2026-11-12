import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import request from 'supertest'
import rateLimit from 'express-rate-limit'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import User from '../models/User.js'
import Intern from '../models/Intern.js'
import ActivityReport from '../models/ActivityReport.js'
import Lead from '../models/Lead.js'
import Project from '../models/Project.js'
import BillingDocument from '../models/BillingDocument.js'
import AgentToken from '../models/AgentToken.js'
import CompanyResource from '../models/CompanyResource.js'
import { encryptSecret, decryptSecret } from '../lib/secretBox.js'
import { resetCrmSettings } from './crm-routes-helpers.js'

const state = vi.hoisted(() => ({ user: null as Request['user'] | null, token: null as Request['agentToken'] | null }))
vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!state.user) return res.sendStatus(401)
    req.user = state.user
    next()
  },
}))
vi.mock('../lib/nextcloud.js', () => ({
  provisionNextcloudIntern: vi.fn().mockResolvedValue(undefined),
  deleteNextcloudUser: vi.fn().mockResolvedValue(undefined),
  syncUploadToNextcloud: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/email.js', () => ({
  sendAdminCredentials: vi.fn().mockResolvedValue(undefined),
  sendTicketReplyEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/email/templates/report.js', () => ({
  sendInternReportEmail: vi.fn().mockResolvedValue(undefined),
  sendReportValidatedEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/email/templates/project.js', () => ({
  sendResourcePublishedEmail: vi.fn().mockResolvedValue(undefined),
}))

let app: Express
let users: Record<string, any>
const files: string[] = []
function actAs(role: string) {
  const user = users[role]
  state.user = { id: String(user._id), role: user.role, name: user.name, email: user.email }
}
function fixture(dir: string, name: string) {
  const file = path.resolve('uploads', dir, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '<script>alert(1)</script>')
  files.push(file)
  return file
}

beforeAll(async () => {
  await setupMongo()
  const [
    { default: interns },
    { default: crm },
    { default: search },
    { default: resources },
    { default: agentCrm },
    { default: agentExtras },
  ] = await Promise.all([
    import('../routes/admin/interns/index.js'),
    import('../routes/admin/crm.js'),
    import('../routes/admin/search.js'),
    import('../routes/admin/resources.js'),
    import('../routes/agent/crm.js'),
    import('../routes/agent/crmExtras.js'),
  ])
  app = express()
  app.use(express.json())
  app.use('/interns', interns)
  app.use('/crm', crm)
  app.use('/search', search)
  app.use('/resources', resources)
  app.use('/agent', (req, _res, next) => {
    req.agentToken = state.token!
    next()
  })
  app.use('/agent', agentCrm)
  app.use('/agent/crm', agentExtras)
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(400).json({ error: err.message })
  })
})
beforeEach(async () => {
  await clearDb()
  users = {}
  for (const role of ['SUPER_ADMIN', 'RH', 'ADMIN', 'STAGIAIRE', 'CLIENT', 'MANAGER']) {
    users[role] = await User.create({
      role,
      name: role,
      email: `${role}@access.test`,
      passwordHash: 'x',
      twoFactorEnabled: true,
    })
  }
  state.user = null
  state.token = null
  await resetCrmSettings({ duplicateDetectionEnabled: false })
})
afterAll(async () => {
  for (const file of files) fs.rmSync(file, { force: true })
  await teardownMongo()
})

it('réserve les fiches à RH/super-admin et les rapports propres au stagiaire', async () => {
  actAs('CLIENT')
  await request(app).get('/interns/reports/all').expect(403)
  await request(app).post('/interns/reports').send({ contenu: 'interdit' }).expect(403)
  expect(await Intern.countDocuments()).toBe(0)
  const intern = await Intern.create({
    userId: users.CLIENT._id,
    poste: 'Stage',
    dateDebut: new Date(),
    dateFin: new Date(),
    createdBy: users.SUPER_ADMIN._id,
  })
  actAs('ADMIN')
  for (const url of ['', `/${intern._id}`, `/${intern._id}/detail`, '/reports/all']) {
    await request(app).get(`/interns${url}`).expect(403)
  }
  actAs('RH')
  await request(app).get('/interns').expect(200)
  await request(app).get('/interns/reports/all').expect(200)
  actAs('STAGIAIRE')
  await request(app).get('/interns').expect(403)
  await request(app).get('/interns/reports/all').expect(403)
  const created = await request(app)
    .post('/interns/reports')
    .send({ contenu: 'Mon rapport', internId: String(intern._id) })
    .expect(201)
  expect(created.body.internId).not.toBe(String(intern._id))
  expect(String((await Intern.findById(created.body.internId))!.userId)).toBe(String(users.STAGIAIRE._id))
  await ActivityReport.create({
    internId: created.body.internId,
    userId: users.CLIENT._id,
    date: new Date(),
    contenu: 'Rapport d’un autre auteur',
  })
  const mine = await request(app).get('/interns/reports/mine').expect(200)
  expect(mine.body.map((r: any) => r._id)).toEqual([created.body._id])
  // Un rôle interne non gestionnaire garde la main sur ses propres rapports, pas sur ceux des autres.
  actAs('ADMIN')
  const own = await request(app).post('/interns/reports').send({ contenu: 'Rapport de l’admin' }).expect(201)
  await request(app).delete(`/interns/reports/${created.body._id}`).expect(403)
  await request(app).delete(`/interns/reports/${own.body._id}`).expect(200)
})

it('authentifie les fichiers, limite les rapports au propriétaire et nomme les dépôts par UUID', async () => {
  const name = `legacy-${crypto.randomUUID()}.pdf`
  fixture('reports', name)
  fixture('conventions', name)
  await request(app).get(`/interns/conventions/files/${name}`).expect(401)
  await request(app).get(`/interns/reports/files/${name}`).expect(401)
  actAs('CLIENT')
  await request(app).get(`/interns/conventions/files/${name}`).expect(403)
  actAs('STAGIAIRE')
  await request(app).get(`/interns/conventions/files/${name}`).expect(403)
  await request(app).get(`/interns/reports/files/${name}`).expect(404)
  await ActivityReport.create({
    userId: users.CLIENT._id,
    internId: new mongoose.Types.ObjectId(),
    date: new Date(),
    contenu: 'Autre',
    attachments: [{ filename: name, originalName: name, mimetype: 'application/pdf', size: 1 }],
  })
  await request(app).get(`/interns/reports/files/${name}`).expect(404)
  await ActivityReport.updateOne({ 'attachments.filename': name }, { userId: users.STAGIAIRE._id })
  await request(app).get(`/interns/reports/files/${name}`).expect(200)
  const uploaded = await request(app)
    .post('/interns/reports')
    .field('contenu', 'Pièce jointe')
    .attach('files', Buffer.from('document'), { filename: 'rapport.pdf', contentType: 'application/pdf' })
    .expect(201)
  const filename = uploaded.body.attachments[0].filename
  files.push(path.resolve('uploads/reports', filename))
  expect(filename).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/)
  actAs('RH')
  await request(app).get(`/interns/conventions/files/${name}`).expect(200)
})

it('refuse un téléversement actif et force le téléchargement des anciens fichiers', async () => {
  actAs('SUPER_ADMIN')
  const file = fixture('resources', `${crypto.randomUUID()}.html`)
  const resource = await CompanyResource.create({
    name: 'Ancien',
    originalName: 'page.html',
    storagePath: file,
    mimeType: 'text/html',
    uploadedBy: users.SUPER_ADMIN._id,
  })
  const downloaded = await request(app).get(`/resources/${resource._id}/download`).expect(200)
  expect(downloaded.headers['content-type']).toMatch(/^application\/octet-stream/)
  expect(downloaded.headers['content-disposition']).toMatch(/^attachment;/)
  expect(downloaded.headers['x-content-type-options']).toBe('nosniff')
  // Un PDF s'affiche en ligne, avec un type fixé par le serveur et non par l'uploadeur.
  const pdf = await CompanyResource.create({
    name: 'Notice',
    originalName: 'notice.pdf',
    storagePath: file,
    mimeType: 'text/html',
    uploadedBy: users.SUPER_ADMIN._id,
  })
  const previewed = await request(app).get(`/resources/${pdf._id}/download`).expect(200)
  expect(previewed.headers['content-type']).toMatch(/^application\/pdf/)
  expect(previewed.headers['content-disposition']).toMatch(/^inline;/)
  expect(previewed.headers['x-content-type-options']).toBe('nosniff')
  await request(app)
    .post('/resources')
    .field('name', 'Interdit')
    .attach('file', Buffer.from('<svg/>'), { filename: 'payload.svg', contentType: 'image/svg+xml' })
    .expect(400)
  await request(app)
    .post('/resources')
    .field('name', 'MIME interdit')
    .attach('file', Buffer.from('<html/>'), { filename: 'rapport.pdf', contentType: 'text/html' })
    .expect(400)
})

it('masque les factures et tous les montants réalisés sans VIEW_BILLING, en gardant le budget', async () => {
  await User.updateOne({ _id: users.ADMIN._id }, { deniedPermissions: ['view_billing'] })
  actAs('ADMIN')
  const lead = await Lead.create({ company: 'Budget visible', budget: 1234, status: 'WON', createdBy: users.ADMIN._id })
  const project = await Project.create({ name: 'Projet lié', client: users.CLIENT._id, sourceLead: lead._id })
  await BillingDocument.collection.insertMany([
    { project: project._id, number: 'TEST-QUOTE', type: 'QUOTE', status: 'ACCEPTED', total: 900, currency: 'EUR' },
    { project: project._id, number: 'TEST-INVOICE', type: 'INVOICE', status: 'PAID', total: 450, currency: 'EUR' },
  ])
  const revenue = await request(app).get(`/crm/leads/${lead._id}/revenue`).expect(200)
  expect(revenue.body.lead.budget).toBe(1234)
  expect(revenue.body.documents).toBeNull()
  expect(revenue.body.summary).toBeNull()
  expect(revenue.body.byCurrency).toBeNull()
  const pilotage = await request(app).get('/crm/pilotage').expect(200)
  expect(pilotage.body.revenue.declaredBudget).toBe(1234)
  expect(pilotage.body.revenue.signed).toBeNull()
  expect(pilotage.body.revenue.collected).toBeNull()
  expect(pilotage.body.revenue.byCurrency).toBeNull()
  expect(pilotage.body.bySource[0].wonSigned).toBeNull()
  await User.updateOne({ _id: users.ADMIN._id }, { deniedPermissions: [] })
  const visible = await request(app).get(`/crm/leads/${lead._id}/revenue`).expect(200)
  expect(visible.body.summary.signed).toBe(900)
  expect(visible.body.summary.collected).toBe(450)
})

it('filtre la recherche par permission et périmètre et fournit les liens des fiches', async () => {
  const own = await Lead.create({ company: 'Trouvable propre', assignedTo: users.MANAGER._id })
  await Lead.create({ company: 'Trouvable autre', assignedTo: users.ADMIN._id })
  await User.updateOne({ _id: users.CLIENT._id }, { name: 'Trouvable client' })
  await User.updateOne(
    { _id: users.MANAGER._id },
    { grantedPermissions: ['view_crm'], deniedPermissions: ['manage_clients'] },
  )
  actAs('MANAGER')
  const scoped = await request(app).get('/search?q=Trouvable').expect(200)
  expect(scoped.body.results.map((r: any) => r.id)).toEqual([String(own._id)])
  expect(scoped.body.results[0].link).toBe(`/admin/crm/leads/${own._id}`)
  await User.updateOne({ _id: users.MANAGER._id }, { deniedPermissions: ['manage_clients', 'view_crm'] })
  expect((await request(app).get('/search?q=Trouvable').expect(200)).body.results).toEqual([])
  actAs('SUPER_ADMIN')
  const all = await request(app).get('/search?q=Trouvable').expect(200)
  expect(all.body.results.find((r: any) => r.type === 'client').link).toBe(`/admin/comptes-clients/${users.CLIENT._id}`)
})

it('applique les entités du propriétaire aux lectures et mutations agent, y compris les actions groupées', async () => {
  await User.updateOne({ _id: users.ADMIN._id }, { crmEntities: ['ARROW'] })
  const token = await AgentToken.create({
    name: 'Local',
    prefix: 'vno_pat_12345678',
    tokenHash: 'x',
    scopes: ['read:crm', 'write:crm'],
    createdBy: users.ADMIN._id,
  })
  state.token = {
    id: String(token._id),
    scopes: ['read:crm', 'write:crm'],
    name: 'Local',
    prefix: token.prefix,
    rateLimitPerMin: 1000,
  }
  const own = await Lead.create({ company: 'Autorisé', entity: 'ARROW' })
  const other = await Lead.create({ company: 'Autre entité', entity: 'VENIO' })
  const list = await request(app).get('/agent/leads').expect(200)
  expect(list.body.items.map((l: any) => l._id)).toEqual([String(own._id)])
  expect((await request(app).get('/agent/leads?entity=VENIO').expect(200)).body.total).toBe(0)
  await request(app).get(`/agent/leads/${other._id}`).expect(404)
  await request(app).get(`/agent/leads/${other._id}/activities`).expect(404)
  await request(app).get(`/agent/crm/leads/${other._id}/timeline`).expect(404)
  await request(app).patch(`/agent/leads/${other._id}`).send({ company: 'Interdit' }).expect(404)
  await request(app).delete(`/agent/leads/${other._id}`).expect(404)
  await request(app).patch(`/agent/leads/${own._id}`).send({ entity: 'VENIO' }).expect(403)
  await request(app).post('/agent/leads').send({ company: 'Interdit', entity: 'VENIO' }).expect(403)
  const created = await request(app).post('/agent/leads').send({ company: 'Dans le périmètre' }).expect(201)
  expect(created.body.entity).toBe('ARROW')
  const bulk = await request(app)
    .post('/agent/crm/leads/bulk')
    .send({ ids: [String(other._id)], action: 'archive' })
    .expect(200)
  expect(bulk.body.failed).toBe(1)
  const exported = await request(app).get('/agent/crm/leads/export').expect(200)
  expect(exported.text).not.toContain('Autre entité')
  await request(app)
    .post('/agent/leads/import')
    .send({ externalRep: String(users.ADMIN._id), leads: [] })
    .expect(403)
  await request(app).post(`/agent/crm/RULES/${new mongoose.Types.ObjectId()}/SIMULATE/`).send({}).expect(403)
  await User.updateOne({ _id: users.ADMIN._id }, { crmEntities: [] })
  expect((await request(app).get('/agent/leads').expect(200)).body.total).toBe(3)
  await User.updateOne({ _id: users.ADMIN._id }, { crmEntities: ['ARROW'] })
  state.token.scopes = ['admin:*']
  expect((await request(app).get('/agent/leads').expect(200)).body.total).toBe(3)
})

it('refuse la clé de repli en production, conserve le chiffrement local', () => {
  vi.stubEnv('CREDENTIALS_KEY', '')
  vi.stubEnv('JWT_SECRET', '')
  try {
    vi.stubEnv('NODE_ENV', 'test')
    const local = encryptSecret('secret local')
    expect(decryptSecret(local)).toBe('secret local')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => encryptSecret('secret')).toThrow(/CREDENTIALS_KEY|JWT_SECRET/)
    expect(() => decryptSecret(local)).toThrow(/CREDENTIALS_KEY|JWT_SECRET/)
  } finally {
    vi.unstubAllEnvs()
  }
})

it('ne compte pas les ressources statiques dans la limite globale des API', async () => {
  const source = fs.readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
  const limiter = source.match(/app\.use\(\s*(?:'\/api',\s*)?rateLimit\(\{[\s\S]*?\}\),\s*\)/)![0]
  const limited = express()
  // Exécute uniquement le montage réel du limiteur, sans démarrer l'application ni ses services.
  new Function('app', 'rateLimit', limiter)(limited, rateLimit)
  limited.use((_req, res) => {
    res.sendStatus(200)
  })
  for (let i = 0; i < 201; i++) await request(limited).get('/assets/app.js').expect(200)
  for (let i = 0; i < 200; i++) await request(limited).get('/api/example').expect(200)
  await request(limited).get('/api/example').expect(429)
})
