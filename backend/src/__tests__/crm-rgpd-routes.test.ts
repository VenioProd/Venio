import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { asReqUser, resetCrmSettings, seedTeam, type Team, type TeamMember } from './crm-routes-helpers.js'

/**
 * Routes RGPD du CRM (chantier 3D) : statut de la fiche, export et
 * anonymisation (droits, audit), réglage de conservation, audit et plafond de
 * l'export CSV, blocage de l'envoi manuel d'e-mail, lien de désinscription.
 * Aucun e-mail réel : le transport SMTP est simulé.
 */

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))
const mailState = vi.hoisted(() => ({ sent: [] as string[] }))

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = authState.user
    next()
  },
}))
vi.mock('../lib/email/transport.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/email/transport.js')>('../lib/email/transport.js')
  return {
    ...actual,
    getTransporter: () => ({
      sendMail: async ({ to }: { to: string }) => {
        mailState.sent.push(to)
        return {}
      },
    }),
  }
})
vi.mock('../lib/nextcloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createClientFolders: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../automation/trigger.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  triggerAutomations: vi.fn(),
}))

let app: Express
let team: Team
let Lead: typeof import('../models/Lead.js').default
let LeadActivity: typeof import('../models/LeadActivity.js').default
let AuditLog: typeof import('../models/AuditLog.js').default
let SuppressionEntry: typeof import('../models/SuppressionEntry.js').default
let User: typeof import('../models/User.js').default
let privacy: typeof import('../lib/crmPrivacy.js')

const as = (member: TeamMember | null) => {
  authState.user = member ? asReqUser(member) : null
}

beforeAll(async () => {
  await setupMongo()
  Lead = (await import('../models/Lead.js')).default
  LeadActivity = (await import('../models/LeadActivity.js')).default
  AuditLog = (await import('../models/AuditLog.js')).default
  SuppressionEntry = (await import('../models/SuppressionEntry.js')).default
  User = (await import('../models/User.js')).default
  privacy = await import('../lib/crmPrivacy.js')
  const { default: crmRoutes } = await import('../routes/admin/crm.js')
  const { default: extras } = await import('../routes/admin/crmExtras.js')
  const { default: interactions } = await import('../routes/admin/interactions.js')
  const { default: unsubscribe } = await import('../routes/public/unsubscribe.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/crm', extras)
  app.use('/api/admin/crm', crmRoutes)
  app.use('/api/admin/interactions', interactions)
  app.use('/api/public/unsubscribe', unsubscribe)
})
afterAll(async () => {
  authState.user = null
  await teardownMongo()
})
beforeEach(async () => {
  await clearDb()
  mailState.sent.length = 0
  team = await seedTeam()
  await resetCrmSettings()
  as(team.superAdmin)
})

const makeLead = (fields: Record<string, unknown> = {}) =>
  Lead.create({
    company: 'Domaine RGPD',
    contactName: 'Ana',
    contactEmail: 'ana@domaine.test',
    createdBy: team.commercialA.id,
    assignedTo: team.commercialA.id,
    ...fields,
  })

describe('fiche : statut RGPD et opposition', () => {
  it('PATCH pose l’opposition, GET /privacy la restitue avec la présence dans la liste', async () => {
    const lead = await makeLead()
    as(team.commercialA)
    await request(app)
      .patch(`/api/admin/crm/leads/${lead._id}`)
      .send({ doNotContact: true, consent: { basis: 'CONSENT', status: 'WITHDRAWN' } })
      .expect(200)
    await privacy.addSuppression('ana@domaine.test', { reason: 'MANUAL' })
    const res = await request(app).get(`/api/admin/crm/leads/${lead._id}/privacy`).expect(200)
    expect(res.body).toMatchObject({
      doNotContact: true,
      suppressed: true,
      canAdminister: false,
      consent: { basis: 'CONSENT', status: 'WITHDRAWN', source: 'admin' },
    })
    expect(res.body.doNotContactAt).toBeTruthy()
  })

  it('GET /privacy respecte le périmètre de lecture', async () => {
    const lead = await makeLead()
    as(team.manager)
    await request(app).get(`/api/admin/crm/leads/${lead._id}/privacy`).expect(404)
  })
})

