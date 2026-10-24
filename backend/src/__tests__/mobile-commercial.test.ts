import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import User from '../models/User.js'
import MobileDevice from '../models/MobileDevice.js'
import Lead from '../models/Lead.js'
import Project from '../models/Project.js'
import Interaction from '../models/Interaction.js'
import QuoteProposal from '../models/QuoteProposal.js'
import quoteRoutes from '../routes/admin/quoteProposals.js'
import crmRoutes from '../routes/admin/crm.js'
import billingRoutes from '../routes/admin/billing.js'
import clientRoutes from '../routes/admin/clients/index.js'

const app = express().use(express.json())
let bearer: string
let author: string
let project: string
beforeAll(async () => {
  await setupMongo()
  app.use('/api/admin/quote-proposals', quoteRoutes)
  app.use('/api/admin/crm', crmRoutes)
  app.use('/api/admin/billing', billingRoutes)
  app.use('/api/admin/clients', clientRoutes)
  app.use('/api/admin/quote-templates', (await import('../routes/admin/quoteTemplates.js')).default)
  app.use('/api/mobile/today', (await import('../routes/mobile/today.js')).default)
  app.use('/api/mobile/sync', (await import('../routes/mobile/sync.js')).default)
  app.use('/api/mobile/interactions', (await import('../routes/mobile/interactions.js')).default)
  await Interaction.init()
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  const user = await User.create({ name: 'Com', email: 'com@test.invalid', passwordHash: 'x', role: 'COMMERCIAL' })
  author = String(user._id)
  project = String((await Project.create({ name: 'Site', client: user._id, assignedTo: user._id }))._id)
  const device = await MobileDevice.create({
    userId: author,
    name: 'iPhone test',
    platform: 'ios',
    expiresAt: new Date(Date.now() + 30 * 86400000),
  })
  const session = await createSession(author, { deviceId: String(device._id), tokenPrefix: 'vnm_at_' })
  bearer = `Bearer ${session.token}`
})

