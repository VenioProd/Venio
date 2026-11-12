import { afterAll, beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest'
import express, { type Request, type Response, type NextFunction } from 'express'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import Interaction from '../models/Interaction.js'
import CrmRule from '../models/CrmRule.js'
import CrmRuleRun from '../models/CrmRuleRun.js'
import CrmSettings from '../models/CrmSettings.js'
import PersonalTask from '../models/PersonalTask.js'
import CrmSequence from '../models/CrmSequence.js'
import Enrollment from '../models/CrmSequenceEnrollment.js'
import UserIdempotencyKey from '../models/UserIdempotencyKey.js'
import AutomationLock from '../automation/models/AutomationLock.js'
import * as interactions from '../lib/interactions.js'
import * as rules from '../lib/crmRules.js'
import * as privacy from '../lib/crmPrivacy.js'
import { screenBulkRecipients } from '../lib/crmBulkEmailGuard.js'
import { enrollLeads } from '../lib/crmSequences.js'
import { shouldRunNow, startAutomationScheduler, stopAutomationScheduler } from '../automation/scheduler.js'

const state = vi.hoisted(() => ({
  user: null as Request['user'] | null,
  calls: [] as any[],
  failNotify: false,
  jobs: [] as import('../automation/types.js').AutomationDefinition[],
}))
vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    req.user = state.user!
    next()
  },
}))
vi.mock('../lib/email/send.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  sendBulkEmail: vi.fn(async (input: any) => {
    state.calls.push(input)
    // Borne la régression de boucle pour que le test reste fini avant le correctif.
    if (state.calls.length > 1) await CrmRule.updateMany({ 'trigger.type': 'INTERACTION_LOGGED' }, { status: 'DRAFT' })
    const results = input.recipients.map((r: any) => ({ ...r, name: r.name ?? '', success: true }))
    return { results, sent: results.length, failed: 0, total: results.length }
  }),
}))
vi.mock('../lib/email.js', () => ({ sendContactReceiptEmail: vi.fn(async () => ({ sent: true })) }))
vi.mock('../lib/notifyHelpers.js', () => ({ notifySuperAdmins: vi.fn(async () => {}) }))
vi.mock('../lib/notifications.js', () => ({
  createNotification: vi.fn(async () => {
    if (state.failNotify) throw new Error('notification indisponible')
  }),
}))
vi.mock('../automation/registry.js', () => ({
  getCronAutomations: () => state.jobs,
  getAutomation: (key: string) => state.jobs.find((job) => job.key === key),
}))

let app: express.Express
let owner: InstanceType<typeof User>
const ctx = () => ({ depth: 0, chain: [], actorId: null })
const lead = (extra = {}) =>
  Lead.create({
    company: 'Acme',
    contactName: 'Ada',
    contactEmail: 'ada@example.test',
    assignedTo: owner._id,
    ...extra,
  })
const rule = (extra = {}) =>
  CrmRule.create({
    name: 'Envoi',
    status: 'ACTIVE',
    requireApproval: false,
    trigger: { type: 'STATUS_CHANGED', params: { to: ['PROPOSAL'] } },
    actions: [{ type: 'SEND_EMAIL', params: { subject: 'Bonjour', body: 'Bonjour {contact}' } }],
    limits: { perLead: 'NONE', days: 1, maxPerRun: 1 },
    ...extra,
  })
const event = { type: 'STATUS_CHANGED' as const, key: 'original', from: 'DEMO', to: 'PROPOSAL' }

