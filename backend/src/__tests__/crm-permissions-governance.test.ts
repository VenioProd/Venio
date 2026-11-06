import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

/**
 * Droits du CRM (chantier 1A, audit du 6 novembre 2026) : le stagiaire lit sans
 * écrire, la gouvernance (réglages, règles, exécutions) reste aux
 * administrateurs, les journaux et la détection de doublons respectent le
 * périmètre, et un lead ne se confie qu'à un membre actif habilité.
 */
const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))
vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = authState.user
    next()
  },
}))

type Role = NonNullable<Request['user']>['role']
let app: Express
const ids: Record<string, string> = {}
const roles: Record<string, Role> = {}
const as = (key: string) => {
  authState.user = { id: ids[key], role: roles[key], email: key + '@test.local', name: key }
}
const randomId = () => new mongoose.Types.ObjectId().toString()
const RULE = { name: 'R', trigger: { type: 'LEAD_CREATED' }, actions: [{ type: 'ADD_TAG', params: { tag: 't' } }] }

beforeAll(async () => {
  await setupMongo()
  const [{ default: crm }, { default: extras }] = await Promise.all([
    import('../routes/admin/crm.js'),
    import('../routes/admin/crmExtras.js'),
  ])
  app = express()
  app.use(express.json())
  app.use('/api/admin/crm', crm)
  app.use('/api/admin/crm', extras)
})
afterAll(async () => {
  authState.user = null
  await teardownMongo()
})
afterEach(() => {
  delete process.env.CRM_REPORT_ALLOWED_DOMAINS
})
beforeEach(async () => {
  await clearDb()
  const { default: User } = await import('../models/User.js')
  const people: Array<{ key: string; role: Role; isActive?: boolean; email?: string }> = [
    { key: 'super', role: 'SUPER_ADMIN' },
    { key: 'admin', role: 'ADMIN' },
    { key: 'manager', role: 'MANAGER' },
    { key: 'c1', role: 'COMMERCIAL' },
    { key: 'c2', role: 'COMMERCIAL' },
    { key: 'intern', role: 'STAGIAIRE' },
    { key: 'viewer', role: 'VIEWER' },
    { key: 'cpt', role: 'COMPTABLE' },
    { key: 'client', role: 'CLIENT' },
    { key: 'gone', role: 'COMMERCIAL', isActive: false },
    { key: 'outsider', role: 'ADMIN', email: 'partenaire@exemple.org' },
  ]
  const created = await User.create(
    people.map((p) => ({
      email: p.email ?? p.key + '@test.local',
      name: p.key,
      role: p.role,
      passwordHash: 'x',
      twoFactorEnabled: true,
      isActive: p.isActive ?? true,
    })),
  )
  people.forEach((p, i) => {
    ids[p.key] = String(created[i]._id)
    roles[p.key] = p.role
  })
})

describe('permissions — stagiaire', () => {
  it('le stagiaire lit le CRM mais ne le modifie plus', async () => {
    const { hasPermission, PERMISSIONS } = await import('../lib/permissions.js')
    expect(hasPermission('STAGIAIRE', PERMISSIONS.VIEW_CRM)).toBe(true)
    expect(hasPermission('STAGIAIRE', PERMISSIONS.MANAGE_CRM)).toBe(false)

    as('intern')
    await request(app).get('/api/admin/crm/rules').expect(200)
    await request(app).post('/api/admin/crm/leads').send({ company: 'Interdit' }).expect(403)
    await request(app).post('/api/admin/crm/views').send({ name: 'Vue' }).expect(403)
  })
})

describe('réglages globaux', () => {
  it('sont réservés au super-admin et à l’administrateur', async () => {
    for (const key of ['c1', 'manager']) {
      as(key)
      const res = await request(app).patch('/api/admin/crm/settings').send({ roundRobinEnabled: false }).expect(403)
      expect(res.body.code).toBe('CRM_ADMIN_REQUIRED')
    }
    as('admin')
    const ok = await request(app).patch('/api/admin/crm/settings').send({ roundRobinEnabled: false }).expect(200)
    expect(ok.body.settings.roundRobinEnabled).toBe(false)
  })

  it('n’envoie le rapport hebdomadaire qu’à l’équipe active ou au domaine de l’entreprise', async () => {
    as('super')
    const ok = await request(app)
      .patch('/api/admin/crm/settings')
      .send({ weeklyReportRecipients: ['Direction@Venio.paris', 'partenaire@exemple.org', 'c1@test.local', 'c1@test.local'] })
      .expect(200)
    expect(ok.body.settings.weeklyReportRecipients).toEqual(['direction@venio.paris', 'partenaire@exemple.org', 'c1@test.local'])

    const refused: unknown[] = [['inconnu@ailleurs.com'], ['gone@test.local'], ['client@test.local'], ['pas-une-adresse'], 'x@venio.paris']
    for (const bad of refused) {
      await request(app).patch('/api/admin/crm/settings').send({ weeklyReportRecipients: bad }).expect(400)
    }
    // Contournement par chemin pointé refusé.
    await request(app).patch('/api/admin/crm/settings').send({ 'weeklyReportRecipients.0': 'inconnu@ailleurs.com' }).expect(400)

    process.env.CRM_REPORT_ALLOWED_DOMAINS = 'artosera.fr'
    await request(app).patch('/api/admin/crm/settings').send({ weeklyReportRecipients: ['x@venio.paris'] }).expect(400)
    await request(app).patch('/api/admin/crm/settings').send({ weeklyReportRecipients: ['x@artosera.fr'] }).expect(200)

    const { default: CrmSettings } = await import('../models/CrmSettings.js')
    expect((await CrmSettings.getSettings()).weeklyReportRecipients).toEqual(['x@artosera.fr'])
  })

  it('exige un membre actif de l’équipe comme responsable d’escalade', async () => {
    as('super')
    for (const bad of [ids.client, ids.gone, randomId(), 'pas-un-id']) {
      await request(app).patch('/api/admin/crm/settings').send({ escalationManagerId: bad }).expect(400)
    }
    const ok = await request(app).patch('/api/admin/crm/settings').send({ escalationManagerId: ids.manager }).expect(200)
    expect(String(ok.body.settings.escalationManagerId)).toBe(ids.manager)
    const cleared = await request(app).patch('/api/admin/crm/settings').send({ escalationManagerId: '' }).expect(200)
    expect(cleared.body.settings.escalationManagerId).toBeNull()
  })
})