describe('droits des personnes : export et anonymisation', () => {
  it.each(['manager', 'commercialA', 'stagiaire'] as const)(
    '%s ne peut ni exporter ni anonymiser (403)',
    async (who) => {
      const lead = await makeLead()
      as(team[who])
      await request(app).get(`/api/admin/crm/leads/${lead._id}/personal-data`).expect(403)
      const res = await request(app).post(`/api/admin/crm/leads/${lead._id}/anonymize`)
      expect([403]).toContain(res.status)
      expect((await Lead.findById(lead._id).lean())?.anonymizedAt).toBeNull()
    },
  )

  it('un ADMIN exporte le JSON complet, et l’export est journalisé dans l’audit', async () => {
    const lead = await makeLead()
    await LeadActivity.create({ leadId: lead._id, type: 'CREATED', label: 'Lead créé', payload: {} })
    as(team.admin)
    const res = await request(app).get(`/api/admin/crm/leads/${lead._id}/personal-data`).expect(200)
    expect(res.headers['content-disposition']).toContain('donnees-personnelles.json')
    expect(res.body.lead.contactEmail).toBe('ana@domaine.test')
    expect(res.body.activities).toHaveLength(1)
    const audit = await AuditLog.findOne({ action: 'CRM_LEAD_PERSONAL_DATA_EXPORT' }).lean()
    expect(String(audit?.userId)).toBe(team.admin.id)
    expect((audit?.metadata as { entityId?: string }).entityId).toBe(String(lead._id))
  })

  it('un ADMIN anonymise (une fois), l’acte est journalisé ; un lead inconnu rend 404', async () => {
    const lead = await makeLead({ contactPhone: '0601020304', notes: 'Ana, 3 enfants' })
    as(team.admin)
    const res = await request(app).post(`/api/admin/crm/leads/${lead._id}/anonymize`).expect(200)
    expect(res.body.lead).toMatchObject({
      contactName: 'Anonymisé (demande)',
      contactEmail: '',
      contactPhone: '',
      notes: 'Anonymisé (demande)',
    })
    await request(app).post(`/api/admin/crm/leads/${lead._id}/anonymize`).expect(409)
    expect(await AuditLog.countDocuments({ action: 'CRM_LEAD_ANONYMIZE' })).toBe(1)
    await request(app).post('/api/admin/crm/leads/64b000000000000000000009/anonymize').expect(404)
  })

  it('un utilisateur restreint à une entité n’accède pas aux leads d’une autre', async () => {
    const lead = await makeLead({ entity: 'ARROW' })
    await User.updateOne({ _id: team.admin.id }, { $set: { crmEntities: ['VENIO'] } })
    authState.user = { ...asReqUser(team.admin), crmEntities: ['VENIO'] } as Request['user']
    await request(app).get(`/api/admin/crm/leads/${lead._id}/personal-data`).expect(404)
  })
})

describe('réglages de conservation', () => {
  it('borne retentionMonths, exige un booléen pour l’activation, et garde la purge désactivée par défaut', async () => {
    const initial = await request(app).get('/api/admin/crm/settings').expect(200)
    expect(initial.body.settings).toMatchObject({ retentionMonths: 36, retentionPurgeEnabled: false })
    await request(app).patch('/api/admin/crm/settings').send({ retentionMonths: 3 }).expect(400)
    await request(app).patch('/api/admin/crm/settings').send({ retentionMonths: 12.5 }).expect(400)
    await request(app).patch('/api/admin/crm/settings').send({ retentionPurgeEnabled: 'oui' }).expect(400)
    const ok = await request(app)
      .patch('/api/admin/crm/settings')
      .send({ retentionMonths: 24, retentionPurgeEnabled: true })
      .expect(200)
    expect(ok.body.settings).toMatchObject({ retentionMonths: 24, retentionPurgeEnabled: true })
    as(team.manager)
    await request(app).patch('/api/admin/crm/settings').send({ retentionPurgeEnabled: false }).expect(403)
  })
})

describe('export CSV : audit et plafond', () => {
  it('chaque export est journalisé (qui, filtres, nombre de lignes), sans en-tête de troncature sous le plafond', async () => {
    await makeLead({ status: 'DEMO' })
    await makeLead({ company: 'Autre', status: 'LEAD' })
    const res = await request(app).get('/api/admin/crm/leads/export?status=DEMO').expect(200)
    expect(res.headers['x-export-truncated']).toBeUndefined()
    const audit = await AuditLog.findOne({ action: 'CRM_LEADS_EXPORT' }).lean()
    expect(String(audit?.userId)).toBe(team.superAdmin.id)
    expect(audit?.metadata).toMatchObject({
      rows: 1,
      truncated: false,
      channel: 'admin',
      filters: { status: 'DEMO', archived: false },
    })
    expect(audit?.createdAt).toBeInstanceOf(Date)
  })

  it('signale le plafond de 5000 lignes par X-Export-Truncated', async () => {
    const now = new Date()
    await Lead.collection.insertMany(
      Array.from({ length: 5001 }, (_, i) => ({
        company: `Lead ${i}`,
        status: 'LEAD',
        archivedAt: null,
        entity: 'VENIO',
        tags: [],
        createdAt: now,
        updatedAt: now,
      })),
    )
    const res = await request(app).get('/api/admin/crm/leads/export?columns=company').expect(200)
    expect(res.headers['x-export-truncated']).toBe('5000')
    expect(res.text.split('\r\n')).toHaveLength(5001)
    expect((await AuditLog.findOne({ action: 'CRM_LEADS_EXPORT' }).lean())?.metadata).toMatchObject({
      rows: 5000,
      truncated: true,
    })
  })
})