it('crée au prix du modèle, initialise les options et envoie seulement son devis', async () => {
  const { default: QuoteTemplate } = await import('../models/QuoteTemplate.js')
  const template = await QuoteTemplate.create({
    name: 'Site',
    title: 'Refonte',
    intro: 'Intro',
    createdBy: author,
    questions: [{ type: 'text', label: 'Besoin ?' }],
    lines: [{ description: 'Option', unitPrice: 500, isOptional: true, isSelectedByDefault: true }],
    validityDays: 10,
  })
  const created = await request(app)
    .post('/api/admin/quote-proposals/from-template')
    .set('Authorization', bearer)
    .send({ templateId: template._id, project, lines: [{ unitPrice: 1 }], status: 'SIGNED', createdBy: project })
    .expect(201)
  const proposal = created.body.proposal
  expect(proposal).toMatchObject({
    status: 'DRAFT',
    createdBy: author,
    intro: 'Intro',
    lines: [expect.objectContaining({ unitPrice: 500 })],
  })
  expect(proposal.selectedOptionalLineIds).toEqual([proposal.lines[0]._id])
  expect(proposal.specification.content).toContain('Option')
  expect(new Date(proposal.expiresAt).getTime() - Date.now()).toBeGreaterThan(9 * 86400000)
  await request(app).post(`/api/admin/quote-proposals/${proposal._id}/send`).set('Authorization', bearer).expect(200)
  await QuoteProposal.findByIdAndUpdate(proposal._id, { status: 'DRAFT', createdBy: new mongoose.Types.ObjectId() })
  const forbidden = await request(app)
    .post(`/api/admin/quote-proposals/${proposal._id}/send`)
    .set('Authorization', bearer)
    .expect(403)
  expect(forbidden.body.code).toBe('NOT_PROPOSAL_OWNER')
  await request(app)
    .patch(`/api/admin/quote-proposals/${proposal._id}`)
    .set('Authorization', bearer)
    .send({ title: 'x' })
    .expect(403)
  await request(app).post(`/api/admin/quote-proposals/${proposal._id}/cancel`).set('Authorization', bearer).expect(403)
  await request(app)
    .post(`/api/admin/quote-proposals/${proposal._id}/rebuild-document`)
    .set('Authorization', bearer)
    .expect(403)
  await request(app)
    .post('/api/admin/quote-proposals')
    .set('Authorization', bearer)
    .send({ project, title: 'x' })
    .expect(403)
  await request(app).post(`/api/admin/billing/projects/${project}/quotes`).set('Authorization', bearer).expect(403)
  await request(app).get(`/api/admin/quote-proposals/${proposal._id}`).set('Authorization', bearer).expect(200)
  await request(app).get('/api/admin/quote-templates').set('Authorization', bearer).expect(200)
  await request(app).delete(`/api/admin/quote-templates/${template._id}`).set('Authorization', bearer).expect(403)

  // Le projet d'un collègue n'est pas dans son portefeuille ; celui issu de son lead l'est.
  const foreign = await Project.create({ name: 'Autre', client: author, assignedTo: new mongoose.Types.ObjectId() })
  const outOfScope = await request(app)
    .post('/api/admin/quote-proposals/from-template')
    .set('Authorization', bearer)
    .send({ templateId: template._id, project: foreign._id })
    .expect(403)
  expect(outOfScope.body.code).toBe('PROJECT_OUT_OF_SCOPE')
  // Rattacher le projet d'un collègue à son propre lead n'ouvre pas le droit de le chiffrer.
  const lead = await Lead.create({ company: 'Prospect', assignedTo: author })
  await request(app)
    .post(`/api/admin/crm/leads/${lead._id}/projects/${foreign._id}`)
    .set('Authorization', bearer)
    .expect(200)
  await request(app)
    .post('/api/admin/quote-proposals/from-template')
    .set('Authorization', bearer)
    .send({ templateId: template._id, project: foreign._id })
    .expect(403)
  // Le projet d'un client dont il est propriétaire, si.
  const owned = await User.create({
    name: 'Client',
    email: 'owned@test.invalid',
    passwordHash: 'x',
    role: 'CLIENT',
    ownerAdminId: author,
  })
  const ownedProject = await Project.create({ name: 'Son client', client: owned._id })
  await request(app)
    .post('/api/admin/quote-proposals/from-template')
    .set('Authorization', bearer)
    .send({ templateId: template._id, project: ownedProject._id })
    .expect(201)
})

it('le commercial lit aussi les leads de ses collègues', async () => {
  const lead = await Lead.create({ company: 'Autre', assignedTo: new mongoose.Types.ObjectId() })
  const response = await request(app).get('/api/admin/crm/leads').set('Authorization', bearer).expect(200)
  expect(response.body.leads.map((item: any) => item._id)).toContain(String(lead._id))
  await request(app).get(`/api/admin/crm/leads/${lead._id}`).set('Authorization', bearer).expect(200)
  await request(app).get(`/api/admin/crm/leads/${lead._id}/activities`).set('Authorization', bearer).expect(200)
})

it('classe les relances aux bornes du jour parisien de changement d’heure', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-25T12:00:00Z').getTime())
  try {
    await Lead.create([
      { company: 'Retard', nextActionAt: '2026-10-24T21:59:59.999Z', assignedTo: author },
      { company: 'Début', nextActionAt: '2026-10-24T22:00:00Z', assignedTo: author },
      { company: 'Fin', nextActionAt: '2026-10-25T22:59:59.999Z', assignedTo: author },
      { company: 'Demain', nextActionAt: '2026-10-25T23:00:00Z', assignedTo: author },
      { company: 'Gagné', nextActionAt: '2026-10-24T12:00:00Z', assignedTo: author, status: 'WON' },
      { company: 'Chaud', assignedTo: author, leadTemperature: 'CHAUD' },
      { company: 'Entrant', source: 'FORMULAIRE_SITE', createdAt: '2026-10-24T12:00:00Z' },
    ])
    const result = await request(app).get('/api/mobile/today?tz=Europe/Paris').set('Authorization', bearer).expect(200)
    expect(result.body.followUps.overdue.items.map((x: any) => x.company)).toEqual(['Retard'])
    expect(result.body.followUps.today.items.map((x: any) => x.company)).toEqual(['Début', 'Fin'])
    expect(result.body.hotLeadsWithoutAction.total).toBe(1)
    expect(result.body.newInboundLeads.total).toBe(1)
    await request(app).get('/api/mobile/today?tz=invalid').set('Authorization', bearer).expect(400)
  } finally {
    vi.restoreAllMocks()
  }
})

