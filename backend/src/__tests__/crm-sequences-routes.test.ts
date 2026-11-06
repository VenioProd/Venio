import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { asReqUser, resetCrmSettings, seedTeam, type Team, type TeamMember } from './crm-routes-helpers.js'
import { authHeaders, createAgentTokenInDb, createTestApp, uniqueIdempotencyKey } from './helpers/agentTestApp.js'

/**
 * Séquences d'e-mails (lot 5), routes : droits (administersCrm pour concevoir
 * et activer, manage_crm et périmètre d'écriture pour inscrire), validation,
 * refus d'inscription, lecture des inscriptions, API agent (read:crm,
 * write:crm, admin:*).
 */

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))
vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = authState.user
    next()
  },
}))
vi.mock('../lib/email/send.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendBulkEmail: vi.fn(async () => ({ results: [], sent: 0, failed: 0, total: 0 })),
}))
vi.mock('../lib/notifications.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createNotification: vi.fn(async () => null),
}))

let app: Express
let agentApp: Express
let team: Team
let Lead: typeof import('../models/Lead.js').default
let CrmSequence: typeof import('../models/CrmSequence.js').default
let Enrollment: typeof import('../models/CrmSequenceEnrollment.js').default

const as = (member: TeamMember | null) => {
  authState.user = member ? asReqUser(member) : null
}
const URL = '/api/admin/crm/sequences'
const AGENT = '/api/v1/agent/crm/sequences'
const STEPS = [
  { type: 'EMAIL', delayDays: 0, sendHourParis: 9, subject: 'Bonjour {contact}', body: 'Texte' },
  { type: 'TASK', delayDays: 2, taskTitle: 'Appeler {contact}' },
]

beforeAll(async () => {
  await setupMongo()
  Lead = (await import('../models/Lead.js')).default
  CrmSequence = (await import('../models/CrmSequence.js')).default
  Enrollment = (await import('../models/CrmSequenceEnrollment.js')).default
  await Enrollment.createIndexes()
  const { default: extras } = await import('../routes/admin/crmExtras.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/crm', extras)
  agentApp = await createTestApp()
})
afterAll(async () => {
  authState.user = null
  await teardownMongo()
})
beforeEach(async () => {
  await clearDb()
  team = await seedTeam()
  await resetCrmSettings()
  as(team.admin)
})

const lead = (owner: TeamMember, extra: Record<string, unknown> = {}) =>
  Lead.create({ company: `Société ${Math.random().toString(36).slice(2, 6)}`, contactName: 'Camille', contactEmail: `c${Math.random().toString(36).slice(2, 8)}@x.test`, status: 'CONTACTED', assignedTo: owner.id, createdBy: owner.id, ...extra })

const createSequence = async (extra: Record<string, unknown> = {}) => {
  as(team.admin)
  const res = await request(app).post(URL).send({ name: 'Relance', steps: STEPS, ...extra }).expect(201)
  return res.body as { _id: string; status: string }
}

