import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { authHeaders, createAgentTokenInDb, createTestApp, uniqueIdempotencyKey } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import Lead from '../models/Lead.js'
import CrmRuleRun from '../models/CrmRuleRun.js'

let app: Express
let adminId: string

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  adminId = String((await User.create({ email: 'a@venio.test', passwordHash: await bcrypt.hash('x', 10), name: 'Admin', role: 'SUPER_ADMIN' }))._id)
})

const BASE = '/api/v1/agent/crm'
const post = (path: string, secret: string, body: unknown) =>
  request(app).post(`${BASE}${path}`).set(authHeaders(secret, { idempotencyKey: uniqueIdempotencyKey() })).send(body as object)
const patch = (path: string, secret: string, body: unknown) =>
  request(app).patch(`${BASE}${path}`).set(authHeaders(secret, { idempotencyKey: uniqueIdempotencyKey() })).send(body as object)

describe('Agent CRM / scopes', () => {
  it('lecture avec read:crm, écriture refusée sans write:crm', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    await request(app).get(`${BASE}/views`).set('Authorization', `Bearer ${plainSecret}`).expect(200)
    await request(app).get(`${BASE}/rules`).set('Authorization', `Bearer ${plainSecret}`).expect(200)
    const res = await post('/leads/bulk', plainSecret, { ids: [], action: 'archive' })
    expect(res.status).toBe(403)
    expect(res.body.error?.code ?? res.body.code).toBe('INSUFFICIENT_SCOPE')
  })

  it('un token sans scope crm n’accède à rien', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:tasks'])
    await request(app).get(`${BASE}/rules`).set('Authorization', `Bearer ${plainSecret}`).expect(403)
  })
})

describe('Agent CRM / vues', () => {
  it('crée, liste, modifie et supprime une vue', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm', 'write:crm'])
    const created = await post('/views', plainSecret, { name: 'Arrow', scope: 'TEAM', filters: { project: 'ARROW' }, columns: ['company', 'budget'], mode: 'table' })
    expect(created.status).toBe(201)
    const dup = await post('/views', plainSecret, { name: 'Arrow' })
    expect(dup.status).toBe(409)
    const list = await request(app).get(`${BASE}/views`).set('Authorization', `Bearer ${plainSecret}`)
    expect(list.body.items).toHaveLength(1)
    const updated = await patch(`/views/${created.body._id}`, plainSecret, { name: 'Arrow actifs', pinned: true })
    expect(updated.body).toMatchObject({ name: 'Arrow actifs', pinned: true })
    await request(app).delete(`${BASE}/views/${created.body._id}`).set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() })).expect(200)
  })
})

describe('Agent CRM / actions groupées et export', () => {
  it('assigne, change le statut, tague, archive et exporte', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm', 'write:crm'])
    const leads = await Lead.create([{ company: '=cmd', budget: 1000 }, { company: 'B' }])
    const ids = leads.map((l) => String(l._id))

    const assigned = await post('/leads/bulk', plainSecret, { ids, action: 'assign', payload: { userId: adminId } })
    expect(assigned.body).toMatchObject({ ok: 2, failed: 0 })
    const status = await post('/leads/bulk', plainSecret, { ids, action: 'status', payload: { status: 'PROPOSAL' } })
    expect(status.body.ok).toBe(2)
    expect((await Lead.findById(ids[0]))!.probability).toBe(65)
    await post('/leads/bulk', plainSecret, { ids, action: 'tag', payload: { tag: 'vip' } })
    expect((await Lead.findById(ids[0]))!.tags).toContain('vip')

    const csv = await request(app).get(`${BASE}/leads/export?columns=company,budget,tags`).set('Authorization', `Bearer ${plainSecret}`)
    expect(csv.status).toBe(200)
    expect(csv.headers['content-type']).toContain('text/csv')
    expect(csv.text).toContain("'=cmd")

    await post('/leads/bulk', plainSecret, { ids: [ids[0]], action: 'archive' })
    const csv2 = await request(app).get(`${BASE}/leads/export?columns=company`).set('Authorization', `Bearer ${plainSecret}`)
    expect(csv2.text).not.toContain('cmd')
    const list = await request(app).get('/api/v1/agent/leads').set('Authorization', `Bearer ${plainSecret}`)
    expect(list.body.total).toBe(1)
  })

  it('exige confirm:true pour supprimer et nettoie les dépendances', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const lead = await Lead.create({ company: 'A' })
    const refused = await post('/leads/bulk', plainSecret, { ids: [String(lead._id)], action: 'delete' })
    expect(refused.status).toBe(400)
    expect(await Lead.countDocuments()).toBe(1)
    const done = await post('/leads/bulk', plainSecret, { ids: [String(lead._id)], action: 'delete', confirm: true })
    expect(done.body.ok).toBe(1)
    expect(await Lead.countDocuments()).toBe(0)
  })

  it('refuse plus de 200 identifiants et les identifiants invalides', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    expect((await post('/leads/bulk', plainSecret, { ids: ['nope'], action: 'archive' })).status).toBe(400)
  })

  it('timeline, tâches et documents d’un lead', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    const lead = await Lead.create({ company: 'A' })
    for (const p of ['timeline', 'tasks', 'documents']) {
      const res = await request(app).get(`${BASE}/leads/${lead._id}/${p}`).set('Authorization', `Bearer ${plainSecret}`)
      expect(res.status).toBe(200)
    }
    await request(app).get(`${BASE}/leads/64b000000000000000000000/timeline`).set('Authorization', `Bearer ${plainSecret}`).expect(404)
  })
})

