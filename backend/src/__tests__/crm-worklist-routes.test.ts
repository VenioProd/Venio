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

function daysFromNow(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

async function createLead(overrides: Record<string, unknown> = {}) {
  const { default: Lead } = await import('../models/Lead.js')
  return Lead.create({ company: 'Acme', status: 'LEAD', assignedTo: commercialId, ...overrides })
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
  const [superAdmin, commercial, otherCommercial, accountant] = await User.create([
    { email: 'super@test.local', name: 'Super', role: 'SUPER_ADMIN', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'com@test.local', name: 'Com', role: 'COMMERCIAL', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'com2@test.local', name: 'Com2', role: 'COMMERCIAL', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'compta@test.local', name: 'Compta', role: 'COMPTABLE', passwordHash: 'x', twoFactorEnabled: true },
  ])
  superAdminId = superAdmin._id as mongoose.Types.ObjectId
  commercialId = commercial._id as mongoose.Types.ObjectId
  otherCommercialId = otherCommercial._id as mongoose.Types.ObjectId
  accountantId = accountant._id as mongoose.Types.ObjectId
})

describe('GET /api/admin/crm/worklist', () => {
  it('refuse un rôle sans permission CRM', async () => {
    actAs(accountantId, 'COMPTABLE')
    await request(app).get('/api/admin/crm/worklist').expect(403)
  })

  it('groupe les leads par échéance et par dérive', async () => {
    await createLead({ company: 'EnRetard', nextActionAt: daysFromNow(-3) })
    await createLead({ company: 'Aujourdhui', nextActionAt: new Date() })
    await createLead({ company: 'AVenir', nextActionAt: daysFromNow(4) })
    await createLead({ company: 'Froid', lastContactAt: daysFromNow(-30) })
    await createLead({ company: 'Calme' })

    actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/crm/worklist').expect(200)

    expect(response.body.groups.overdue.map((l: { company: string }) => l.company)).toEqual(['EnRetard'])
    expect(response.body.groups.today.map((l: { company: string }) => l.company)).toEqual(['Aujourdhui'])
    expect(response.body.groups.upcoming.map((l: { company: string }) => l.company)).toEqual(['AVenir'])
    expect(response.body.groups.drifting.map((l: { company: string }) => l.company)).toEqual(['Froid'])
    expect(response.body.counts).toEqual({ overdue: 1, today: 1, upcoming: 1, drifting: 1 })
  })

  it('exclut les leads gagnés et perdus', async () => {
    await createLead({ company: 'Gagne', status: 'WON', nextActionAt: daysFromNow(-3) })
    await createLead({ company: 'Perdu', status: 'LOST', nextActionAt: daysFromNow(-3) })

    actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/crm/worklist').expect(200)

    expect(response.body.counts).toEqual({ overdue: 0, today: 0, upcoming: 0, drifting: 0 })
  })

  it("restreint un commercial aux leads qui lui sont assignés ou qu'il a créés", async () => {
    await createLead({ company: 'AMoi', nextActionAt: daysFromNow(-3) })
    await createLead({
      company: 'ParMoi',
      nextActionAt: daysFromNow(-3),
      assignedTo: otherCommercialId,
      createdBy: commercialId,
    })
    await createLead({ company: 'AUnAutre', nextActionAt: daysFromNow(-3), assignedTo: otherCommercialId })

    actAs(commercialId, 'COMMERCIAL')
    const response = await request(app).get('/api/admin/crm/worklist').expect(200)

    expect(response.body.groups.overdue.map((l: { company: string }) => l.company).sort()).toEqual(['AMoi', 'ParMoi'])
  })

  it('applique les seuils configurés dans CrmSettings au lieu des valeurs par défaut', async () => {
    const { default: CrmSettings } = await import('../models/CrmSettings.js')
    await createLead({ company: 'Tiede', lastContactAt: daysFromNow(-4) })

    actAs(superAdminId, 'SUPER_ADMIN')
    const avant = await request(app).get('/api/admin/crm/worklist').expect(200)
    expect(avant.body.counts.drifting).toBe(0)

    const settings = await CrmSettings.getSettings()
    settings.coldLeadThresholdDays = 3
    await settings.save()

    const apres = await request(app).get('/api/admin/crm/worklist').expect(200)
    expect(apres.body.counts.drifting).toBe(1)
    expect(apres.body.thresholds.coldDays).toBe(3)
  })

  it("respecte la désactivation d'une alerte", async () => {
    const { default: CrmSettings } = await import('../models/CrmSettings.js')
    await createLead({ company: 'EnRetard', nextActionAt: daysFromNow(-3) })

    const settings = await CrmSettings.getSettings()
    settings.overdueAlertEnabled = false
    await settings.save()

    actAs(superAdminId, 'SUPER_ADMIN')
    const response = await request(app).get('/api/admin/crm/worklist').expect(200)

    expect(response.body.counts.overdue).toBe(0)
    expect(response.body.thresholds.overdueEnabled).toBe(false)
  })
})

describe('POST /api/admin/crm/leads/:id/notes', () => {
  it('crée une LeadActivity de type NOTE attribuée à son auteur', async () => {
    const { default: LeadActivity } = await import('../models/LeadActivity.js')
    const lead = await createLead()

    actAs(commercialId, 'COMMERCIAL')
    const response = await request(app)
      .post(`/api/admin/crm/leads/${lead._id}/notes`)
      .send({ text: '  Rappelé, rappeler lundi  ' })
      .expect(201)

    expect(response.body.activity.type).toBe('NOTE')
    const stored = await LeadActivity.find({ leadId: lead._id })
    expect(stored).toHaveLength(1)
    expect(stored[0].label).toBe('Rappelé, rappeler lundi')
    expect(stored[0].actorId?.toString()).toBe(commercialId.toString())
  })

  it('refuse une note vide', async () => {
    const lead = await createLead()
    actAs(commercialId, 'COMMERCIAL')
    await request(app).post(`/api/admin/crm/leads/${lead._id}/notes`).send({ text: '   ' }).expect(400)
  })

  it('refuse une note trop longue', async () => {
    const lead = await createLead()
    actAs(commercialId, 'COMMERCIAL')
    await request(app)
      .post(`/api/admin/crm/leads/${lead._id}/notes`)
      .send({ text: 'a'.repeat(2001) })
      .expect(400)
  })

  it('renvoie 404 sur un lead hors du périmètre du commercial', async () => {
    const lead = await createLead({ assignedTo: otherCommercialId })
    actAs(commercialId, 'COMMERCIAL')
    await request(app).post(`/api/admin/crm/leads/${lead._id}/notes`).send({ text: 'Coucou' }).expect(404)
  })
})

describe('GET /api/admin/crm/leads/:id/activities', () => {
  it('renvoie 404 sur un lead hors du périmètre du commercial', async () => {
    const lead = await createLead({ assignedTo: otherCommercialId })
    actAs(commercialId, 'COMMERCIAL')
    await request(app).get(`/api/admin/crm/leads/${lead._id}/activities`).expect(404)
  })
})

describe('GET /api/admin/crm/alerts', () => {
  it("n'existe plus, remplacé par /worklist", async () => {
    actAs(superAdminId, 'SUPER_ADMIN')
    await request(app).get('/api/admin/crm/alerts').expect(404)
  })
})