beforeAll(async () => {
  await setupMongo()
  await Promise.all([CrmRuleRun.init(), UserIdempotencyKey.init(), AutomationLock.init(), Enrollment.init()])
  app = express()
  app.use(express.json(), express.urlencoded({ extended: false }))
  app.use('/interactions', (await import('../routes/admin/interactions.js')).default)
  app.use('/composer', (await import('../routes/admin/emailComposer.js')).default)
  app.use('/unsubscribe', (await import('../routes/public/unsubscribe.js')).default)
  app.use('/contact', (await import('../routes/public/contact.js')).default)
  app.use('/crm', (await import('../routes/admin/crmExtras.js')).default)
  app.use('/crm', (await import('../routes/admin/crm.js')).default)
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  state.calls = []
  state.failNotify = false
  state.jobs = []
  await CrmSettings.create({
    roundRobinEnabled: false,
    emailOnAssignment: false,
    scoringEnabled: false,
    autoQualifyEnabled: false,
  })
  owner = await User.create({
    name: 'Owner',
    email: 'owner@example.test',
    role: 'SUPER_ADMIN',
    passwordHash: 'x',
    twoFactorEnabled: true,
  })
  state.user = { id: String(owner._id), role: 'SUPER_ADMIN', email: owner.email, name: owner.name }
})
afterEach(() => {
  stopAutomationScheduler()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('1 conserve le succès SMTP si le journal échoue et tronque les champs journalisés', async () => {
  const l = await lead()
  const spy = vi.spyOn(interactions, 'logInteraction').mockRejectedValueOnce(new Error('journal indisponible'))
  expect((await rules.deliverEmail(l, { to: l.contactEmail, subject: 'Objet', body: 'Texte' }, null)).status).toBe('OK')
  spy.mockRestore()
  expect(
    (await rules.deliverEmail(l, { to: l.contactEmail, subject: 'x'.repeat(501), body: 'y'.repeat(20001) }, null))
      .status,
  ).toBe('OK')
  const logged = await Interaction.findOne()
  expect(logged?.subject).toHaveLength(500)
  expect(logged?.body).toHaveLength(20000)
})

it('2 réserve atomiquement la validation concurrente', async () => {
  const l = await lead()
  const r = await rule({ requireApproval: true })
  const run = await rules.runRule(r, l, event, ctx())
  const url = `/crm/rules/runs/${run!._id}/approve`
  const results = await Promise.all([request(app).post(url), request(app).post(url)])
  expect(results.map((result) => result.status).sort()).toEqual([200, 409])
  expect(state.calls).toHaveLength(1)
})

it('3 relance seulement l’étape en erreur et conserve l’exécution et son contexte', async () => {
  const l = await lead()
  const r = await rule({
    actions: [
      { type: 'SEND_EMAIL', params: { subject: 'Objet', body: 'Texte' } },
      { type: 'NOTIFY', params: { recipients: 'owner' } },
    ],
  })
  state.failNotify = true
  const run = await rules.runRule(r, l, event, ctx())
  expect(run!.status).toBe('ERR')
  const failed = await rules.retryRun(String(run!._id))
  expect(failed?.status).toBe('ERR')
  expect(await CrmRuleRun.findById(run!._id)).not.toBeNull()
  state.failNotify = false
  const retried = await rules.retryRun(String(run!._id))
  expect(retried?.status).toBe('OK')
  expect(String(retried?._id)).toBe(String(run!._id))
  expect(state.calls).toHaveLength(1)
  expect(retried?.steps[1].payload?.retry).toMatchObject({ event })
})

it('4 dépasse les 2000 premiers candidats et applique le quota après la fréquence', async () => {
  const r = await rule({
    trigger: { type: 'SCORE_AT_LEAST', params: { threshold: 0 } },
    actions: [{ type: 'ADD_TAG', params: { tag: 'traité' } }],
    limits: { perLead: 'ONCE', days: 1, maxPerRun: 1 },
  })
  const leads = await Lead.insertMany(Array.from({ length: 2001 }, (_, i) => ({ company: `Lead ${i}`, score: 80 })))
  await CrmRuleRun.insertMany(
    leads
      .slice(0, 2000)
      .map((l, i) => ({ rule: r._id, lead: l._id, eventKey: `old-${i}`, trigger: 'SCORE_AT_LEAST', status: 'OK' })),
  )
  expect((await rules.sweepRules()).runs).toBe(1)
  expect((await Lead.findById(leads[2000]._id))?.tags).toContain('traité')
})

it('5 refuse l’adresse normalisée opposée sur une autre fiche, dans les deux chemins', async () => {
  await lead({ doNotContact: true, contactEmail: ' ADA@EXAMPLE.TEST ' })
  const duplicate = await lead()
  expect(await privacy.checkProspectContact(duplicate)).toMatchObject({ allowed: false, via: 'LEAD' })
  expect((await screenBulkRecipients(['ada@example.test'])).allowed).toEqual([])
})

it('6 le formulaire arrête une séquence sur réponse et ne double pas la timeline', async () => {
  const l = await lead()
  const sequence = await CrmSequence.create({
    name: 'Suite',
    status: 'ACTIVE',
    steps: [{ type: 'EMAIL', subject: 'Suite', body: 'Bonjour', delayDays: 0 }],
    stopOn: { reply: true },
  })
  await enrollLeads(sequence, [String(l._id)], { actorId: String(owner._id), now: new Date(Date.now() - 60000) })
  const response = await request(app)
    .post('/contact')
    .send({
      firstName: 'Ada',
      lastName: 'Test',
      email: l.contactEmail,
      subject: 'Site web',
      message: 'Voici ma réponse',
      consent: true,
      website: '',
      startedAt: Date.now() - 2000,
    })
  expect(response.status).toBe(202)
  await vi.waitFor(async () => expect((await Enrollment.findOne())?.status).toBe('STOPPED'))
  expect(await Interaction.countDocuments({ subjectId: l._id, direction: 'IN' })).toBe(1)
  const timeline = await interactions.buildTimeline('LEAD', l._id)
  expect(timeline.entries.filter((e) => e.kind === 'CONTACT_FORM_SUBMITTED')).toHaveLength(0)
  expect(timeline.entries.filter((e) => e.kind === 'EMAIL' && e.direction === 'IN')).toHaveLength(1)
})

it('7 rejoue une réponse avec la même clé, refuse un autre corps et ajoute le lien de désinscription', async () => {
  const l = await lead()
  const url = `/interactions/LEAD/${l._id}/email`
  const key = 'email-client-request-001'
  const send = (body: string) => request(app).post(url).set('Idempotency-Key', key).send({ subject: 'Bonjour', body })
  const first = await send('Texte')
  expect(first.status).toBe(201)
  expect((await send('Texte')).body).toEqual(first.body)
  expect((await send('Autre')).status).toBe(409)
  expect(state.calls).toHaveLength(1)
  expect(state.calls[0].unsubscribeUrl).toContain('/api/public/unsubscribe?token=')
})

it('7 plafonne le composer et personnalise les liens des prospects', async () => {
  await lead()
  expect(
    (
      await request(app)
        .post('/composer/send')
        .send({ subject: 'Objet', body: 'Texte', recipients: Array(501).fill('x@example.test') })
    ).status,
  ).toBe(400)
  expect(state.calls).toHaveLength(0)
  const response = await request(app)
    .post('/composer/send')
    .send({ subject: 'Objet', body: 'Texte', recipients: ['ada@example.test', 'team@example.test'] })
  expect(response.status).toBe(200)
  expect(state.calls.find((c) => c.recipients[0].email === 'ada@example.test')?.unsubscribeUrl).toContain('token=')
  expect(state.calls.find((c) => c.recipients[0].email === 'team@example.test')?.unsubscribeUrl).toBeUndefined()
})

it('8 GET confirme sans écrire et POST applique aussi le one-click', async () => {
  const l = await lead()
  const token = privacy.signUnsubscribeToken({ leadId: l._id, email: l.contactEmail })
  const get = await request(app).get('/unsubscribe').query({ token })
  expect(get.status).toBe(200)
  expect(await privacy.isEmailSuppressed(l.contactEmail)).toBe(false)
  expect((await Lead.findById(l._id))?.doNotContact).toBe(false)
  expect(get.text).toContain('method="post"')
  const post = await request(app)
    .post('/unsubscribe')
    .query({ token })
    .type('form')
    .send({ 'List-Unsubscribe': 'One-Click' })
  expect(post.status).toBe(200)
  expect(await privacy.isEmailSuppressed(l.contactEmail)).toBe(true)
})

it('9 efface les imports, le nom de particulier, les titres de tâches et l’audio', async () => {
  const l = await lead({ company: 'Ada', extraInfo: { adresse: 'Rue personnelle' } })
  const filename = `audit-${randomUUID()}.m4a`
  const file = path.resolve('uploads', 'interactions', filename)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, 'audio-test')
  try {
    await Interaction.create({
      subjectType: 'LEAD',
      subjectId: l._id,
      kind: 'CALL',
      audio: { filename, originalName: 'Ada.m4a', mimeType: 'audio/m4a', size: 10 },
    })
    await PersonalTask.create({ userId: owner._id, leadId: l._id, title: 'Relancer Ada' })
    await privacy.anonymizeLead(l, { actor: String(owner._id), source: 'admin', reason: 'REQUEST' })
    const saved = await Lead.findById(l._id)
    expect(saved?.extraInfo).toEqual({})
    expect(saved?.company).toBe(privacy.ANONYMIZED_REQUEST_LABEL)
    expect((await PersonalTask.findOne())?.title).not.toContain('Ada')
    expect((await Interaction.findOne())?.audio).toBeNull()
    await expect(fs.stat(file)).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    await fs.rm(file, { force: true })
  }
})

it('10 rattrape sous 120 minutes avec le verrou existant, même après redémarrage', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  const now = new Date(2026, 10, 12, 9, 30)
  vi.setSystemTime(now)
  const execute = vi.fn(async () => ({ actionsExecuted: [], recipientsNotified: [] }))
  state.jobs = [
    {
      key: 'test.catchup',
      title: 'Test',
      domain: 'crm',
      triggerType: 'cron',
      schedule: '09:00',
      channels: [],
      recipientStrategy: [],
      retryable: false,
      maxRetries: 0,
      defaultEnabled: true,
      permissionsScope: [],
      buildIdempotencyKey: (c) => `test.catchup:${c.dateKey}`,
      evaluate: async () => true,
      execute,
    },
  ]
  expect(shouldRunNow('09:00', now)).toBe(true)
  expect(shouldRunNow('09:00', new Date(2026, 10, 12, 11, 1))).toBe(false)
  startAutomationScheduler()
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
  stopAutomationScheduler()
  startAutomationScheduler()
  await vi.waitFor(async () => expect(await AutomationLock.countDocuments({ automationKey: 'test.catchup' })).toBe(1))
  await new Promise((r) => setTimeout(r, 30))
  expect(execute).toHaveBeenCalledTimes(1)
})