describe('Agent CRM / règles', () => {
  const rule = { name: 'Relance', trigger: { type: 'LEAD_INACTIVE', params: { days: 7 } }, actions: [{ type: 'CREATE_TASK', params: { title: 'Relancer {contact}' } }] }

  it('crée en brouillon et refuse l’activation sans admin:*', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm', 'write:crm'])
    const created = await post('/rules', plainSecret, { ...rule, status: 'ACTIVE' })
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('DRAFT')
    const activate = await patch(`/rules/${created.body._id}`, plainSecret, { status: 'ACTIVE' })
    expect(activate.status).toBe(403)

    const master = await createAgentTokenInDb(['admin:*'])
    const ok = await patch(`/rules/${created.body._id}`, master.plainSecret, { status: 'ACTIVE' })
    expect(ok.body.status).toBe('ACTIVE')
    // Un agent qui modifie le contenu d'une règle active la remet en pause.
    const edited = await patch(`/rules/${created.body._id}`, plainSecret, { actions: [{ type: 'NOTIFY', params: {} }] })
    expect(edited.body.status).toBe('PAUSED')
  })

  it('valide le corps, simule et expose le journal', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm', 'write:crm'])
    expect((await post('/rules', plainSecret, { name: 'x' })).status).toBe(400)
    const created = await post('/rules', plainSecret, rule)
    const sim = await post(`/rules/${created.body._id}/simulate`, plainSecret, {})
    expect(sim.status).toBe(200)
    expect(sim.body).toHaveProperty('total')
    const runs = await request(app).get(`${BASE}/rules/runs?status=SIM`).set('Authorization', `Bearer ${plainSecret}`)
    expect(runs.body).toHaveProperty('items')
    const catalog = await request(app).get(`${BASE}/rules/catalog`).set('Authorization', `Bearer ${plainSecret}`)
    expect(catalog.body.triggers).toContain('LEAD_INACTIVE')
    expect(await CrmRuleRun.countDocuments()).toBe(0)
  })

  it('refuse de valider, refuser ou relancer une exécution sans admin:*', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm', 'write:crm'])
    const created = await post('/rules', plainSecret, rule)
    const lead = await Lead.create({ company: 'Galerie' })
    const run = await CrmRuleRun.create({ rule: created.body._id, lead: lead._id, eventKey: 'k1', trigger: 'LEAD_INACTIVE', status: 'PENDING' })
    for (const action of ['approve', 'reject', 'retry']) {
      const res = await post(`/rules/runs/${run._id}/${action}`, plainSecret, {})
      expect(res.status).toBe(403)
    }
    expect((await CrmRuleRun.findById(run._id))!.status).toBe('PENDING')
    const master = await createAgentTokenInDb(['admin:*'])
    const rejected = await post(`/rules/runs/${run._id}/reject`, master.plainSecret, {})
    expect(rejected.status).not.toBe(403)
  })

  it('les règles système ne se suppriment pas', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const { seedCrmRules } = await import('../lib/crmRules.js')
    await seedCrmRules()
    const CrmRule = (await import('../models/CrmRule.js')).default
    const sys = await CrmRule.findOne({ system: true })
    const res = await request(app).delete(`${BASE}/rules/${sys!._id}`).set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(res.status).toBe(409)
  })
})