it('pagine les dates identiques sans perte et exclut les écritures de moins de deux secondes', async () => {
  const stamp = new Date(Date.now() - 10000)
  await Lead.insertMany(
    Array.from({ length: 5 }, (_, i) => ({ company: `Lead ${i}`, assignedTo: author, updatedAt: stamp })),
  )
  await Lead.create({ company: 'En cours', assignedTo: author })
  const ids: string[] = []
  let cursor = ''
  for (let page = 0; page < 3; page++) {
    const result = await request(app)
      .get('/api/mobile/sync/leads')
      .query({ cursor, limit: 2 })
      .set('Authorization', bearer)
      .expect(200)
    ids.push(...result.body.items.map((x: any) => x._id))
    cursor = result.body.nextCursor
    expect(result.body.hasMore).toBe(page < 2)
  }
  expect(ids).toHaveLength(5)
  expect(new Set(ids).size).toBe(5)
})

it('publie les suppressions autorisées et impose une resynchro après 90 jours', async () => {
  const lead = await Lead.create({ company: 'Supprimé', assignedTo: author })
  await lead.deleteOne()
  await Project.deleteOne({ _id: project })
  const { default: SyncTombstone } = await import('../models/SyncTombstone.js')
  await SyncTombstone.updateMany({}, { $set: { deletedAt: new Date(Date.now() - 10000) } })
  await User.findByIdAndUpdate(author, { deniedPermissions: ['view_projects'] })
  const result = await request(app).get('/api/mobile/sync/deletions').set('Authorization', bearer).expect(200)
  expect(result.body.items.map((x: any) => [x.entityType, x.entityId])).toEqual([['leads', String(lead._id)]])
  const old = Buffer.from(
    JSON.stringify({ u: new Date(Date.now() - 91 * 86400000).toISOString(), id: String(lead._id) }),
  ).toString('base64url')
  const expired = await request(app)
    .get('/api/mobile/sync/deletions')
    .query({ cursor: old })
    .set('Authorization', bearer)
    .expect(410)
  expect(expired.body.code).toBe('SYNC_RESET_REQUIRED')
})

it('journalise une seule interaction malgré les rejeux concurrents et refuse le changement de corps', async () => {
  const lead = await Lead.create({ company: 'Appelé', assignedTo: author })
  const key = randomUUID()
  const payload = {
    subjectType: 'LEAD',
    subjectId: String(lead._id),
    kind: 'CALL',
    body: 'Call back tomorrow',
    lang: 'en',
  }
  const post = () =>
    request(app).post('/api/mobile/interactions').set('Authorization', bearer).set('Idempotency-Key', key).send(payload)
  const results = await Promise.all([post(), post()])
  expect(results.map((r) => r.status).sort()).toEqual([200, 201])
  expect(results[0].body.interaction._id).toBe(results[1].body.interaction._id)
  expect(await Interaction.countDocuments()).toBe(1)
  const conflict = await request(app)
    .post('/api/mobile/interactions')
    .set('Authorization', bearer)
    .set('Idempotency-Key', key)
    .send({ ...payload, body: 'Autre' })
    .expect(409)
  expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT')
  await request(app).post('/api/mobile/interactions').set('Authorization', bearer).send(payload).expect(400)

  // L'original est conservé avec sa langue, et la synchro dit à quel lead il se rattache.
  await Interaction.updateMany({}, { $set: { updatedAt: new Date(Date.now() - 5000) } }, { timestamps: false })
  const synced = await request(app).get('/api/mobile/sync/interactions').set('Authorization', bearer).expect(200)
  expect(synced.body.items).toMatchObject([
    { body: 'Call back tomorrow', lang: 'en', subjectType: 'LEAD', subjectId: String(lead._id) },
  ])
})