describe('concevoir et activer : administrateurs du CRM', () => {
  it('ADMIN crée (toujours en brouillon), active, met en pause', async () => {
    const res = await request(app).post(URL).send({ name: 'Relance', steps: STEPS, status: 'ACTIVE' }).expect(201)
    expect(res.body).toMatchObject({ status: 'DRAFT', steps: [{ type: 'EMAIL', sendHourParis: 9 }, { type: 'TASK', delayDays: 2, sendHourParis: 9 }], stopOn: { reply: true, statusChange: true, statuses: ['WON', 'LOST'] } })
    const on = await request(app).patch(`${URL}/${res.body._id}`).send({ status: 'ACTIVE' }).expect(200)
    expect(on.body.status).toBe('ACTIVE')
    expect(on.body.activatedAt).toBeTruthy()
    const off = await request(app).patch(`${URL}/${res.body._id}`).send({ status: 'PAUSED' }).expect(200)
    expect(off.body.status).toBe('PAUSED')
  })

  it('un commercial (manage_crm) lit mais ne crée, ne modifie, n’active ni ne supprime', async () => {
    const created = await createSequence()
    as(team.commercialA)
    const list = await request(app).get(URL).expect(200)
    expect(list.body.canAdminister).toBe(false)
    expect(list.body.items).toHaveLength(1)
    await request(app).post(URL).send({ name: 'X', steps: STEPS }).expect(403)
    const res = await request(app).patch(`${URL}/${created._id}`).send({ status: 'ACTIVE' }).expect(403)
    expect(res.body.code).toBe('CRM_ADMIN_REQUIRED')
    await request(app).delete(`${URL}/${created._id}`).expect(403)
    expect((await CrmSequence.findById(created._id))!.status).toBe('DRAFT')
  })

  it('sans view_crm : aucun accès', async () => {
    as(team.comptable)
    await request(app).get(URL).expect(403)
  })

  it('validation des étapes et activation d’une séquence vide', async () => {
    const bad = await request(app).post(URL).send({ name: 'X', steps: [{ type: 'EMAIL', subject: '' }, { type: 'WAIT', sendHourParis: 22 }] }).expect(400)
    expect(bad.body.code).toBe('VALIDATION_ERROR')
    await request(app).post(URL).send({ steps: STEPS }).expect(400)
    const empty = await request(app).post(URL).send({ name: 'Vide' }).expect(201)
    const res = await request(app).patch(`${URL}/${empty.body._id}`).send({ status: 'ACTIVE' }).expect(409)
    expect(res.body.code).toBe('EMPTY_SEQUENCE')
    await request(app).patch(`${URL}/${empty.body._id}`).send({ status: 'ON' }).expect(400)
  })

  it('suppression refusée tant que des leads sont inscrits', async () => {
    const created = await createSequence()
    const l = await lead(team.admin)
    await request(app).post(`${URL}/${created._id}/enroll`).send({ leadIds: [String(l._id)] }).expect(200)
    const res = await request(app).delete(`${URL}/${created._id}`).expect(409)
    expect(res.body.code).toBe('HAS_OPEN_ENROLLMENTS')
    await request(app).post(`${URL}/${created._id}/unenroll`).send({ leadIds: [String(l._id)] }).expect(200)
    await request(app).delete(`${URL}/${created._id}`).expect(200)
    expect(await Enrollment.countDocuments()).toBe(0)
  })
})

describe('inscrire : manage_crm et périmètre d’écriture', () => {
  it('le commercial inscrit ses leads ; ceux d’un collègue sont refusés', async () => {
    const created = await createSequence()
    const mine = await lead(team.commercialA)
    const other = await lead(team.commercialB)
    as(team.commercialA)
    const res = await request(app).post(`${URL}/${created._id}/enroll`).send({ leadIds: [String(mine._id), String(other._id)] }).expect(200)
    expect(res.body.sequenceStatus).toBe('DRAFT')
    expect(res.body.enrolled.map((e: { leadId: string }) => e.leadId)).toEqual([String(mine._id)])
    expect(res.body.refused).toEqual([{ leadId: String(other._id), reason: 'NOT_FOUND' }])
    // Désinscrire le lead d'un collègue n'a aucun effet.
    as(team.admin)
    await request(app).post(`${URL}/${created._id}/enroll`).send({ leadIds: [String(other._id)] }).expect(200)
    as(team.commercialA)
    const un = await request(app).post(`${URL}/${created._id}/unenroll`).send({ leadIds: [String(other._id)] }).expect(200)
    expect(un.body.stopped).toEqual([])
  })

  it('le stagiaire (lecture seule) ne peut pas inscrire', async () => {
    const created = await createSequence()
    const l = await lead(team.stagiaire)
    as(team.stagiaire)
    await request(app).get(URL).expect(200)
    await request(app).post(`${URL}/${created._id}/enroll`).send({ leadIds: [String(l._id)] }).expect(403)
  })

  it('rend la liste des refus avec leur raison ; 200 leads au plus', async () => {
    const created = await createSequence()
    const ok = await lead(team.admin)
    const dnc = await lead(team.admin, { doNotContact: true })
    const won = await lead(team.admin, { status: 'WON' })
    const noMail = await lead(team.admin, { contactEmail: '' })
    const res = await request(app)
      .post(`${URL}/${created._id}/enroll`)
      .send({ leadIds: [ok, dnc, won, noMail].map((l) => String(l._id)) })
      .expect(200)
    expect(res.body.enrolled).toHaveLength(1)
    expect(res.body.refused.map((r: { reason: string }) => r.reason)).toEqual(['DO_NOT_CONTACT', 'CLOSED', 'NO_EMAIL'])
    const again = await request(app).post(`${URL}/${created._id}/enroll`).send({ leadIds: [String(ok._id)] }).expect(200)
    expect(again.body.refused).toEqual([{ leadId: String(ok._id), reason: 'ALREADY_ENROLLED' }])
    const many = Array.from({ length: 201 }, () => String(ok._id))
    expect((await request(app).post(`${URL}/${created._id}/enroll`).send({ leadIds: many }).expect(400)).body.code).toBe('TOO_MANY')
    await request(app).post(`${URL}/${created._id}/enroll`).send({ leadIds: ['nope'] }).expect(400)
  })

  it('statistiques, inscriptions d’une séquence, séquences d’un lead', async () => {
    const created = await createSequence()
    const a = await lead(team.commercialA)
    const b = await lead(team.commercialB)
    await request(app).post(`${URL}/${created._id}/enroll`).send({ leadIds: [String(a._id), String(b._id)] }).expect(200)
    await request(app).post(`${URL}/${created._id}/unenroll`).send({ leadIds: [String(b._id)] }).expect(200)
    const detail = await request(app).get(`${URL}/${created._id}`).expect(200)
    expect(detail.body.stats).toEqual({ total: 2, active: 1, paused: 0, completed: 0, stopped: 1, stoppedByReason: { MANUAL: 1 } })
    const enrollments = await request(app).get(`${URL}/${created._id}/enrollments?status=ACTIVE`).expect(200)
    expect(enrollments.body.total).toBe(1)
    expect(enrollments.body.items[0].lead).toMatchObject({ _id: String(a._id), company: a.company })
    expect(enrollments.body.items[0].openKey).toBeUndefined()
    const forLead = await request(app).get(`/api/admin/crm/leads/${a._id}/sequences`).expect(200)
    expect(forLead.body.items[0].sequence).toMatchObject({ _id: created._id, name: 'Relance' })
    // Le stagiaire ne voit que les inscriptions des leads qu'il peut lire.
    as(team.stagiaire)
    expect((await request(app).get(`${URL}/${created._id}/enrollments`).expect(200)).body.total).toBe(0)
    await request(app).get(`/api/admin/crm/leads/${a._id}/sequences`).expect(404)
  })
})