it('11 les e-mails du moteur ne redéclenchent pas INTERACTION_LOGGED', async () => {
  const l = await lead()
  await rule({ trigger: { type: 'INTERACTION_LOGGED', params: {} } })
  await interactions.logInteraction({ subjectType: 'LEAD', subjectId: l._id, kind: 'NOTE', body: 'Déclencheur humain' })
  await vi.waitFor(async () => expect(await CrmRuleRun.countDocuments({ status: 'OK' })).toBeGreaterThan(0))
  await new Promise((r) => setTimeout(r, 60))
  expect(state.calls).toHaveLength(1)
  await vi.waitFor(async () => expect((await Lead.findById(l._id))?.interactionsCount).toBe(2))
})

it('12 NOTIFY admins exclut les inactifs et les comptes privés de view_crm', async () => {
  const { createNotification } = await import('../lib/notifications.js')
  await User.create({
    name: 'Absent',
    email: 'inactive@example.test',
    role: 'ADMIN',
    isActive: false,
    passwordHash: 'x',
  })
  await User.create({
    name: 'Refusé',
    email: 'denied@example.test',
    role: 'ADMIN',
    deniedPermissions: ['view_crm'],
    passwordHash: 'x',
  })
  const l = await lead()
  const r = await rule({ actions: [{ type: 'NOTIFY', params: { recipients: 'admins' } }] })
  vi.mocked(createNotification).mockClear()
  await rules.runRule(r, l, event, ctx())
  expect(vi.mocked(createNotification).mock.calls.map(([i]) => i.recipient)).toEqual([String(owner._id)])
})

it('12 refuse les seuils négatifs ou non numériques avant de modifier les réglages', async () => {
  expect((await request(app).patch('/crm/settings').send({ coldLeadThresholdDays: -1 })).status).toBe(400)
  expect((await request(app).patch('/crm/settings').send({ staleLeadThresholdDays: 'abc' })).status).toBe(400)
  expect((await CrmSettings.getSettings()).coldLeadThresholdDays).toBe(7)
})
