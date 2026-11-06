import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { asReqUser, seedTeam, type Team, type TeamMember } from './crm-routes-helpers.js'

/**
 * Chantier 3C : chiffre d'affaires (devis rattachés au lead, devises), valeur
 * pondérée unique, prévision mensuelle et objectifs.
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
let clientId: mongoose.Types.ObjectId
let Lead: typeof import('../models/Lead.js').default
let CrmGoal: typeof import('../models/CrmGoal.js').default

function as(member: TeamMember | null, extra: Record<string, unknown> = {}): void {
  authState.user = member ? ({ ...asReqUser(member), ...extra } as Request['user']) : null
}

const LINES = [{ description: 'Site vitrine', quantity: 2, unitPrice: 500, taxRate: 20 }]

async function seedLead(overrides: Record<string, unknown> = {}) {
  return Lead.create({ company: 'Acme', status: 'LEAD', assignedTo: team.commercialA!.id, ...overrides })
}

async function seedProject(overrides: Record<string, unknown> = {}) {
  const { default: Project } = await import('../models/Project.js')
  return Project.create({ name: 'Refonte', client: clientId, status: 'EN_COURS', ...overrides })
}

async function seedDocument(projectId: unknown, overrides: Record<string, unknown> = {}) {
  const { default: BillingDocument } = await import('../models/BillingDocument.js')
  return BillingDocument.create({
    type: 'QUOTE',
    number: 'DEV-' + Math.floor(Math.random() * 1e9),
    project: projectId,
    client: clientId,
    status: 'ACCEPTED',
    total: 1200,
    createdBy: team.superAdmin!.id,
    ...overrides,
  })
}

async function seedProposal(overrides: Record<string, unknown> = {}) {
  const { default: QuoteProposal } = await import('../models/QuoteProposal.js')
  return QuoteProposal.create({
    title: 'Devis site',
    status: 'SIGNED',
    createdBy: team.superAdmin!.id,
    lines: LINES,
    ...overrides,
  })
}

beforeAll(async () => {
  await setupMongo()
  Lead = (await import('../models/Lead.js')).default
  CrmGoal = (await import('../models/CrmGoal.js')).default
  const { default: crmRoutes } = await import('../routes/admin/crm.js')
  const { default: crmExtras } = await import('../routes/admin/crmExtras.js')
  app = express()
  app.use(express.json())
  // Même ordre qu'en production : les routes enrichies (/leads/export) avant /leads/:id.
  app.use('/api/admin/crm', crmExtras)
  app.use('/api/admin/crm', crmRoutes)
})

afterAll(async () => {
  authState.user = null
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  team = await seedTeam()
  const { default: User } = await import('../models/User.js')
  const client = await User.create({ email: 'client@acme.fr', name: 'Acme SAS', role: 'CLIENT', passwordHash: 'x' })
  clientId = client._id as mongoose.Types.ObjectId
  as(team.superAdmin!)
})

describe('GET /crm/pilotage — chiffre d’affaires', () => {
  it('compte un devis signé rattaché au lead sans projet (TTC)', async () => {
    const lead = await seedLead({ status: 'WON', budget: 3000, source: 'Ads' })
    await seedProposal({ leadId: lead._id })

    const { body } = await request(app).get('/api/admin/crm/pilotage').expect(200)

    expect(body.revenue.signed).toBe(1200)
    expect(body.revenue.byCurrency.EUR.signed).toBe(1200)
    expect(body.revenue.currency).toBe('EUR')
    const ads = body.bySource.find((row: { key: string }) => row.key === 'Ads')
    expect(ads.wonSigned).toBe(1200)
  })

  it('ne compte pas les devis non signés', async () => {
    const lead = await seedLead({ status: 'PROPOSAL' })
    await seedProposal({ leadId: lead._id, status: 'SENT' })
    await seedProposal({ leadId: lead._id, status: 'DRAFT' })

    const { body } = await request(app).get('/api/admin/crm/pilotage').expect(200)
    expect(body.revenue.signed).toBe(0)
  })

  it('ne compte pas deux fois un devis signé qui passe par un projet rattaché', async () => {
    const lead = await seedLead({ status: 'WON' })
    const project = await seedProject({ sourceLead: lead._id })
    const document = await seedDocument(project._id, { total: 1200 })
    await seedProposal({ leadId: lead._id, project: project._id, client: clientId, billingDocument: document._id })

    const { body } = await request(app).get('/api/admin/crm/pilotage').expect(200)
    expect(body.revenue.signed).toBe(1200)
    expect(body.revenue.documents).toBe(1)
  })

  it('ne recompte pas un devis d’un projet rattaché dont le document n’est pas encore lié', async () => {
    const lead = await seedLead({ status: 'WON' })
    const project = await seedProject({ sourceLead: lead._id })
    await seedDocument(project._id, { total: 1200 })
    await seedProposal({ leadId: lead._id, project: project._id, client: clientId })

    const { body } = await request(app).get('/api/admin/crm/pilotage').expect(200)
    expect(body.revenue.signed).toBe(1200)
  })

  it('additionne le devis direct et celui du projet, sans les confondre', async () => {
    const lead = await seedLead({ status: 'WON' })
    const project = await seedProject({ sourceLead: lead._id })
    await seedDocument(project._id, { total: 5000 })
    await seedProposal({ leadId: lead._id })

    const { body } = await request(app).get('/api/admin/crm/pilotage').expect(200)
    expect(body.revenue.signed).toBe(6200)
  })

  it('ne mélange jamais les devises : EUR en tête, le reste à part', async () => {
    const lead = await seedLead({ status: 'WON' })
    const project = await seedProject({ sourceLead: lead._id })
    await seedDocument(project._id, { total: 1000 })
    await seedDocument(project._id, { total: 700, currency: 'USD' })
    await seedDocument(project._id, { type: 'INVOICE', status: 'PAID', total: 300, currency: 'USD' })

    const { body } = await request(app).get('/api/admin/crm/pilotage').expect(200)
    expect(body.revenue.signed).toBe(1000)
    expect(body.revenue.collected).toBe(0)
    expect(body.revenue.byCurrency.USD).toEqual({ signed: 700, collected: 300, documents: 2 })
    expect(body.revenue.byCurrency.EUR.signed).toBe(1000)
  })

  it('pondère le pipeline par la probabilité du lead et ignore les archivés', async () => {
    await seedLead({ status: 'PROPOSAL', budget: 10000, probability: 80 })
    await seedLead({ status: 'DEMO', budget: 1000 })
    await seedLead({ status: 'PROPOSAL', budget: 99999, probability: 90, archivedAt: new Date() })

    const { body } = await request(app).get('/api/admin/crm/pilotage').expect(200)
    expect(body.pipeline.total).toBe(8500)
    expect(body.pipeline.currency).toBe('EUR')
  })
})

describe('GET /crm/leads/:id/revenue — devis directs', () => {
  it('compte le devis signé sans projet et rend le détail par devise', async () => {
    const lead = await seedLead({ status: 'WON' })
    const direct = await seedProposal({ leadId: lead._id })

    const { body } = await request(app).get('/api/admin/crm/leads/' + lead._id + '/revenue').expect(200)
    expect(body.summary.signed).toBe(1200)
    expect(body.byCurrency.EUR.signed).toBe(1200)
    expect(body.proposals.map((proposal: { _id: string }) => proposal._id)).toContain(String(direct._id))
    expect(body.proposals[0].lines).toBeUndefined()
  })

  it('ne double pas un devis passé par le projet', async () => {
    const lead = await seedLead({ status: 'WON' })
    const project = await seedProject({ sourceLead: lead._id })
    const document = await seedDocument(project._id, { total: 1200 })
    await seedProposal({ leadId: lead._id, project: project._id, client: clientId, billingDocument: document._id })

    const { body } = await request(app).get('/api/admin/crm/leads/' + lead._id + '/revenue').expect(200)
    expect(body.summary.signed).toBe(1200)
    expect(body.proposals).toHaveLength(1)
  })
})

describe('Export CSV — valeur pondérée', () => {
  it('applique la définition unique (ouvert seulement, budget × probabilité)', async () => {
    await seedLead({ company: 'Ouvert', status: 'DEMO', budget: 1000, probability: 40 })
    await seedLead({ company: 'Gagné', status: 'WON', budget: 1000 })
    await seedLead({ company: 'SansBudget', status: 'DEMO' })

    const csv = await request(app).get('/api/admin/crm/leads/export?columns=company,weighted').expect(200)
    const rows = Object.fromEntries(
      csv.text
        .split('\r\n')
        .slice(1)
        .map((line: string) => line.replace(/"/g, '').split(';')),
    )
    expect(Number(rows.Ouvert)).toBe(400)
    expect(Number(rows['Gagné'])).toBe(0)
    expect(Number(rows.SansBudget)).toBe(0)
  })
})

describe('GET /crm/forecast', () => {
  it('refuse un rôle sans permission CRM', async () => {
    as(team.comptable!)
    await request(app).get('/api/admin/crm/forecast').expect(403)
  })

  it('rend 6 mois par défaut, en EUR, fuseau Europe/Paris', async () => {
    const { body } = await request(app).get('/api/admin/crm/forecast').expect(200)
    expect(body.months).toHaveLength(6)
    expect(body.currency).toBe('EUR')
    expect(body.timeZone).toBe('Europe/Paris')
    expect(body.months[0].month).toMatch(/^\d{4}-\d{2}$/)
  })

  it('valide les paramètres', async () => {
    await request(app).get('/api/admin/crm/forecast?months=0').expect(400)
    await request(app).get('/api/admin/crm/forecast?months=25').expect(400)
    await request(app).get('/api/admin/crm/forecast?months=abc').expect(400)
    await request(app).get('/api/admin/crm/forecast?from=2026-13').expect(400)
    await request(app).get('/api/admin/crm/forecast?userId=zzz').expect(400)
  })

  it('regroupe par mois de clôture prévue : brut, pondéré, ouverts', async () => {
    await seedLead({ status: 'DEMO', budget: 1000, probability: 50, expectedCloseAt: new Date('2026-11-10T10:00:00Z') })
    await seedLead({ status: 'PROPOSAL', budget: 2000, probability: 80, expectedCloseAt: new Date('2026-11-25T10:00:00Z') })
    await seedLead({ status: 'LEAD', budget: 500, probability: 10, expectedCloseAt: new Date('2027-01-05T10:00:00Z') })

    const { body } = await request(app).get('/api/admin/crm/forecast?from=2026-11&months=3').expect(200)
    expect(body.months.map((row: { month: string }) => row.month)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(body.months[0]).toMatchObject({ openCount: 2, gross: 3000, weighted: 2100 })
    expect(body.months[0].categories.committed).toEqual({ count: 1, gross: 2000, weighted: 1600 })
    expect(body.months[0].categories.probable).toEqual({ count: 1, gross: 1000, weighted: 500 })
    expect(body.months[2]).toMatchObject({ openCount: 1, gross: 500, weighted: 50 })
    expect(body.months[2].categories.pipeline.count).toBe(1)
  })

  it('classe selon le mois de Paris, pas celui d’UTC', async () => {
    // 31 oct. 23:30 UTC = 1er nov. 00:30 à Paris ; 30 nov. 23:30 UTC = 1er déc. 00:30 à Paris.
    await seedLead({ status: 'DEMO', budget: 400, probability: 50, expectedCloseAt: new Date('2026-10-31T23:30:00Z') })
    await seedLead({ status: 'DEMO', budget: 600, probability: 50, expectedCloseAt: new Date('2026-11-30T23:30:00Z') })

    const { body } = await request(app).get('/api/admin/crm/forecast?from=2026-11&months=2').expect(200)
    expect(body.months[0]).toMatchObject({ month: '2026-11', openCount: 1, gross: 400 })
    expect(body.months[1]).toMatchObject({ month: '2026-12', openCount: 1, gross: 600 })
    expect(body.overdue.count).toBe(0)
  })

  it('mesure le réalisé par statusChangedAt et ignore les fermés/archivés dans les ouverts', async () => {
    await seedLead({ status: 'WON', budget: 5000, statusChangedAt: new Date('2026-11-15T10:00:00Z'), expectedCloseAt: new Date('2026-12-20T10:00:00Z') })
    await seedLead({ status: 'LOST', budget: 900, expectedCloseAt: new Date('2026-11-10T10:00:00Z') })
    await seedLead({ status: 'DEMO', budget: 800, probability: 50, expectedCloseAt: new Date('2026-11-10T10:00:00Z'), archivedAt: new Date() })

    const { body } = await request(app).get('/api/admin/crm/forecast?from=2026-11&months=2').expect(200)
    expect(body.months[0]).toMatchObject({ wonCount: 1, wonAmount: 5000, openCount: 0 })
    expect(body.months[1]).toMatchObject({ wonCount: 0, wonAmount: 0, openCount: 0 })
    expect(body.totals).toMatchObject({ wonCount: 1, wonAmount: 5000 })
  })

  it('signale les retards et les affaires sans date', async () => {
    await seedLead({ status: 'DEMO', budget: 800, probability: 50, expectedCloseAt: new Date('2026-09-10T10:00:00Z') })
    await seedLead({ status: 'DEMO', budget: 600, probability: 50 })

    const { body } = await request(app).get('/api/admin/crm/forecast?from=2026-11&months=2').expect(200)
    expect(body.overdue).toEqual({ count: 1, gross: 800, weighted: 400 })
    expect(body.unscheduled).toEqual({ count: 1, gross: 600, weighted: 300 })
  })

  it('filtre par entité', async () => {
    await seedLead({ status: 'DEMO', budget: 1000, probability: 50, entity: 'ARROW', expectedCloseAt: new Date('2026-11-10T10:00:00Z') })
    await seedLead({ status: 'DEMO', budget: 300, probability: 50, entity: 'VENIO', expectedCloseAt: new Date('2026-11-10T10:00:00Z') })

    const arrow = await request(app).get('/api/admin/crm/forecast?from=2026-11&months=1&entity=ARROW').expect(200)
    expect(arrow.body.entity).toBe('ARROW')
    expect(arrow.body.months[0].gross).toBe(1000)
    const all = await request(app).get('/api/admin/crm/forecast?from=2026-11&months=1').expect(200)
    expect(all.body.months[0].gross).toBe(1300)
  })

  it('restreint un utilisateur limité à des entités', async () => {
    await seedLead({ status: 'DEMO', budget: 1000, probability: 50, entity: 'ARROW', expectedCloseAt: new Date('2026-11-10T10:00:00Z') })
    await seedLead({ status: 'DEMO', budget: 300, probability: 50, entity: 'VENIO', expectedCloseAt: new Date('2026-11-10T10:00:00Z') })
    await CrmGoal.create({ period: '2026-11', entity: null, amountTarget: 9999 })
    await CrmGoal.create({ period: '2026-11', entity: 'ARROW', amountTarget: 1500 })

    as(team.commercialA!, { crmEntities: ['ARROW'] })
    const { body } = await request(app).get('/api/admin/crm/forecast?from=2026-11&months=1').expect(200)
    expect(body.months[0].gross).toBe(1000)
    // L'objectif de tout le groupe n'est pas le sien : il ne le voit pas.
    expect(body.months[0].goal).toBeNull()

    const venio = await request(app).get('/api/admin/crm/forecast?from=2026-11&months=1&entity=VENIO').expect(200)
    expect(venio.body.months[0].gross).toBe(0)

    const arrow = await request(app).get('/api/admin/crm/forecast?from=2026-11&months=1&entity=ARROW').expect(200)
    expect(arrow.body.months[0].goal.amountTarget).toBe(1500)
  })

  it('filtre par commercial, et interdit celui d’un autre à qui ne voit pas tout', async () => {
    await seedLead({ status: 'DEMO', budget: 1000, probability: 50, assignedTo: team.commercialA!.id, expectedCloseAt: new Date('2026-11-10T10:00:00Z') })
    await seedLead({ status: 'DEMO', budget: 300, probability: 50, assignedTo: team.commercialB!.id, expectedCloseAt: new Date('2026-11-10T10:00:00Z') })

    const mine = await request(app)
      .get('/api/admin/crm/forecast?from=2026-11&months=1&userId=' + team.commercialB!.id)
      .expect(200)
    expect(mine.body.months[0].gross).toBe(300)

    as(team.stagiaire!)
    await request(app)
      .get('/api/admin/crm/forecast?from=2026-11&months=1&userId=' + team.commercialA!.id)
      .expect(403)
  })

  it('joint l’objectif du mois et l’avancement', async () => {
    await CrmGoal.create({ period: '2026-11', amountTarget: 10000, wonCountTarget: 4 })
    await seedLead({ status: 'WON', budget: 2500, statusChangedAt: new Date('2026-11-03T10:00:00Z') })
    await seedLead({ status: 'DEMO', budget: 1000, probability: 50, expectedCloseAt: new Date('2026-11-20T10:00:00Z') })

    const { body } = await request(app).get('/api/admin/crm/forecast?from=2026-11&months=2').expect(200)
    expect(body.months[0].goal).toMatchObject({
      amountTarget: 10000,
      wonCountTarget: 4,
      amountProgress: 0.25,
      countProgress: 0.25,
      projectedAmount: 3000,
    })
    expect(body.months[1].goal).toBeNull()
  })
})

describe('Objectifs /crm/goals', () => {
  const body = { period: '2026-11', amountTarget: 10000, wonCountTarget: 4 }

  it('est lisible par qui voit le CRM, y compris un commercial', async () => {
    await CrmGoal.create({ period: '2026-11', amountTarget: 1 })
    as(team.commercialA!)
    const response = await request(app).get('/api/admin/crm/goals?from=2026-01&to=2026-12').expect(200)
    expect(response.body.goals).toHaveLength(1)
    as(team.comptable!)
    await request(app).get('/api/admin/crm/goals').expect(403)
  })

  it('n’est modifiable que par un administrateur du CRM', async () => {
    for (const member of [team.manager!, team.commercialA!, team.stagiaire!, team.viewer!]) {
      as(member)
      await request(app).post('/api/admin/crm/goals').send(body).expect(403)
    }
    expect(await CrmGoal.countDocuments()).toBe(0)

    as(team.admin!)
    const created = await request(app).post('/api/admin/crm/goals').send(body).expect(201)
    expect(created.body.goal).toMatchObject({ period: '2026-11', entity: null, userId: null, amountTarget: 10000, wonCountTarget: 4 })

    as(team.commercialA!)
    await request(app).patch('/api/admin/crm/goals/' + created.body.goal._id).send({ amountTarget: 1 }).expect(403)
    await request(app).delete('/api/admin/crm/goals/' + created.body.goal._id).expect(403)
    expect(await CrmGoal.countDocuments()).toBe(1)
  })

  it('crée, modifie les cibles, supprime', async () => {
    const created = await request(app).post('/api/admin/crm/goals').send({ ...body, entity: 'ARROW' }).expect(201)
    const id = created.body.goal._id
    const patched = await request(app).patch('/api/admin/crm/goals/' + id).send({ amountTarget: 12000.456, wonCountTarget: 6 }).expect(200)
    expect(patched.body.goal).toMatchObject({ amountTarget: 12000.46, wonCountTarget: 6, period: '2026-11', entity: 'ARROW' })
    await request(app).delete('/api/admin/crm/goals/' + id).expect(200)
    expect(await CrmGoal.countDocuments()).toBe(0)
    await request(app).delete('/api/admin/crm/goals/' + id).expect(404)
    await request(app).patch('/api/admin/crm/goals/' + id).send({ amountTarget: 1 }).expect(404)
  })

  it('refuse un second objectif pour le même mois et le même périmètre', async () => {
    await request(app).post('/api/admin/crm/goals').send(body).expect(201)
    await request(app).post('/api/admin/crm/goals').send(body).expect(409)
    await request(app).post('/api/admin/crm/goals').send({ ...body, entity: 'ARROW' }).expect(201)
    await request(app).post('/api/admin/crm/goals').send({ ...body, userId: team.commercialA!.id }).expect(201)
  })

  it('valide les entrées', async () => {
    await request(app).post('/api/admin/crm/goals').send({ ...body, period: '2026-13' }).expect(400)
    await request(app).post('/api/admin/crm/goals').send({ ...body, period: 'nov' }).expect(400)
    await request(app).post('/api/admin/crm/goals').send({ ...body, entity: 'PLUTON' }).expect(400)
    await request(app).post('/api/admin/crm/goals').send({ ...body, amountTarget: -1 }).expect(400)
    await request(app).post('/api/admin/crm/goals').send({ ...body, amountTarget: '100' }).expect(400)
    await request(app).post('/api/admin/crm/goals').send({ ...body, wonCountTarget: 1.5 }).expect(400)
    await request(app).post('/api/admin/crm/goals').send({ ...body, userId: team.client!.id }).expect(400)
    await request(app).post('/api/admin/crm/goals').send({ ...body, userId: team.inactive!.id }).expect(400)
    await request(app).get('/api/admin/crm/goals?from=2026').expect(400)
    expect(await CrmGoal.countDocuments()).toBe(0)
  })

  it('cantonne un administrateur restreint à ses entités', async () => {
    as(team.admin!, { crmEntities: ['ARROW'] })
    await request(app).post('/api/admin/crm/goals').send(body).expect(403)
    await request(app).post('/api/admin/crm/goals').send({ ...body, entity: 'VENIO' }).expect(403)
    const ok = await request(app).post('/api/admin/crm/goals').send({ ...body, entity: 'ARROW' }).expect(201)

    const other = await CrmGoal.create({ period: '2026-11', entity: 'VENIO', amountTarget: 5 })
    await request(app).patch('/api/admin/crm/goals/' + other._id).send({ amountTarget: 6 }).expect(403)
    await request(app).delete('/api/admin/crm/goals/' + other._id).expect(403)

    const list = await request(app).get('/api/admin/crm/goals').expect(200)
    expect(list.body.goals.map((goal: { _id: string }) => goal._id)).toEqual([ok.body.goal._id])
  })

  it('cache à un commercial l’objectif personnel d’un collègue', async () => {
    await CrmGoal.create({ period: '2026-11', amountTarget: 1 })
    await CrmGoal.create({ period: '2026-11', userId: team.commercialA!.id, amountTarget: 2 })
    await CrmGoal.create({ period: '2026-11', userId: team.commercialB!.id, amountTarget: 3 })

    as(team.stagiaire!)
    const response = await request(app).get('/api/admin/crm/goals').expect(200)
    expect(response.body.goals.map((goal: { amountTarget: number }) => goal.amountTarget)).toEqual([1])
  })
})
