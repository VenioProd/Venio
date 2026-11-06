import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import type { AutomationDefinition } from '../automation/types.js'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { asReqUser, resetCrmSettings, seedTeam, type Team, type TeamMember } from './crm-routes-helpers.js'
import {
  canReadLead,
  isLeadOutOfScope,
  leadScopeFilter,
  leadWriteScopeFilter,
  readsUnrestrictedCrm,
} from '../lib/crmScope.js'
import {
  DEFAULT_PROPOSAL_REMINDER_DAYS,
  proposalReminderCutoff,
  proposalReminderDaysOf,
} from '../lib/crmProposalReminder.js'

/**
 * Chantier 4A — périmètre ADMIN et derniers trous de droits du CRM :
 *   1. l'administrateur lit et écrit tout le CRM, sous réserve de sa
 *      restriction d'entités (`crmEntities`) ;
 *   2. rattacher / détacher un projet suit le périmètre d'écriture du lead ;
 *   3. l'envoi groupé libre retire les adresses « ne pas contacter » ;
 *   4. un seul seuil de relance de proposition (`proposalReminderDays`).
 */

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))
const sendBulkEmail = vi.hoisted(() =>
  vi.fn(async (input: { recipients: { email: string }[] }) => ({
    results: input.recipients.map((r) => ({ email: r.email, success: true })),
    sent: input.recipients.length,
    failed: 0,
    total: input.recipients.length,
  })),
)
const mail = vi.hoisted(() => ({ sendProposalReminderEmail: vi.fn(async (..._a: unknown[]) => ({ sent: true })) }))
const createNotification = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => null))
const registered = vi.hoisted(() => ({}) as Record<string, AutomationDefinition>)

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = authState.user
    next()
  },
}))
vi.mock('../lib/nextcloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createClientFolders: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../automation/trigger.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  triggerAutomations: vi.fn(),
}))
vi.mock('../lib/email/send.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendBulkEmail,
}))
vi.mock('../lib/email.js', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...mail }))
vi.mock('../lib/notifications.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createNotification,
}))
vi.mock('../automation/registry.js', () => ({
  registerAutomation: (d: AutomationDefinition) => {
    registered[d.key] = d
  },
}))

const ME = '64b000000000000000000001'
const OTHER = '64b000000000000000000002'
const DAY = 24 * 3600 * 1000

const fakeReq = (id: string, role: string, crmEntities?: string[]) =>
  ({ user: { id, role, crmEntities } }) as unknown as Pick<Request, 'user'>

// ───────────────────────────────────────────────────────────────────────────
// 1. Périmètre ADMIN (fonctions pures)
// ───────────────────────────────────────────────────────────────────────────

