import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'

const emitLeadChanges = vi.fn()
vi.mock('../lib/crmRules.js', () => ({ emitLeadChanges: (...args: unknown[]) => emitLeadChanges(...args) }))

let app: Express
let ipCounter = 0

function body(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Ana',
    lastName: 'Dupont',
    email: 'ana@example.test',
    company: 'Nouvelle Société',
    subject: 'Site web',
    message: 'Nouvelle demande de devis.',
    consent: true,
    website: '',
    startedAt: Date.now() - 2_000,
    ...overrides,
  }
}

const post = (payload: Record<string, unknown>) =>
  request(app).post('/api/contact').set('X-Forwarded-For', `203.0.113.${++ipCounter}`).send(payload)

beforeAll(async () => {
  await setupMongo()
  const { default: contactRoutes } = await import('../routes/public/contact.js')
  app = express()
  app.set('trust proxy', 1)
  app.use(express.json())
  app.use('/api/contact', contactRoutes)
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  emitLeadChanges.mockClear()
})

describe('POST /api/contact — leads existants et événements', () => {
  it('émet LEAD_CREATED (emitLeadChanges, before=null) à la création', async () => {
    const res = await post(body())
    expect(res.status).toBe(202)
    const lead = await Lead.findOne({ contactEmail: 'ana@example.test' })
    expect(lead).toBeTruthy()
    expect(emitLeadChanges).toHaveBeenCalledTimes(1)
    const [emitted, before] = emitLeadChanges.mock.calls[0]
    expect(String(emitted._id)).toBe(String(lead!._id))
    expect(before).toBeNull()
  })

  it("n'écrase pas un lead existant et consigne la demande dans l'historique", async () => {
    const old = new Date('2026-01-01T10:00:00Z')
    const existing = await Lead.create({
      company: 'Société Historique',
      contactName: 'Ana D.',
      contactEmail: 'ana@example.test',
      contactPhone: '0102030405',
      source: 'Salon',
      status: 'QUALIFIED',
      serviceType: 'Ancien besoin',
      notes: 'Notes internes',
      lastContactAt: old,
      lastInteractionAt: old,
      createdBy: null,
    })

    const res = await post(body())
    expect(res.status).toBe(202)

    const after = await Lead.findById(existing._id).lean()
    expect(await Lead.countDocuments()).toBe(1)
    expect(after).toMatchObject({
      company: 'Société Historique',
      contactName: 'Ana D.',
      contactPhone: '0102030405',
      source: 'Salon',
      status: 'QUALIFIED',
      serviceType: 'Ancien besoin',
      notes: 'Notes internes',
    })
    expect(after!.lastContactAt!.getTime()).toBe(old.getTime())
    expect(after!.lastInteractionAt!.getTime()).toBeGreaterThan(old.getTime())

    const activity = await LeadActivity.findOne({ leadId: existing._id }).lean()
    expect(activity).toMatchObject({
      type: 'CONTACT_FORM_SUBMITTED',
      label: 'Nouveau message reçu depuis le site',
      payload: { message: 'Nouvelle demande de devis.', subject: 'Site web' },
    })
    expect(emitLeadChanges).not.toHaveBeenCalled()
  })

  it('compare l’email de façon normalisée (casse et espaces) sans créer de doublon', async () => {
    const existing = await Lead.create({
      company: 'ACME',
      contactName: 'Jean',
      contactEmail: 'Ana@Example.Test',
      source: 'Salon',
      status: 'LEAD',
      createdBy: null,
    })
    const res = await post(body({ email: '  ANA@example.TEST ' }))
    expect(res.status).toBe(202)
    expect(await Lead.countDocuments()).toBe(1)
    expect(await LeadActivity.countDocuments({ leadId: existing._id })).toBe(1)
    expect((await Lead.findById(existing._id).lean())!.contactName).toBe('Jean')
  })

  it('ne modifie pas un lead WON ou LOST, hors ajout à l’historique', async () => {
    for (const status of ['WON', 'LOST'] as const) {
      await clearDb()
      const old = new Date('2026-02-01T10:00:00Z')
      const existing = await Lead.create({
        company: 'Client',
        contactName: 'Ana',
        contactEmail: 'ana@example.test',
        source: 'Salon',
        status,
        lastContactAt: old,
        lastInteractionAt: old,
        createdBy: null,
      })
      const before = await Lead.findById(existing._id).lean()

      const res = await post(body())
      expect(res.status).toBe(202)

      const after = await Lead.findById(existing._id).lean()
      expect(after).toEqual(before)
      expect(await LeadActivity.countDocuments({ leadId: existing._id, type: 'CONTACT_FORM_SUBMITTED' })).toBe(1)
      expect(emitLeadChanges).not.toHaveBeenCalled()
    }
  })
})
