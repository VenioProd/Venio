import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { setupMongoReplSet, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import commercialRoutes from '../routes/commercial/index.js'
import adminCallDeskRoutes from '../routes/admin/callDesk.js'
import adminCrmRoutes from '../routes/admin/crm.js'
import { candidatesFor } from '../lib/crmRules.js'
import { migrations } from '../lib/migrations.js'
import CrmSettings from '../models/CrmSettings.js'
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import User from '../models/User.js'
import type { ICrmRule } from '../models/CrmRule.js'

vi.mock('../lib/notifyHelpers.js', () => ({
  notifyUsers: vi.fn().mockResolvedValue(undefined),
  notifySuperAdmins: vi.fn().mockResolvedValue(undefined),
}))

/**
 * Décision du propriétaire du 13 nov. 2026 : une fiche saisie par un externe
 * hors de ses listes lui est réservée jusqu'au passage au closer, comme ses
 * listes d'appel (`teamLeadFilter`). Une fiche que l'équipe lui a confiée reste
 * visible de l'équipe.
 */
const app = express()
app.use(express.json())
app.use('/api/commercial', commercialRoutes)
app.use('/api/admin/call-desk', adminCallDeskRoutes)
app.use('/api/admin/crm', adminCrmRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

type Who = { id: string; cookie: string }
let rep: Who
let admin: Who

beforeAll(async () => {
  await setupMongoReplSet()
  await Promise.all([Lead, LeadActivity, CrmSettings, User].map((model) => (model as typeof Lead).init()))
})
afterAll(teardownMongo)
beforeEach(async () => {
  // Mardi 10 h à Paris : dans la plage d'appel par défaut.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-10T09:00:00Z') })
  await clearDb()
  const who: Who[] = []
  for (const [name, role] of [
    ['Rita', 'COMMERCIAL_EXTERNE'],
    ['Alice', 'ADMIN'],
  ] as const) {
    const user = await User.create({ name, email: `${name.toLowerCase()}@saisie.test`, passwordHash: 'unused', role })
    who.push({ id: String(user._id), cookie: `venio_session=${(await createSession(String(user._id))).token}` })
  }
  ;[rep, admin] = who as [Who, Who]
  await CrmSettings.updateSettings({ defaultCloserId: admin.id } as never)
})
afterEach(() => vi.useRealTimers())

const get = (who: Who, path: string) => request(app).get(path).set('Cookie', who.cookie)
const ids = (leads: Array<{ _id: unknown }>) => leads.map((lead) => String(lead._id)).sort()

it('fiche saisie par un externe hors liste : à lui seul jusqu’au passage, hors file, pipeline et règles', async () => {
  const created = await request(app)
    .post('/api/commercial/leads')
    .set('Cookie', rep.cookie)
    .send({ company: 'Saisie Rita', businessContact: true, contactPhone: '+33666666666' })
  expect(created.status).toBe(201)
  const entered = String(created.body.lead._id)
  expect((await Lead.findById(entered))!.enteredByRep).toBe(true)
  // Confiée par l'équipe : reste visible de l'équipe, comme avant.
  const entrusted = String(
    (await Lead.create({ company: 'Confiée', contactPhone: '+33677777777', externalRep: rep.id, createdBy: admin.id }))
      ._id,
  )

  const queue = async () => ids((await get(admin, '/api/admin/call-desk/calls/queue?mine=0')).body.leads)
  const pipeline = async () =>
    ids(
      ((await get(admin, '/api/admin/crm/pipeline')).body.columns as Array<{ leads: Array<{ _id: string }> }>).flatMap(
        (column) => column.leads,
      ),
    )
  const rule = { trigger: { type: 'LEAD_INACTIVE', params: { days: 0 } }, conditions: [] } as unknown as ICrmRule
  const sweep = async () => ids(await candidatesFor(rule, new Date(Date.now() + 86400_000)))

  expect(await queue()).toEqual([entrusted])
  expect(await pipeline()).toEqual([entrusted])
  expect(await sweep()).toEqual([entrusted])
  expect(ids((await get(admin, '/api/admin/crm/leads')).body.leads)).toEqual([entrusted])
  expect((await get(admin, `/api/admin/call-desk/leads/${entered}/calls`)).status).toBe(404)
  // L'externe l'appelle comme une fiche de ses listes.
  expect(ids((await get(rep, '/api/commercial/calls/queue')).body.leads)).toEqual([entered, entrusted].sort())

  // Passage au closer : la fiche rejoint l'équipe.
  const handoff = await request(app)
    .post(`/api/commercial/leads/${entered}/ready-to-close`)
    .set('Cookie', rep.cookie)
    .send({})
  expect(handoff.status).toBe(200)
  expect(await queue()).toEqual([entered, entrusted].sort())
  expect(await pipeline()).toEqual([entered, entrusted].sort())
  expect(await sweep()).toEqual([entered, entrusted].sort())
})

it('migration 015 : marque les fiches saisies par un externe avant le marqueur, pas celles confiées', async () => {
  const legacy = await Lead.create({ company: 'Ancienne', externalRep: rep.id, createdBy: rep.id })
  const entrusted = await Lead.create({ company: 'Confiée', externalRep: rep.id, createdBy: admin.id })
  const returned = await Lead.create({ company: 'Rendue', externalRep: null, createdBy: rep.id })
  await Lead.collection.updateMany({}, { $unset: { enteredByRep: '' } })

  expect(await migrations['015']!(true)).toBe(1)
  expect(await Lead.countDocuments({ enteredByRep: true })).toBe(0)
  expect(await migrations['015']!(false)).toBe(1)
  expect((await Lead.findById(legacy._id))!.enteredByRep).toBe(true)
  expect((await Lead.findById(entrusted._id))!.enteredByRep).toBe(false)
  expect((await Lead.findById(returned._id))!.enteredByRep).toBe(false)
  expect(await migrations['015']!(false)).toBe(0)
})