describe('API agent', () => {
  const agentPost = (path: string, secret: string, body: unknown) =>
    request(agentApp).post(`${AGENT}${path}`).set(authHeaders(secret, { idempotencyKey: uniqueIdempotencyKey() })).send(body as object)
  const code = (res: request.Response) => res.body.error?.code ?? res.body.code

  it('read:crm lit les séquences et les inscriptions, mais n’inscrit pas', async () => {
    const created = await createSequence()
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    const list = await request(agentApp).get(AGENT).set('Authorization', `Bearer ${plainSecret}`).expect(200)
    expect(list.body.items).toHaveLength(1)
    expect(list.body.canAdminister).toBe(false)
    await request(agentApp).get(`${AGENT}/${created._id}/enrollments`).set('Authorization', `Bearer ${plainSecret}`).expect(200)
    const l = await lead(team.admin)
    const res = await agentPost(`/${created._id}/enroll`, plainSecret, { leadIds: [String(l._id)] })
    expect(res.status).toBe(403)
    expect(code(res)).toBe('INSUFFICIENT_SCOPE')
  })

  it('write:crm inscrit, mais ne crée ni n’active de séquence', async () => {
    const created = await createSequence()
    const { plainSecret } = await createAgentTokenInDb(['read:crm', 'write:crm'])
    const l = await lead(team.admin)
    const res = await agentPost(`/${created._id}/enroll`, plainSecret, { leadIds: [String(l._id)] })
    expect(res.status).toBe(200)
    expect(res.body.enrolled).toHaveLength(1)
    const create = await agentPost('', plainSecret, { name: 'Agent', steps: STEPS })
    expect(create.status).toBe(403)
    expect(code(create)).toBe('CRM_ADMIN_REQUIRED')
    const activate = await request(agentApp).patch(`${AGENT}/${created._id}`).set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() })).send({ status: 'ACTIVE' })
    expect(activate.status).toBe(403)
    expect((await CrmSequence.findById(created._id))!.status).toBe('DRAFT')
  })

  it('admin:* crée et active', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm', 'write:crm', 'admin:*'])
    const create = await agentPost('', plainSecret, { name: 'Agent', steps: STEPS })
    expect(create.status).toBe(201)
    expect(create.body.status).toBe('DRAFT')
    const activate = await request(agentApp).patch(`${AGENT}/${create.body._id}`).set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() })).send({ status: 'ACTIVE' })
    expect(activate.status).toBe(200)
    expect(activate.body.status).toBe('ACTIVE')
  })
})
