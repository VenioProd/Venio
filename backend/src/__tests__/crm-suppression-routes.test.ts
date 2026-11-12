import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { asReqUser, resetCrmSettings, seedTeam, type Team, type TeamMember } from './crm-routes-helpers.js'

/**
 * Liste « ne pas contacter » (chantier 4B) : droits, pagination, recherche,
 * audit de chaque ajout et retrait, et garantie que le retrait ne touche pas
 * l'opposition portée par les leads.
 */

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = authState.user
    next()
  },
}))

let app: Express
let team: Team
let Lead: typeof import('../models/Lead.js').default
let AuditLog: typeof import('../models/AuditLog.js').default
let SuppressionEntry: typeof import('../models/SuppressionEntry.js').default

const as = (member: TeamMember | null) => {
  authState.user = member ? asReqUser(member) : null
}

beforeAll(async () => {
  await setupMongo()
  Lead = (await import('../models/Lead.js')).default
  AuditLog = (await import('../models/AuditLog.js')).default
  SuppressionEntry = (await import('../models/SuppressionEntry.js')).default
  const { default: suppression } = await import('../routes/admin/crmSuppression.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/crm/suppression', suppression)
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

const URL = '/api/admin/crm/suppression'
const auditOf = (action: string) => AuditLog.find({ action }).lean()

describe('droits', () => {
  it('sans session : 401', async () => {
    as(null)
    await request(app).get(URL).expect(401)
    await request(app).post(URL).send({ email: 'a@b.test' }).expect(401)
  })

  it('un non-administrateur lit la liste mais ne peut ni ajouter ni retirer', async () => {
    const entry = await SuppressionEntry.create({ emailNormalized: 'x@y.test', reason: 'MANUAL' })
    as(team.manager)
    const list = await request(app).get(URL).expect(200)
    expect(list.body).toMatchObject({ total: 1, canAdminister: false })
    await request(app).post(URL).send({ email: 'new@y.test' }).expect(403)
    await request(app).delete(`${URL}/${entry._id}`).send({ confirm: true }).expect(403)
    expect(await SuppressionEntry.countDocuments()).toBe(1)
    expect(await AuditLog.countDocuments({ action: /CRM_SUPPRESSION/ })).toBe(0)
  })

  it('ADMIN et SUPER_ADMIN administrent la liste', async () => {
    for (const member of [team.admin, team.superAdmin]) {
      as(member)
      const res = await request(app)
        .post(URL)
        .send({ email: `${member.role}@y.test` })
        .expect(201)
      expect(res.body.entry.email).toBe(`${member.role.toLowerCase()}@y.test`)
      expect((await request(app).get(URL).expect(200)).body.canAdminister).toBe(true)
    }
  })
})

describe('ajout manuel', () => {
  it('normalise l’adresse, garde la raison et l’auteur, et trace l’audit', async () => {
    const res = await request(app).post(URL).send({ email: '  Ana@Domaine.TEST ', reason: 'OPPOSITION' }).expect(201)
    expect(res.body.entry).toMatchObject({ email: 'ana@domaine.test', reason: 'OPPOSITION' })
    const stored = await SuppressionEntry.findOne({ emailNormalized: 'ana@domaine.test' })
    expect(stored).toMatchObject({ reason: 'OPPOSITION' })
    expect(String(stored!.createdBy)).toBe(team.admin.id)
    const audits = await auditOf('CRM_SUPPRESSION_ADD')
    expect(audits).toHaveLength(1)
    expect(audits[0].metadata).toMatchObject({ entityRef: 'ana@domaine.test', reason: 'OPPOSITION' })
    expect(String(audits[0].userId)).toBe(team.admin.id)
  })

  it('raison par défaut MANUAL ; refuse une raison système, une adresse invalide et un doublon', async () => {
    await request(app).post(URL).send({ email: 'a@b.test' }).expect(201)
    expect((await SuppressionEntry.findOne({ emailNormalized: 'a@b.test' }))!.reason).toBe('MANUAL')
    await request(app).post(URL).send({ email: 'c@d.test', reason: 'ANONYMIZED' }).expect(400)
    await request(app).post(URL).send({ email: 'pas-une-adresse' }).expect(400)
    await request(app).post(URL).send({}).expect(400)
    const dup = await request(app).post(URL).send({ email: 'A@B.test', reason: 'OPPOSITION' }).expect(409)
    expect(dup.body.code).toBe('ALREADY_SUPPRESSED')
    expect((await SuppressionEntry.findOne({ emailNormalized: 'a@b.test' }))!.reason).toBe('MANUAL')
    expect(await auditOf('CRM_SUPPRESSION_ADD')).toHaveLength(1)
  })
})

describe('retrait', () => {
  it('supprime l’entrée, trace l’audit et laisse doNotContact des leads intact', async () => {
    const lead = await Lead.create({
      company: 'Domaine',
      contactName: 'Ana',
      contactEmail: 'ana@domaine.test',
      doNotContact: true,
      createdBy: team.commercialA.id,
      assignedTo: team.commercialA.id,
    })
    const entry = await SuppressionEntry.create({
      emailNormalized: 'ana@domaine.test',
      reason: 'OPPOSITION',
      leadId: lead._id,
    })
    await request(app).delete(`${URL}/${entry._id}`).send({ confirm: true }).expect(200)
    expect(await SuppressionEntry.countDocuments()).toBe(0)
    expect((await Lead.findById(lead._id))!.doNotContact).toBe(true)
    const audits = await auditOf('CRM_SUPPRESSION_REMOVE')
    expect(audits).toHaveLength(1)
    expect(audits[0].metadata).toMatchObject({ entityRef: 'ana@domaine.test', reason: 'OPPOSITION' })
  })

  it('404 pour un identifiant inconnu ou mal formé, sans audit', async () => {
    await request(app).delete(`${URL}/64b000000000000000000000`).send({ confirm: true }).expect(404)
    await request(app).delete(`${URL}/pas-un-id`).send({ confirm: true }).expect(404)
    expect(await auditOf('CRM_SUPPRESSION_REMOVE')).toHaveLength(0)
  })
})

describe('numéros opposés', () => {
  it('ajoute un numéro normalisé en E.164, le liste à part des adresses et trace l’audit', async () => {
    const res = await request(app).post(URL).send({ phone: ' 06 12 34 56 78 ', reason: 'OPPOSITION' }).expect(201)
    expect(res.body.entry).toMatchObject({ kind: 'phone', phone: '+33612345678', reason: 'OPPOSITION' })
    const stored = await SuppressionEntry.findOne({ phoneNormalized: '+33612345678' })
    expect(stored).toMatchObject({ reason: 'OPPOSITION' })
    expect(stored!.emailNormalized).toBeUndefined()
    expect(String(stored!.createdBy)).toBe(team.admin.id)
    const audits = await auditOf('CRM_SUPPRESSION_ADD')
    expect(audits).toHaveLength(1)
    expect(audits[0].metadata).toMatchObject({ entityRef: '+33612345678', kind: 'phone' })
    await request(app).post(URL).send({ email: 'a@b.test' }).expect(201)
    const phones = await request(app).get(`${URL}?kind=phone`).expect(200)
    expect(phones.body).toMatchObject({ total: 1 })
    expect(phones.body.entries[0]).toMatchObject({ kind: 'phone', phone: '+33612345678' })
    const emails = await request(app).get(URL).expect(200)
    expect(emails.body.entries.map((e: { email: string }) => e.email)).toEqual(['a@b.test'])
  })

  it('refuse un numéro invalide, un doublon (même écrit autrement) et un numéro mêlé à une adresse', async () => {
    await request(app).post(URL).send({ phone: '12' }).expect(400)
    await request(app).post(URL).send({ phone: 'abc' }).expect(400)
    await request(app).post(URL).send({ phone: '0612345678', email: 'a@b.test' }).expect(400)
    await request(app).post(URL).send({ phone: '0612345678' }).expect(201)
    const dup = await request(app).post(URL).send({ phone: '+33 6 12 34 56 78' }).expect(409)
    expect(dup.body.code).toBe('ALREADY_SUPPRESSED')
    expect(await SuppressionEntry.countDocuments({ phoneNormalized: { $exists: true } })).toBe(1)
  })

  it('cherche par fragment ou par numéro complet, quelle que soit l’écriture', async () => {
    await SuppressionEntry.create({ phoneNormalized: '+33612345678', reason: 'MANUAL' })
    await SuppressionEntry.create({ phoneNormalized: '+33698765432', reason: 'MANUAL' })
    expect((await request(app).get(`${URL}?kind=phone&q=06 12 34 56 78`).expect(200)).body.total).toBe(1)
    expect((await request(app).get(`${URL}?kind=phone&q=9876`).expect(200)).body.total).toBe(1)
    expect((await request(app).get(`${URL}?kind=phone&q=0612`).expect(200)).body.total).toBe(1)
    expect((await request(app).get(`${URL}?kind=phone&q=.*`).expect(200)).body.total).toBe(2)
  })

  it('un non-administrateur ne peut ni ajouter ni retirer un numéro', async () => {
    const entry = await SuppressionEntry.create({ phoneNormalized: '+33612345678', reason: 'OPPOSITION' })
    as(team.manager)
    await request(app).post(URL).send({ phone: '0698765432' }).expect(403)
    await request(app).delete(`${URL}/${entry._id}`).send({ confirm: true }).expect(403)
    expect(await SuppressionEntry.countDocuments()).toBe(1)
    expect(await auditOf('CRM_SUPPRESSION_REMOVE')).toHaveLength(0)
  })

  it('le retrait exige une confirmation explicite, puis supprime, trace et laisse doNotCall du lead intact', async () => {
    const lead = await Lead.create({
      company: 'Domaine',
      contactName: 'Ana',
      contactPhone: '0612345678',
      doNotCall: true,
      createdBy: team.commercialA.id,
      assignedTo: team.commercialA.id,
    })
    const entry = await SuppressionEntry.create({
      phoneNormalized: '+33612345678',
      reason: 'OPPOSITION',
      leadId: lead._id,
    })
    for (const body of [undefined, {}, { confirm: false }, { confirm: 'true' }, { confirm: 1 }]) {
      const refused = await request(app)
        .delete(`${URL}/${entry._id}`)
        .send(body as object | undefined)
        .expect(400)
      expect(refused.body.code).toBe('CONFIRMATION_REQUIRED')
    }
    expect(await SuppressionEntry.countDocuments()).toBe(1)
    expect(await auditOf('CRM_SUPPRESSION_REMOVE')).toHaveLength(0)
    await request(app).delete(`${URL}/${entry._id}`).send({ confirm: true }).expect(200)
    expect(await SuppressionEntry.countDocuments()).toBe(0)
    expect((await Lead.findById(lead._id))!.doNotCall).toBe(true)
    const audits = await auditOf('CRM_SUPPRESSION_REMOVE')
    expect(audits).toHaveLength(1)
    expect(audits[0].metadata).toMatchObject({
      entityRef: '+33612345678',
      reason: 'OPPOSITION',
      kind: 'phone',
      confirmed: true,
    })
    expect(String(audits[0].userId)).toBe(team.admin.id)
  })
})

describe('liste : pagination et recherche', () => {
  const seedMany = async (n: number) => {
    for (let i = 1; i <= n; i++) {
      await SuppressionEntry.create({
        emailNormalized: `user${String(i).padStart(2, '0')}@exemple.test`,
        reason: 'MANUAL',
        createdAt: new Date(2026, 0, i),
      })
    }
  }

  it('pagine du plus récent au plus ancien et borne les paramètres', async () => {
    await seedMany(7)
    const p1 = await request(app).get(`${URL}?limit=3&page=1`).expect(200)
    expect(p1.body).toMatchObject({ total: 7, page: 1, limit: 3, pages: 3 })
    expect(p1.body.entries.map((e: { email: string }) => e.email)).toEqual([
      'user07@exemple.test',
      'user06@exemple.test',
      'user05@exemple.test',
    ])
    const p3 = await request(app).get(`${URL}?limit=3&page=3`).expect(200)
    expect(p3.body.entries).toHaveLength(1)
    const beyond = await request(app).get(`${URL}?limit=3&page=99`).expect(200)
    expect(beyond.body.page).toBe(3)
    const capped = await request(app).get(`${URL}?limit=100000&page=abc`).expect(200)
    expect(capped.body).toMatchObject({ limit: 100, page: 1 })
  })

  it('recherche par fragment d’adresse, insensible à la casse, sans interpréter une expression régulière', async () => {
    await seedMany(3)
    await SuppressionEntry.create({ emailNormalized: 'autre@societe.test', reason: 'UNSUBSCRIBE' })
    const byDomain = await request(app).get(`${URL}?q=EXEMPLE`).expect(200)
    expect(byDomain.body.total).toBe(3)
    const one = await request(app).get(`${URL}?q=user02`).expect(200)
    expect(one.body.entries.map((e: { email: string }) => e.email)).toEqual(['user02@exemple.test'])
    expect((await request(app).get(`${URL}?q=.*`).expect(200)).body.total).toBe(0)
    expect((await request(app).get(`${URL}?q=(`).expect(200)).body.total).toBe(0)
  })

  it('restitue l’auteur d’un ajout manuel', async () => {
    await request(app).post(URL).send({ email: 'm@n.test' }).expect(201)
    const res = await request(app).get(URL).expect(200)
    expect(res.body.entries[0]).toMatchObject({ email: 'm@n.test', createdBy: { id: team.admin.id, name: 'admin' } })
  })
})