it('réserve l’édition des modèles à la facturation et archive sans supprimer', async () => {
  await User.findByIdAndUpdate(author, { grantedPermissions: ['manage_billing'] })
  const created = await request(app)
    .post('/api/admin/quote-templates')
    .set('Authorization', bearer)
    .send({ name: 'Standard', title: 'Devis', lines: [{ description: 'Travail', unitPrice: 42 }] })
    .expect(201)
  const id = created.body.template._id
  await request(app)
    .patch(`/api/admin/quote-templates/${id}`)
    .set('Authorization', bearer)
    .send({ validityDays: 15 })
    .expect(200)
  await request(app).delete(`/api/admin/quote-templates/${id}`).set('Authorization', bearer).expect(200)
  const listed = await request(app).get('/api/admin/quote-templates').set('Authorization', bearer).expect(200)
  expect(listed.body.templates).toEqual([])
  await request(app)
    .post('/api/admin/quote-proposals/from-template')
    .set('Authorization', bearer)
    .send({ templateId: id, project })
    .expect(404)
  const { default: QuoteTemplate } = await import('../models/QuoteTemplate.js')
  expect(await QuoteTemplate.countDocuments()).toBe(1)
})

it('lit le calendrier local et repère un devis consulté, même si le calendrier tombe ensuite en panne', async () => {
  const { default: Task } = await import('../models/Task.js')
  await Task.create({ project, title: 'RDV', assignee: author, createdBy: author, dueDate: new Date() })
  const proposal = await QuoteProposal.create({
    project,
    client: author,
    createdBy: author,
    title: 'Vu',
    status: 'SENT',
    firstViewedAt: new Date(),
  })
  await QuoteProposal.create({ project, client: author, createdBy: author, title: 'Pas encore vu', status: 'SENT' })
  const first = await request(app).get('/api/mobile/today').set('Authorization', bearer).expect(200)
  expect(first.body.meetings.total).toBe(1)
  expect(first.body.quotesViewedNotSigned.items.map((x: any) => x._id)).toEqual([String(proposal._id)])
  const failure = vi.spyOn(Task, 'aggregate').mockImplementation(() => {
    throw new Error('Calendrier indisponible')
  })
  try {
    const fallback = await request(app).get('/api/mobile/today').set('Authorization', bearer).expect(200)
    expect(fallback.body.meetings).toEqual({ items: [], total: 0 })
  } finally {
    failure.mockRestore()
  }
})

it('capte aussi les suppressions par requête et par lot', async () => {
  const first = await Lead.create({ company: 'Un' })
  const second = await Lead.create({ company: 'Deux' })
  await Lead.findOneAndDelete({ _id: first._id })
  await Lead.deleteMany({ _id: second._id })
  const { default: SyncTombstone } = await import('../models/SyncTombstone.js')
  const tombstones = await SyncTombstone.find({ entityType: 'leads' })
  expect(tombstones.map((x) => String(x.entityId)).sort()).toEqual([String(first._id), String(second._id)].sort())
})

it('protège les types de synchro et date les mises à jour de projet', async () => {
  const { default: ProjectUpdate } = await import('../models/ProjectUpdate.js')
  const update = await ProjectUpdate.create({ project, createdBy: author, title: 'Point' })
  expect(update.updatedAt).toBeInstanceOf(Date)
  await User.findByIdAndUpdate(author, { deniedPermissions: ['view_projects', 'view_billing', 'manage_quotes'] })
  await request(app).get('/api/mobile/sync/projects').set('Authorization', bearer).expect(403)
  await request(app).get('/api/mobile/sync/quotes').set('Authorization', bearer).expect(403)
})

it('ne synchronise les étapes, ni leurs suppressions, sans view_phases', async () => {
  const { default: ProjectPhase } = await import('../models/ProjectPhase.js')
  const phase = await ProjectPhase.create({ project, title: 'Maquettes', order: 0, createdBy: author })
  await phase.deleteOne()
  await ProjectPhase.create({ project, title: 'Recette', order: 1, createdBy: author })
  await User.findByIdAndUpdate(author, { deniedPermissions: ['view_phases'] })
  await new Promise((resolve) => setTimeout(resolve, 2100))

  await request(app).get('/api/mobile/sync/projects').set('Authorization', bearer).expect(200)
  await request(app).get('/api/mobile/sync/projectPhases').set('Authorization', bearer).expect(403)
  const deletions = await request(app).get('/api/mobile/sync/deletions').set('Authorization', bearer).expect(200)
  expect(deletions.body.items.map((item: { entityType: string }) => item.entityType)).not.toContain('projectPhases')
})