describe('envoi manuel d’e-mail depuis la fiche', () => {
  const send = (leadId: unknown, recipients?: unknown[]) =>
    request(app)
      .post(`/api/admin/interactions/LEAD/${leadId}/email`)
      .send({ subject: 'Relance', body: 'Bonjour', ...(recipients ? { recipients } : {}) })

  it('envoie normalement quand rien ne s’y oppose', async () => {
    const lead = await makeLead()
    as(team.commercialA)
    await send(lead._id).expect(201)
    expect(mailState.sent).toEqual(['ana@domaine.test'])
  })

  it('limite les destinataires libres à 10', async () => {
    const lead = await makeLead()
    as(team.commercialA)
    const res = await send(
      lead._id,
      Array.from({ length: 11 }, (_, i) => `p${i}@domaine.test`),
    ).expect(400)
    expect(res.body.code).toBe('TOO_MANY_RECIPIENTS')
    expect(mailState.sent).toEqual([])
  })

  it('refuse l’envoi à un lead opposé et le consigne dans l’historique', async () => {
    const lead = await makeLead({ doNotContact: true })
    as(team.commercialA)
    const res = await send(lead._id).expect(409)
    expect(res.body).toMatchObject({ code: 'DO_NOT_CONTACT', via: 'LEAD' })
    expect(mailState.sent).toEqual([])
    expect(await LeadActivity.exists({ leadId: lead._id, type: 'EMAIL_BLOCKED' })).toBeTruthy()
  })

  it('vérifie chaque destinataire libre contre la liste de suppression : rien ne part', async () => {
    const lead = await makeLead()
    await privacy.addSuppression('bloque@domaine.test', { reason: 'UNSUBSCRIBE' })
    as(team.commercialA)
    const res = await send(lead._id, ['ok@domaine.test', 'BLOQUE@domaine.test']).expect(409)
    expect(res.body).toMatchObject({
      code: 'DO_NOT_CONTACT',
      via: 'SUPPRESSION_LIST',
      blocked: ['bloque@domaine.test'],
    })
    expect(mailState.sent).toEqual([])
  })
})

describe('GET /api/public/unsubscribe', () => {
  it('lien valide : opposition, liste de suppression, page de confirmation, audit ; un second clic ne change rien', async () => {
    const lead = await makeLead()
    const token = privacy.signUnsubscribeToken({ leadId: lead._id, email: 'ana@domaine.test' })
    authState.user = null
    const res = await request(app)
      .get(`/api/public/unsubscribe?token=${encodeURIComponent(token)}`)
      .expect(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.text).toContain('Désinscription confirmée')
    expect((await Lead.findById(lead._id).lean())?.doNotContact).toBe(true)
    expect(await SuppressionEntry.exists({ emailNormalized: 'ana@domaine.test', reason: 'UNSUBSCRIBE' })).toBeTruthy()
    await request(app)
      .get(`/api/public/unsubscribe?token=${encodeURIComponent(token)}`)
      .expect(200)
    expect(await AuditLog.countDocuments({ action: 'CRM_LEAD_UNSUBSCRIBE' })).toBe(1)
  })

  it('lien invalide (400) ou expiré (410) : rien n’est écrit', async () => {
    const lead = await makeLead()
    authState.user = null
    const token = privacy.signUnsubscribeToken({ leadId: lead._id, email: 'ana@domaine.test' })
    await request(app)
      .get(`/api/public/unsubscribe?token=${encodeURIComponent(token.slice(0, -3))}abc`)
      .expect(400)
    await request(app).get('/api/public/unsubscribe').expect(400)
    const expired = privacy.signUnsubscribeToken(
      { leadId: lead._id, email: 'ana@domaine.test' },
      new Date('2020-01-01T00:00:00Z'),
      1,
    )
    const res = await request(app)
      .get(`/api/public/unsubscribe?token=${encodeURIComponent(expired)}`)
      .expect(410)
    expect(res.text).toContain('Lien expiré')
    expect((await Lead.findById(lead._id).lean())?.doNotContact).toBe(false)
    expect(await SuppressionEntry.countDocuments()).toBe(0)
  })

  it('POST (désinscription en un clic des messageries) a le même effet', async () => {
    const lead = await makeLead()
    authState.user = null
    const token = privacy.signUnsubscribeToken({ leadId: lead._id, email: 'ana@domaine.test' })
    const res = await request(app)
      .post(`/api/public/unsubscribe?token=${encodeURIComponent(token)}`)
      .type('form')
      .send('List-Unsubscribe=One-Click')
      .expect(200)
    expect(res.body).toEqual({ ok: true })
    expect((await Lead.findById(lead._id).lean())?.doNotContact).toBe(true)
  })
})