describe('règles et exécutions', () => {
  it('seuls les administrateurs créent, activent, modifient ou suppriment une règle', async () => {
    as('c1')
    const denied = await request(app).post('/api/admin/crm/rules').send(RULE).expect(403)
    expect(denied.body.code).toBe('CRM_ADMIN_REQUIRED')

    as('admin')
    const created = await request(app).post('/api/admin/crm/rules').send(RULE).expect(201)
    const url = '/api/admin/crm/rules/' + created.body._id

    as('c1')
    await request(app).patch(url).send({ status: 'ACTIVE' }).expect(403)
    await request(app).delete(url).expect(403)

    as('admin')
    const on = await request(app).patch(url).send({ status: 'ACTIVE' }).expect(200)
    expect(on.body.status).toBe('ACTIVE')
  })

  it('valider, refuser ou relancer une exécution est réservé aux administrateurs', async () => {
    const base = '/api/admin/crm/rules/runs/' + randomId() + '/'
    as('c1')
    for (const verb of ['approve', 'reject', 'retry']) {
      await request(app).post(base + verb).expect(403)
    }
    as('super')
    // Autorisé : l'exécution n'existe pas, d'où 409 et non 403.
    await request(app).post(base + 'approve').expect(409)
  })

  it('le journal des exécutions suit le périmètre de lecture', async () => {
    const { default: Lead } = await import('../models/Lead.js')
    const { default: CrmRule } = await import('../models/CrmRule.js')
    const { default: CrmRuleRun } = await import('../models/CrmRuleRun.js')
    const mine = await Lead.create({ company: 'Mine', assignedTo: ids.intern, createdBy: ids.super })
    const other = await Lead.create({ company: 'Autre', assignedTo: ids.c2, createdBy: ids.c2 })
    const rule = await CrmRule.create({ ...RULE, status: 'DRAFT' })
    await CrmRuleRun.create([
      { rule: rule._id, lead: mine._id, eventKey: 'a', trigger: 'LEAD_CREATED', status: 'OK' },
      { rule: rule._id, lead: other._id, eventKey: 'b', trigger: 'LEAD_CREATED', status: 'OK' },
    ])

    as('intern')
    const scoped = await request(app).get('/api/admin/crm/rules/runs').expect(200)
    expect(scoped.body.total).toBe(1)
    expect(String(scoped.body.items[0].lead)).toBe(String(mine._id))
    const forced = await request(app).get('/api/admin/crm/rules/runs?lead=' + String(other._id)).expect(200)
    expect(forced.body.total).toBe(0)

    as('c1') // le commercial lit tout le CRM
    expect((await request(app).get('/api/admin/crm/rules/runs').expect(200)).body.total).toBe(2)
  })
})

describe('détection de doublons', () => {
  it('ne révèle que les leads du périmètre', async () => {
    const { default: Lead } = await import('../models/Lead.js')
    const { default: CrmSettings } = await import('../models/CrmSettings.js')
    await CrmSettings.updateSettings({ duplicateDetectionEnabled: true, duplicateCheckCompany: true } as never)
    await Lead.create([
      { company: 'Acme', assignedTo: ids.manager, createdBy: ids.manager },
      { company: 'Acme', assignedTo: ids.admin, createdBy: ids.admin },
    ])
    as('manager')
    const scoped = await request(app).post('/api/admin/crm/check-duplicate').send({ company: 'acme' }).expect(200)
    expect(scoped.body.duplicates).toHaveLength(1)
    as('super')
    const all = await request(app).post('/api/admin/crm/check-duplicate').send({ company: 'acme' }).expect(200)
    expect(all.body.duplicates).toHaveLength(2)
  })
})

describe('attribution d’un lead', () => {
  it('POST /leads refuse un commercial inexistant, inactif ou non habilité', async () => {
    as('super')
    for (const bad of [ids.client, ids.viewer, ids.cpt, ids.gone, randomId(), 'pas-un-id']) {
      await request(app).post('/api/admin/crm/leads').send({ company: 'X', assignedTo: bad }).expect(400)
    }
    const ok = await request(app).post('/api/admin/crm/leads').send({ company: 'X', assignedTo: ids.c1 }).expect(201)
    expect(String(ok.body.lead.assignedTo)).toBe(ids.c1)
  })

  it('l’action groupée assign applique la même règle', async () => {
    const { default: Lead } = await import('../models/Lead.js')
    const lead = await Lead.create({ company: 'L', assignedTo: ids.c1, createdBy: ids.c1 })
    const bulk = (userId: string) =>
      request(app).post('/api/admin/crm/leads/bulk').send({ ids: [String(lead._id)], action: 'assign', payload: { userId } })
    as('super')
    for (const bad of [ids.client, ids.viewer, ids.cpt, ids.gone, randomId()]) {
      await bulk(bad).expect(400)
    }
    const ok = await bulk(ids.c2).expect(200)
    expect(ok.body.ok).toBe(1)
    expect(String((await Lead.findById(lead._id))!.assignedTo)).toBe(ids.c2)
  })
})