it('ne montre les leads entrants que dans le périmètre CRM de lecture', async () => {
  const admin = await User.create({ name: 'Adm', email: 'adm@test.invalid', passwordHash: 'x', role: 'ADMIN' })
  const device = await MobileDevice.create({
    userId: admin._id,
    name: 'iPad',
    platform: 'ipados',
    expiresAt: new Date(Date.now() + 86400000),
  })
  const session = await createSession(String(admin._id), { deviceId: String(device._id), tokenPrefix: 'vnm_at_' })
  const inbound = { source: 'FORMULAIRE_SITE', assignedTo: null }
  await Lead.create({ ...inbound, company: 'Hors périmètre', createdBy: author })
  await Lead.create({ ...inbound, company: 'Le mien', createdBy: admin._id })

  const adminView = await request(app)
    .get('/api/mobile/today')
    .set('Authorization', `Bearer ${session.token}`)
    .expect(200)
  expect(adminView.body.newInboundLeads.items.map((lead: { company: string }) => lead.company)).toEqual(['Le mien'])
  // Le commercial lit tout le CRM : il voit les deux.
  const commercialView = await request(app).get('/api/mobile/today').set('Authorization', bearer).expect(200)
  expect(commercialView.body.newInboundLeads.total).toBe(2)
})

it('conserve un seul audio lors de deux créations concurrentes et le sert après contrôle des droits', async () => {
  const { readdir, readFile, unlink } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const dir = resolve('uploads', 'interactions')
  const before = new Set(await readdir(dir).catch(() => [] as string[]))
  const lead = await Lead.create({ company: 'Audio', assignedTo: author })
  const key = randomUUID()
  const post = () =>
    request(app)
      .post('/api/mobile/interactions')
      .set('Authorization', bearer)
      .set('Idempotency-Key', key)
      .field('subjectType', 'LEAD')
      .field('subjectId', String(lead._id))
      .field('kind', 'NOTE')
      .field('body', 'Transcription')
      .attach('audio', Buffer.from('audio synthétique'), { filename: 'note.m4a', contentType: 'audio/m4a' })
  try {
    const results = await Promise.all([post(), post()])
    expect(results.map((x) => x.status).sort()).toEqual([200, 201])
    const files = (await readdir(dir)).filter((name) => !before.has(name))
    expect(files).toHaveLength(1)
    expect(await readFile(resolve(dir, files[0]))).toEqual(Buffer.from('audio synthétique'))
    const audioUrl = results[0].body.audio.url
    await request(app).get(audioUrl).set('Authorization', bearer).expect(200)
    await User.findByIdAndUpdate(author, { deniedPermissions: ['view_crm'] })
    await request(app).get(audioUrl).set('Authorization', bearer).expect(403)
  } finally {
    for (const name of (await readdir(dir).catch(() => [] as string[])).filter((name) => !before.has(name)))
      await unlink(resolve(dir, name))
  }
})

it("réserve au navigateur l'email et le mot de passe d'un compte client", async () => {
  const client = await User.create({
    name: 'Client',
    email: 'client@test.invalid',
    passwordHash: 'x',
    role: 'CLIENT',
    ownerAdminId: author,
  })
  for (const body of [{ email: 'pirate@test.invalid' }, { password: 'choisi-par-moi' }]) {
    const res = await request(app).patch(`/api/admin/clients/${client._id}`).set('Authorization', bearer).send(body)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('BROWSER_SESSION_REQUIRED')
  }
  const credentials = await request(app)
    .post(`/api/admin/clients/${client._id}/send-credentials`)
    .set('Authorization', bearer)
    .send({ password: 'faux-mot-de-passe' })
    .expect(403)
  expect(credentials.body.code).toBe('BROWSER_SESSION_REQUIRED')
  expect((await User.findById(client._id).lean())?.email).toBe('client@test.invalid')
})
