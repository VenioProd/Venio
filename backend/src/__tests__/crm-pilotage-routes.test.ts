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
let accountantId: mongoose.Types.ObjectId

function actAs(id: mongoose.Types.ObjectId, role: NonNullable<Request['user']>['role']) {
  authState.user = { id: id.toString(), role, email: `${role}@test.local`, name: role }
}

function daysAgo(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

async function seedLead(overrides: Record<string, unknown> = {}) {
  const { default: Lead } = await import('../models/Lead.js')
  return Lead.create({ company: 'Acme', status: 'LEAD', assignedTo: commercialId, ...overrides })
}

async function seedTransition(leadId: unknown, from: string, to: string, when: Date) {
  const { default: LeadActivity } = await import('../models/LeadActivity.js')
  const activity = await LeadActivity.create({
    leadId,
    type: 'STATUS_CHANGE',
    label: `Statut: ${from} → ${to}`,
    payload: { from, to },
  })
  // Mongoose marque `createdAt` immuable quand les timestamps sont actifs : un
  // updateOne classique serait ignoré en silence. On passe par le driver pour
  // antidater réellement la transition.
  await LeadActivity.collection.updateOne({ _id: activity._id }, { $set: { createdAt: when } })
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
  const [superAdmin, commercial, other, accountant] = await User.create([
    { email: 'super@test.local', name: 'Super', role: 'SUPER_ADMIN', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'com@test.local', name: 'Com', role: 'COMMERCIAL', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'com2@test.local', name: 'Com2', role: 'COMMERCIAL', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'compta@test.local', name: 'Compta', role: 'COMPTABLE', passwordHash: 'x', twoFactorEnabled: true },
  ])
  superAdminId = superAdmin._id as mongoose.Types.ObjectId
  commercialId = commercial._id as mongoose.Types.ObjectId
  otherCommercialId = other._id as mongoose.Types.ObjectId
  accountantId = accountant._id as mongoose.Types.ObjectId
})

describe('GET /api/admin/crm/pilotage', () => {
  it('refuse un rôle sans permission CRM', async () => {
    actAs(accountantId, 'COMPTABLE')
    await request(app).get('/api/admin/crm/pilotage').expect(403)
  })

  it("construit l'entonnoir depuis l'historique des transitions", async () => {
    const lead = await seedLead({ status: 'PROPOSAL' })
    await seedTransition(lead._id, 'LEAD', 'QUALIFIED', daysAgo(20))
    await seedTransition(lead._id, 'QUALIFIED', 'DEMO', daysAgo(10))
    await seedTransition(lead._id, 'DEMO', 'PROPOSAL', daysAgo(5))
    await seedLead({ status: 'LEAD' })

    actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/crm/pilotage').expect(200)

    const counts = Object.fromEntries(
      response.body.funnel.stages.map((stage: { stage: string; count: number }) => [stage.stage, stage.count]),
    )
    expect(counts.LEAD).toBe(2)
    expect(counts.PROPOSAL).toBe(1)
    expect(counts.WON).toBe(0)
  })

  it('mesure la vélocité sur les durées réellement observées', async () => {
    const lead = await seedLead({ status: 'WON', createdAt: daysAgo(30) })
    await seedTransition(lead._id, 'LEAD', 'PROPOSAL', daysAgo(20))
    await seedTransition(lead._id, 'PROPOSAL', 'WON', daysAgo(10))

    actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/crm/pilotage').expect(200)

    expect(response.body.velocity.cycle.samples).toBe(1)
    expect(response.body.velocity.cycle.medianDays).toBeCloseTo(20, 0)
  })

  it('ventile les pertes par motif, non renseigné compris', async () => {
    await seedLead({ status: 'LOST', lostReason: 'Prix' })
    await seedLead({ status: 'LOST' })

    actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/crm/pilotage').expect(200)

    expect(response.body.losses.total).toBe(2)
    expect(response.body.losses.unspecified).toBe(1)
  })

  it('restreint la cohorte au périmètre du commercial', async () => {
    await seedLead({ company: 'AMoi' })
    await seedLead({ company: 'AUnAutre', assignedTo: otherCommercialId })

    actAs(commercialId, 'COMMERCIAL')
    const response = await request(app).get('/api/admin/crm/pilotage').expect(200)
    expect(response.body.funnel.total).toBe(1)
  })

  it('ne ventile par commercial que pour qui voit tout le monde', async () => {
    await seedLead({})

    actAs(commercialId, 'COMMERCIAL')
    const restricted = await request(app).get('/api/admin/crm/pilotage').expect(200)
    expect(restricted.body.byOwner).toBeNull()

    actAs(superAdminId, 'SUPER_ADMIN')
    const full = await request(app).get('/api/admin/crm/pilotage').expect(200)
    expect(Array.isArray(full.body.byOwner)).toBe(true)
  })

  it('exclut de la cohorte les leads créés avant la fenêtre', async () => {
    await seedLead({ company: 'Vieux', createdAt: daysAgo(200) })
    await seedLead({ company: 'Recent', createdAt: daysAgo(5) })

    actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/crm/pilotage?period=30d').expect(200)
    expect(response.body.funnel.total).toBe(1)
    expect(response.body.period).toBe('30d')
  })

  it('replie une période inconnue sur la valeur par défaut', async () => {
    actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/crm/pilotage?period=depuis-toujours').expect(200)
    expect(response.body.period).toBe('90d')
  })

  it("signale les leads avancés dont le parcours n'est pas journalisé", async () => {
    await seedLead({ status: 'DEMO' })

    actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/crm/pilotage').expect(200)
    expect(response.body.coverage.withoutHistory).toBe(1)
    expect(response.body.coverage.ratio).toBe(0)
  })
})

describe('PATCH /api/admin/crm/leads/:id — motif de perte', () => {
  it('accepte un motif de la liste configurée', async () => {
    const lead = await seedLead({})
    actAs(commercialId, 'COMMERCIAL')

    const response = await request(app)
      .patch(`/api/admin/crm/leads/${lead._id}`)
      .send({ status: 'LOST', lostReason: 'Prix', lostComment: 'Trop cher de 20 %' })
      .expect(200)

    expect(response.body.lead.lostReason).toBe('Prix')
    expect(response.body.lead.lostComment).toBe('Trop cher de 20 %')
  })

  it('refuse un motif hors de la liste', async () => {
    const lead = await seedLead({})
    actAs(commercialId, 'COMMERCIAL')

    const response = await request(app)
      .patch(`/api/admin/crm/leads/${lead._id}`)
      .send({ status: 'LOST', lostReason: 'Parce que' })
      .expect(400)

    expect(response.body.allowed).toContain('Prix')
  })

  it("accepte encore un passage à LOST sans motif, pour ne pas casser l'API", async () => {
    const lead = await seedLead({})
    actAs(commercialId, 'COMMERCIAL')
    await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ status: 'LOST' }).expect(200)
  })
})