describe('périmètre ADMIN / fonctions pures', () => {
  it('sans restriction d\'entité : lit et écrit tout le CRM', () => {
    const admin = fakeReq(ME, 'ADMIN')
    expect(readsUnrestrictedCrm(admin)).toBe(true)
    expect(leadScopeFilter(admin)).toEqual({})
    expect(leadWriteScopeFilter(admin)).toEqual({})
    expect(canReadLead(admin, { assignedTo: OTHER, createdBy: OTHER })).toBe(true)
    expect(isLeadOutOfScope(admin, { assignedTo: OTHER, createdBy: OTHER })).toBe(false)
  })

  it('liste vide : comportement inchangé', () => {
    expect(leadWriteScopeFilter(fakeReq(ME, 'ADMIN', []))).toEqual({})
  })

  it('avec restriction d\'entité : tout le CRM, mais seulement dans ses entités', () => {
    const admin = fakeReq(ME, 'ADMIN', ['ARROW'])
    expect(readsUnrestrictedCrm(admin)).toBe(false)
    expect(leadScopeFilter(admin)).toEqual({ entity: { $in: ['ARROW'] } })
    expect(leadWriteScopeFilter(admin)).toEqual({ entity: { $in: ['ARROW'] } })
    expect(canReadLead(admin, { assignedTo: OTHER, entity: 'ARROW' })).toBe(true)
    expect(canReadLead(admin, { assignedTo: ME, entity: 'VENIO' })).toBe(false)
    expect(isLeadOutOfScope(admin, { assignedTo: OTHER, createdBy: OTHER, entity: 'ARROW' })).toBe(false)
    // Même son propre lead, hors entité, n'est pas modifiable.
    expect(isLeadOutOfScope(admin, { assignedTo: ME, entity: 'VENIO' })).toBe(true)
  })

  it('le commercial lit tout mais n\'écrit toujours que sur ses leads', () => {
    const commercial = fakeReq(ME, 'COMMERCIAL')
    expect(leadScopeFilter(commercial)).toEqual({})
    expect(leadWriteScopeFilter(commercial)).toEqual({ $or: [{ assignedTo: ME }, { createdBy: ME }] })
    expect(isLeadOutOfScope(commercial, { assignedTo: OTHER, createdBy: OTHER })).toBe(true)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 4. Seuil unique de relance de proposition (fonctions pures)
// ───────────────────────────────────────────────────────────────────────────

describe('seuil de relance de proposition / fonctions pures', () => {
  it('lit proposalReminderDays, retombe sur 7 si absent ou invalide', () => {
    expect(DEFAULT_PROPOSAL_REMINDER_DAYS).toBe(7)
    expect(proposalReminderDaysOf({ proposalReminderDays: 5 })).toBe(5)
    expect(proposalReminderDaysOf({ proposalReminderDays: 10.7 })).toBe(10)
    for (const bad of [undefined, null, 0, -3, Number.NaN, 'abc']) {
      expect(proposalReminderDaysOf({ proposalReminderDays: bad })).toBe(7)
    }
    expect(proposalReminderDaysOf(null)).toBe(7)
  })

  it('date limite = maintenant - n jours', () => {
    const now = new Date('2026-11-06T10:00:00Z')
    expect(proposalReminderCutoff(now, 7).toISOString()).toBe('2026-10-30T10:00:00.000Z')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Base de données
// ───────────────────────────────────────────────────────────────────────────

let app: Express
let team: Team
let Lead: typeof import('../models/Lead.js').default
let LeadActivity: typeof import('../models/LeadActivity.js').default
let Project: typeof import('../models/Project.js').default
let User: typeof import('../models/User.js').default
let SuppressionEntry: typeof import('../models/SuppressionEntry.js').default
let CrmSettings: typeof import('../models/CrmSettings.js').default

function as(member: TeamMember | null, crmEntities?: string[]): void {
  authState.user = member ? { ...asReqUser(member), ...(crmEntities ? { crmEntities } : {}) } : null
}

beforeAll(async () => {
  await setupMongo()
  Lead = (await import('../models/Lead.js')).default
  LeadActivity = (await import('../models/LeadActivity.js')).default
  Project = (await import('../models/Project.js')).default
  User = (await import('../models/User.js')).default
  SuppressionEntry = (await import('../models/SuppressionEntry.js')).default
  CrmSettings = (await import('../models/CrmSettings.js')).default
  const { default: crmRoutes } = await import('../routes/admin/crm.js')
  const { default: emailComposer } = await import('../routes/admin/emailComposer.js')
  ;(await import('../automation/jobs/crmProposalFollowup.js')).register()
  app = express()
  app.use(express.json())
  app.use('/api/admin/crm', crmRoutes)
  app.use('/api/admin/email-composer', emailComposer)
})

afterAll(async () => {
  authState.user = null
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  vi.clearAllMocks()
  team = await seedTeam()
  await resetCrmSettings()
  as(team.admin)
})

const companies = (body: { leads: { company: string }[] }) => body.leads.map((l) => l.company).sort()

describe('périmètre ADMIN / routes', () => {
  let venio: string
  let arrow: string

  beforeEach(async () => {
    venio = String((await Lead.create({ company: 'Venio B', entity: 'VENIO', createdBy: team.commercialB.id, assignedTo: team.commercialB.id }))._id)
    arrow = String((await Lead.create({ company: 'Arrow B', entity: 'ARROW', createdBy: team.commercialB.id, assignedTo: team.commercialB.id }))._id)
  })

  it('un administrateur sans restriction lit, modifie et supprime le lead d\'un autre', async () => {
    const list = await request(app).get('/api/admin/crm/leads').expect(200)
    expect(companies(list.body)).toEqual(['Arrow B', 'Venio B'])
    await request(app).get(`/api/admin/crm/leads/${venio}`).expect(200)
    await request(app).patch(`/api/admin/crm/leads/${venio}`).send({ notes: 'repris' }).expect(200)
    expect((await Lead.findById(venio).lean())?.notes).toBe('repris')
    await request(app).delete(`/api/admin/crm/leads/${venio}`).expect(200)
    expect(await Lead.findById(venio)).toBeNull()
  })

  it('un administrateur restreint à ARROW lit et écrit tout ARROW, rien d\'autre', async () => {
    as(team.admin, ['ARROW'])
    const list = await request(app).get('/api/admin/crm/leads').expect(200)
    expect(companies(list.body)).toEqual(['Arrow B'])
    await request(app).get(`/api/admin/crm/leads/${venio}`).expect(404)
    await request(app).patch(`/api/admin/crm/leads/${venio}`).send({ notes: 'intrusion' }).expect(404)
    await request(app).delete(`/api/admin/crm/leads/${venio}`).expect(404)
    expect((await Lead.findById(venio).lean())?.notes ?? '').toBe('')
    await request(app).patch(`/api/admin/crm/leads/${arrow}`).send({ notes: 'ok' }).expect(200)
    // Sortir un lead de son périmètre reste refusé.
    await request(app).patch(`/api/admin/crm/leads/${arrow}`).send({ entity: 'VENIO' }).expect(403)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 2. Rattachement / détachement de projet
// ───────────────────────────────────────────────────────────────────────────

describe('rattachement de projet / périmètre d\'écriture du lead', () => {
  let client: string
  let project: string
  let foreignLead: string
  let ownLead: string
  let arrowLead: string

  beforeEach(async () => {
    // Client suivi par le commercial A : ses projets lui sont lisibles.
    client = String(
      (await User.create({ email: 'client-a@crm-admin.test', name: 'Client A', role: 'CLIENT', passwordHash: 'x', ownerAdminId: team.commercialA.id }))._id,
    )
    project = String((await Project.create({ name: 'Site', client }))._id)
    foreignLead = String((await Lead.create({ company: 'De B', createdBy: team.commercialB.id, assignedTo: team.commercialB.id }))._id)
    ownLead = String((await Lead.create({ company: 'De A', createdBy: team.commercialA.id, assignedTo: team.commercialA.id }))._id)
    arrowLead = String((await Lead.create({ company: 'Arrow', entity: 'ARROW', createdBy: team.commercialB.id, assignedTo: team.commercialB.id }))._id)
  })

  const link = (lead: string) => request(app).post(`/api/admin/crm/leads/${lead}/projects/${project}`)
  const unlink = (lead: string) => request(app).delete(`/api/admin/crm/leads/${lead}/projects/${project}`)
  const sourceLead = async () => {
    const found = await Project.findById(project).select('sourceLead').lean()
    return found?.sourceLead ? String(found.sourceLead) : null
  }

  it.each(['superAdmin', 'admin'])('%s rattache puis détache un projet au lead d\'un autre', async (who) => {
    as(team[who]!)
    await link(foreignLead).expect(200)
    expect(await sourceLead()).toBe(foreignLead)
    expect(await LeadActivity.countDocuments({ leadId: foreignLead, type: 'PROJECT_LINKED' })).toBe(1)
    await unlink(foreignLead).expect(200)
    expect(await sourceLead()).toBeNull()
    expect(await LeadActivity.countDocuments({ leadId: foreignLead, type: 'PROJECT_UNLINKED' })).toBe(1)
  })

  it('le commercial rattache un projet à son lead, pas au lead d\'un autre', async () => {
    as(team.commercialA)
    await link(foreignLead).expect(404)
    expect(await sourceLead()).toBeNull()
    await link(ownLead).expect(200)
    expect(await sourceLead()).toBe(ownLead)
  })

  it('le commercial ne détache pas le projet du lead d\'un autre', async () => {
    await Project.updateOne({ _id: project }, { $set: { sourceLead: foreignLead } })
    as(team.commercialA)
    await unlink(foreignLead).expect(404)
    expect(await sourceLead()).toBe(foreignLead)
  })

  it('un administrateur restreint par entité ne rattache que dans ses entités', async () => {
    as(team.admin, ['ARROW'])
    await link(foreignLead).expect(404) // lead VENIO (entité par défaut)
    expect(await sourceLead()).toBeNull()
    await link(arrowLead).expect(200)
    expect(await sourceLead()).toBe(arrowLead)
    as(team.admin, ['DECISIO'])
    await unlink(arrowLead).expect(404)
    expect(await sourceLead()).toBe(arrowLead)
  })

  it.each(['stagiaire', 'viewer'])('%s ne rattache rien (manage_crm ou accès admin absent)', async (who) => {
    as(team[who]!)
    await link(foreignLead).expect(403)
    expect(await sourceLead()).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 3. Envoi groupé libre : liste de suppression et opposition
// ───────────────────────────────────────────────────────────────────────────

describe('envoi groupé / destinataires « ne pas contacter »', () => {
  const send = (recipients: string[]) =>
    request(app).post('/api/admin/email-composer/send').send({ subject: 'Nouveautés', body: 'Bonjour', recipients })

  it('retire les adresses de la liste et des leads opposés, envoie aux autres', async () => {
    await SuppressionEntry.create({ emailNormalized: 'liste@ex.test', reason: 'UNSUBSCRIBE' })
    const opposed = await Lead.create({ company: 'Opposé', contactEmail: 'Oppose@Ex.test', doNotContact: true, createdBy: team.admin.id })
    const listed = await Lead.create({ company: 'Inscrit', contactEmail: 'liste@ex.test', createdBy: team.admin.id })
    await Lead.create({ company: 'Libre', contactEmail: 'libre@ex.test', createdBy: team.admin.id })

    const res = await send(['libre@ex.test', 'LISTE@ex.test', 'oppose@ex.test', 'equipe@ex.test']).expect(200)

    expect(sendBulkEmail).toHaveBeenCalledTimes(1)
    const sentTo = sendBulkEmail.mock.calls[0]![0].recipients.map((r) => r.email)
    expect(sentTo).toEqual(['libre@ex.test', 'equipe@ex.test'])
    expect(res.body.sent).toBe(2)
    expect(res.body.total).toBe(2)
    expect(res.body.blocked).toEqual([
      { email: 'liste@ex.test', reason: 'DO_NOT_CONTACT', via: 'SUPPRESSION_LIST' },
      { email: 'oppose@ex.test', reason: 'DO_NOT_CONTACT', via: 'LEAD' },
    ])

    // Journal : une activité EMAIL_BLOCKED par lead concerné, aucune pour les autres.
    const blockedActivities = await LeadActivity.find({ type: 'EMAIL_BLOCKED' }).lean()
    expect(blockedActivities.map((a) => String(a.leadId)).sort()).toEqual([String(opposed._id), String(listed._id)].sort())
    for (const activity of blockedActivities) {
      expect(activity.payload).toMatchObject({ reason: 'DO_NOT_CONTACT', channel: 'email_composer' })
      expect(String(activity.actorId)).toBe(team.admin.id)
    }
  })

  it('tous les destinataires bloqués : rien n\'est envoyé, la liste est rendue', async () => {
    await SuppressionEntry.create({ emailNormalized: 'liste@ex.test', reason: 'MANUAL' })
    const res = await send(['liste@ex.test']).expect(200)
    expect(sendBulkEmail).not.toHaveBeenCalled()
    expect(res.body).toMatchObject({ sent: 0, failed: 0, total: 0, results: [] })
    expect(res.body.blocked).toEqual([{ email: 'liste@ex.test', reason: 'DO_NOT_CONTACT', via: 'SUPPRESSION_LIST' }])
  })

  it('sans adresse bloquée : envoi inchangé, blocked vide', async () => {
    const res = await send(['a@ex.test', 'b@ex.test']).expect(200)
    expect(sendBulkEmail.mock.calls[0]![0].recipients.map((r) => r.email)).toEqual(['a@ex.test', 'b@ex.test'])
    expect(res.body.blocked).toEqual([])
    expect(await LeadActivity.countDocuments({ type: 'EMAIL_BLOCKED' })).toBe(0)
  })

  it('un lead opposé à une autre adresse ne bloque pas un destinataire différent', async () => {
    await Lead.create({ company: 'Opposé', contactEmail: 'oppose@ex.test', doNotContact: true, createdBy: team.admin.id })
    await Lead.create({ company: 'Non opposé', contactEmail: 'ok@ex.test', doNotContact: false, createdBy: team.admin.id })
    const res = await send(['ok@ex.test']).expect(200)
    expect(res.body.blocked).toEqual([])
    expect(res.body.sent).toBe(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 4. Seuil unique : job et planificateur lisent proposalReminderDays
// ───────────────────────────────────────────────────────────────────────────

describe('relance de proposition / seuil partagé', () => {
  const now = new Date()
  const ctx = () => ({ now, dateKey: 'x', meta: {}, settings: { config: {} } }) as never

  async function proposalSince(days: number) {
    const lead = await Lead.create({ company: `P${days}`, status: 'PROPOSAL', assignedTo: team.commercialA.id, createdBy: team.commercialA.id })
    await Lead.collection.updateOne({ _id: lead._id }, { $set: { statusChangedAt: new Date(now.getTime() - days * DAY) } })
    return String(lead._id)
  }

  it('le job crm.proposal_followup suit proposalReminderDays (7 j par défaut, plus 5 j figés)', async () => {
    await proposalSince(6)
    const eight = await proposalSince(8)
    const job = registered['crm.proposal_followup']!
    const byDefault = await job.execute(ctx())
    expect(byDefault.actionsExecuted).toEqual([`proposal_followup:lead:${eight}`])
    expect(byDefault.details).toMatchObject({ leadsFound: 1, thresholdDays: 7 })

    await CrmSettings.updateOne({}, { $set: { proposalReminderDays: 5 } })
    const at5 = await job.execute(ctx())
    expect(at5.details).toMatchObject({ leadsFound: 2, thresholdDays: 5 })
  })

  it('le planificateur applique le même seuil que le job', async () => {
    const { processProposalReminders } = await import('../lib/crmScheduler.js')
    await proposalSince(6)
    await CrmSettings.updateOne({}, { $set: { proposalReminderEnabled: true, proposalReminderDays: 7 } })
    expect(await processProposalReminders()).toMatchObject({ processed: 0 })
    await CrmSettings.updateOne({}, { $set: { proposalReminderDays: 5 } })
    expect(await processProposalReminders()).toMatchObject({ processed: 1, sent: 1 })
    expect(mail.sendProposalReminderEmail).toHaveBeenCalledTimes(1)
  })
})


describe('envoi groupé libre — rôles autorisés', () => {
  it('refuse un VIEWER (403) et laisse passer un ADMIN', async () => {
    as(team.viewer)
    const denied = await request(app).post('/api/admin/email-composer/send').send({ subject: 'Test', body: 'Bonjour', recipients: ['x@example.test'] })
    expect(denied.status).toBe(403)
    as(team.admin)
    const allowed = await request(app).post('/api/admin/email-composer/send').send({ subject: 'Test', body: 'Bonjour', recipients: ['x@example.test'] })
    expect(allowed.status).not.toBe(403)
  })
})
