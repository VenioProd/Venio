import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { clearDb, setupMongoReplSet, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import { resetTransactionSupportCache } from '../lib/transaction.js'
import { recordPayment, recordRefund } from '../lib/projectFinance/payments.js'
import { commissionCents } from '../lib/externalSales.js'
import { canUseMobileApp } from '../lib/mobileAuth.js'
import { notifyUsers } from '../lib/notifyHelpers.js'
import commercialRoutes from '../routes/commercial/index.js'
import externalSalesRoutes from '../routes/admin/externalSales.js'
import crmRoutes from '../routes/admin/crm.js'
import quoteProposalRoutes from '../routes/admin/quoteProposals.js'
import adminsRoutes from '../routes/admin/admins.js'
import mobileSalesTargetRoutes from '../routes/mobile/salesTargets.js'
import mobileSyncRoutes from '../routes/mobile/sync.js'
import User from '../models/User.js'
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import Project from '../models/Project.js'
import BillingDocument from '../models/BillingDocument.js'
import ProjectPayment from '../models/ProjectPayment.js'
import SalesCommission from '../models/SalesCommission.js'
import ShareAllocation from '../models/ShareAllocation.js'
import ProjectFinance from '../models/ProjectFinance.js'
import ShareRuleVersion from '../models/ShareRuleVersion.js'
import Sequence from '../models/Sequence.js'
import Journal from '../models/Journal.js'
import ChartOfAccount from '../models/ChartOfAccount.js'
import AccountingEntry from '../models/AccountingEntry.js'
import AccountingLine from '../models/AccountingLine.js'
import FiscalYear from '../models/FiscalYear.js'
import CrmSettings from '../models/CrmSettings.js'
import QuoteProposal from '../models/QuoteProposal.js'
import AuditLog from '../models/AuditLog.js'

vi.mock('../lib/notifyHelpers.js', () => ({
  notifySuperAdmins: vi.fn().mockResolvedValue(undefined),
  notifyUsers: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/nextcloud.js', () => ({ createClientFolders: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/email.js', () => ({
  sendAdminCredentials: vi.fn().mockResolvedValue({ sent: true }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ sent: true }),
  sendLeadAssignmentEmail: vi.fn().mockResolvedValue({ sent: true }),
}))

const app = express()
app.use(express.json())
app.use('/api/commercial', commercialRoutes)
app.use('/api/admin/external-sales', externalSalesRoutes)
app.use('/api/admin/crm', crmRoutes)
app.use('/api/admin/quote-proposals', quoteProposalRoutes)
app.use('/api/admin/admins', adminsRoutes)
app.use('/api/mobile/sales-targets', mobileSalesTargetRoutes)
app.use('/api/mobile/sync', mobileSyncRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

type Account = { id: string; cookie: string }
let superAdmin: Account
let alex: Account
let repA: Account
let repB: Account

async function account(role: string, name: string): Promise<Account> {
  const user = await User.create({ name, email: `${name.toLowerCase()}@example.test`, passwordHash: 'unused', role })
  const id = String(user._id)
  return { id, cookie: `venio_session=${(await createSession(id)).token}` }
}

const as = (who: Account) => ({
  get: (url: string) => request(app).get(url).set('Cookie', who.cookie),
  post: (url: string, body: object = {}) => request(app).post(url).set('Cookie', who.cookie).send(body),
  patch: (url: string, body: object = {}) => request(app).patch(url).set('Cookie', who.cookie).send(body),
})

async function createLead(rep: Account, company: string): Promise<string> {
  const res = await as(rep).post('/api/commercial/leads', {
    company,
    contactEmail: `${company.toLowerCase().replace(/\W+/g, '-')}@prospect.test`,
  })
  expect(res.status).toBe(201)
  return String(res.body.lead._id)
}

/** Ce que fait l'équipe au closing : le lead est gagné, sa conversion crée ou retrouve le compte client. */
async function convert(leadId: string): Promise<string> {
  await Lead.updateOne({ _id: leadId }, { status: 'WON' })
  const res = await as(superAdmin).post(`/api/admin/crm/leads/${leadId}/convert-to-client`)
  expect([200, 201]).toContain(res.status)
  return String(res.body.client._id)
}

async function invoiceFor(clientId: string, name: string): Promise<string> {
  const project = await Project.create({ name: `Site ${name}`, client: clientId })
  const invoice = await BillingDocument.create({
    type: 'INVOICE',
    number: `FAC-${name}`,
    project: project._id,
    client: clientId,
    createdBy: superAdmin.id,
    status: 'SENT',
    sentAt: new Date('2026-01-01'),
    subtotal: 1000,
    taxTotal: 200,
    total: 1200,
    lines: [{ description: 'Site vitrine', quantity: 1, unitPrice: 1000, taxRate: 20, total: 1000 }],
  })
  return String(invoice._id)
}

async function signClient(leadId: string, name: string) {
  const clientId = await convert(leadId)
  return { clientId, invoiceId: await invoiceFor(clientId, name) }
}

const pay = (invoiceId: string, amountTtcCents: number, idempotencyKey: string = crypto.randomUUID()) =>
  recordPayment({
    invoiceId,
    amountTtcCents,
    method: 'VIREMENT',
    receivedAt: new Date('2026-01-10'),
    reference: 'Banque',
    idempotencyKey,
    userId: superAdmin.id,
  })

const refund = (paymentId: unknown, amountTtcCents: number) =>
  recordRefund({
    paymentId: String(paymentId),
    amountTtcCents,
    receivedAt: new Date('2026-01-20'),
    reason: 'Geste commercial',
    idempotencyKey: crypto.randomUUID(),
    userId: superAdmin.id,
  })

beforeAll(async () => {
  await setupMongoReplSet()
  resetTransactionSupportCache()
  await Promise.all(
    [
      ProjectPayment,
      SalesCommission,
      ShareAllocation,
      ProjectFinance,
      ShareRuleVersion,
      BillingDocument,
      Sequence,
      AccountingEntry,
      AccountingLine,
      FiscalYear,
      Journal,
      ChartOfAccount,
    ].map((model) => model.init()),
  )
})
afterAll(teardownMongo)
beforeEach(async () => {
  vi.clearAllMocks()
  await clearDb()
  superAdmin = await account('SUPER_ADMIN', 'Raphael')
  alex = await account('ADMIN', 'Alex')
  repA = await account('COMMERCIAL_EXTERNE', 'Anna')
  repB = await account('COMMERCIAL_EXTERNE', 'Bruno')
  await Journal.create([
    { code: 'BQ', label: 'Banque', type: 'BANQUE' },
    { code: 'VE', label: 'Ventes', type: 'VENTE' },
  ])
  await ChartOfAccount.create([
    { code: '411000', label: 'Clients', accountClass: 4, type: 'ACTIF' },
    { code: '512000', label: 'Banque', accountClass: 5, type: 'ACTIF' },
    { code: '706000', label: 'Prestations', accountClass: 7, type: 'PRODUIT' },
    { code: '445710', label: 'TVA', accountClass: 4, type: 'ACTIF' },
  ])
})

describe('cloisonnement entre commerciaux externes', () => {
  it('A ne voit jamais les leads, clients ni commissions de B, sur aucune route', async () => {
    const leadA = await createLead(repA, 'Atelier Alpha')
    const leadB = await createLead(repB, 'Boulangerie Beta')
    const { invoiceId } = await signClient(leadB, 'beta')
    await pay(invoiceId, 120000)

    const list = await as(repA).get('/api/commercial/leads')
    expect(list.body.leads.map((lead: { _id: string }) => lead._id)).toEqual([leadA])
    expect((await as(repA).get('/api/commercial/leads?search=Beta')).body.leads).toEqual([])
    expect((await as(repA).get('/api/commercial/leads/export')).text).not.toContain('Beta')

    expect((await as(repA).get(`/api/commercial/leads/${leadB}`)).status).toBe(404)
    expect((await as(repA).patch(`/api/commercial/leads/${leadB}`, { notes: 'x' })).status).toBe(404)
    expect((await as(repA).post(`/api/commercial/leads/${leadB}/interactions`, { kind: 'CALL' })).status).toBe(404)
    expect((await as(repA).post(`/api/commercial/leads/${leadB}/ready-to-close`)).status).toBe(404)
    expect((await as(repA).get('/api/commercial/leads/pas-un-id')).status).toBe(404)

    expect((await as(repA).get('/api/commercial/clients')).body.clients).toEqual([])
    expect((await as(repB).get('/api/commercial/clients')).body.clients).toHaveLength(1)
    const commissionsA = await as(repA).get('/api/commercial/commissions')
    expect(commissionsA.body.commissions).toEqual([])
    expect(commissionsA.body.totals).toEqual({ collectedHtCents: 0, dueCents: 0, paidCents: 0 })
    expect((await as(repB).get('/api/commercial/commissions')).body.totals.dueCents).toBe(10000)
  })

  it('ne lui ouvre aucune route hors de son espace, même une route sans garde de rôle', async () => {
    await createLead(repB, 'Boulangerie Beta')
    for (const url of [
      '/api/admin/crm/leads',
      '/api/admin/quote-proposals',
      '/api/admin/external-sales/reps',
      '/api/admin/admins',
      '/api/mobile/sales-targets',
    ]) {
      expect((await as(repA).get(url)).status, url).toBe(403)
    }
    expect(canUseMobileApp('COMMERCIAL_EXTERNE')).toBe(false)
    expect((await as(alex).get('/api/commercial/leads')).status).toBe(403)
  })

  it("n'accepte pas qu'un externe s'attribue ou close un lead", async () => {
    const res = await as(repA).post('/api/commercial/leads', { company: 'Gamma', status: 'WON', assignedTo: alex.id })
    expect(res.status).toBe(400)
    const created = await as(repA).post('/api/commercial/leads', {
      company: 'Gamma',
      assignedTo: alex.id,
      externalRep: repB.id,
    })
    const lead = await Lead.findById(created.body.lead._id)
    expect(String(lead!.externalRep)).toBe(repA.id)
    expect(String(lead!.assignedTo)).toBe(repA.id)
  })
})

describe('passage de main au closer', () => {
  it('transmet au closer par défaut, une seule fois, et laisse la lecture à l’externe', async () => {
    await CrmSettings.updateSettings({ defaultCloserId: alex.id } as never)
    const leadId = await createLead(repA, 'Atelier Alpha')
    await as(repA).patch(`/api/commercial/leads/${leadId}`, { notes: 'Décideur : la gérante' })

    const res = await as(repA).post(`/api/commercial/leads/${leadId}/ready-to-close`, { message: 'Budget validé' })
    expect(res.status).toBe(200)
    expect(res.body.lead.handedOffAt).toBeTruthy()
    const lead = await Lead.findById(leadId)
    expect(String(lead!.assignedTo)).toBe(alex.id)
    expect(String(lead!.externalRep)).toBe(repA.id)
    expect(vi.mocked(notifyUsers).mock.calls[0]![0].map(String)).toEqual([alex.id])
    expect(vi.mocked(notifyUsers).mock.calls[0]![1]).toMatchObject({ type: 'CRM_LEAD_READY_TO_CLOSE' })
    expect(await LeadActivity.countDocuments({ leadId, type: 'READY_TO_CLOSE', actorId: repA.id })).toBe(1)

    await as(repA)
      .patch(`/api/commercial/leads/${leadId}`, {})
      .then((res) => expect(res.status).toBe(409))
    await Lead.updateOne({ _id: leadId }, { notes: 'Remise de 15 % accordée' })
    expect((await as(repA).get(`/api/commercial/leads/${leadId}`)).body.lead.notes).toBe('Décideur : la gérante')
    expect((await as(repA).post(`/api/commercial/leads/${leadId}/ready-to-close`)).status).toBe(409)
    expect((await as(repA).get(`/api/commercial/leads/${leadId}`)).status).toBe(200)
    expect((await as(repA).patch(`/api/commercial/leads/${leadId}`, { notes: 'x' })).status).toBe(409)
    expect((await as(alex).get(`/api/admin/crm/leads/${leadId}`)).status).toBe(200)
  })

  it('se replie sur les super-admins sans closer actif', async () => {
    await CrmSettings.updateSettings({ defaultCloserId: alex.id } as never)
    await User.updateOne({ _id: alex.id }, { isActive: false })
    const leadId = await createLead(repA, 'Atelier Alpha')

    expect((await as(repA).post(`/api/commercial/leads/${leadId}/ready-to-close`)).status).toBe(200)
    expect((await Lead.findById(leadId))!.assignedTo).toBeNull()
    expect(vi.mocked(notifyUsers).mock.calls[0]![0].map(String)).toEqual([superAdmin.id])
  })

  it('refuse un closer qui n’est pas membre actif de l’équipe', async () => {
    expect((await as(superAdmin).patch('/api/admin/crm/settings', { defaultCloserId: repA.id })).status).toBe(400)
    const res = await as(superAdmin).patch('/api/admin/crm/settings', { defaultCloserId: alex.id })
    expect(res.status).toBe(200)
    expect(String(res.body.settings.defaultCloserId)).toBe(alex.id)
  })
})

describe('commissions sur l’encaissé', () => {
  it('verse 10 % du HT encaissé, une seule fois par mouvement, et annule au remboursement', async () => {
    const leadId = await createLead(repA, 'Atelier Alpha')
    const { invoiceId } = await signClient(leadId, 'alpha')

    const first = await pay(invoiceId, 60000, 'stripe-evt-1')
    expect(first.payment.htCents).toBe(50000)
    const replay = await pay(invoiceId, 60000, 'stripe-evt-1')
    expect(replay.alreadyExisted).toBe(true)
    await pay(invoiceId, 60000)

    let lines = await SalesCommission.find({ rep: repA.id }).sort({ createdAt: 1 })
    expect(lines.map((line) => [line.kind, line.baseHtCents, line.amountCents])).toEqual([
      ['PAYMENT', 50000, 5000],
      ['PAYMENT', 50000, 5000],
    ])

    await refund(first.payment._id, 12000)
    await refund(first.payment._id, 48000)
    lines = await SalesCommission.find({ rep: repA.id, kind: 'REFUND' })
    expect(lines.map((line) => line.amountCents)).toEqual([-1000, -4000])
    const totals = (await as(repA).get('/api/commercial/commissions')).body.totals
    expect(totals).toEqual({ collectedHtCents: 50000, dueCents: 5000, paidCents: 0 })
  })

  it('arrondit au centime et ramène un remboursement intégral à zéro', async () => {
    expect(commissionCents(33333)).toBe(3333)
    expect(commissionCents(33335)).toBe(3334)
    expect(commissionCents(-5)).toBe(0)
  })

  it('ne crédite pas un doublon d’externe rattaché au client créé par un lead d’équipe', async () => {
    const teamLead = await Lead.create({
      company: 'Boulangerie Beta',
      contactEmail: 'contact@beta.test',
      assignedTo: alex.id,
      createdBy: alex.id,
    })
    const clientId = await convert(String(teamLead._id))
    const duplicate = await as(repA).post('/api/commercial/leads', {
      company: 'Boulangerie Beta',
      contactEmail: 'contact@beta.test',
    })
    // La conversion du doublon retrouve le compte par son email et le lui rattache.
    expect(await convert(String(duplicate.body.lead._id))).toBe(clientId)
    expect(String((await Lead.findById(duplicate.body.lead._id))!.clientAccountId)).toBe(clientId)

    await pay(await invoiceFor(clientId, 'beta'), 120000)
    expect(await SalesCommission.countDocuments()).toBe(0)
    expect((await as(repA).get('/api/commercial/clients')).body.clients).toEqual([])
  })
})

describe('pilotage par l’équipe', () => {
  it('donne le tableau par commercial et marque les commissions versées', async () => {
    const leadId = await createLead(repA, 'Atelier Alpha')
    await createLead(repA, 'Atelier Bis')
    const { invoiceId } = await signClient(leadId, 'alpha')
    await pay(invoiceId, 120000)

    expect((await as(alex).get('/api/admin/external-sales/reps')).status).toBe(403)
    const board = await as(superAdmin).get('/api/admin/external-sales/reps')
    const anna = board.body.reps.find((rep: { _id: string }) => rep._id === repA.id)
    expect(anna).toMatchObject({ leads: 2, won: 1, conversionRate: 0.5, collectedHtCents: 100000, dueCents: 10000 })

    const paid = await as(superAdmin).post('/api/admin/external-sales/commissions/mark-paid', { rep: repA.id })
    expect(paid.body).toEqual({ paid: 1 })
    expect(
      (await as(superAdmin).post('/api/admin/external-sales/commissions/mark-paid', { rep: repA.id })).body,
    ).toEqual({ paid: 0 })
    expect((await as(repA).get('/api/commercial/commissions')).body.totals).toMatchObject({
      dueCents: 0,
      paidCents: 10000,
    })

    const journal = await as(superAdmin).get(`/api/admin/external-sales/reps/${repA.id}/activity`)
    expect(journal.body.activities.map((activity: { type: string }) => activity.type)).toContain('CREATED')
  })

  it('réattribue en masse au départ d’un commercial, sans déplacer les commissions acquises', async () => {
    const leadId = await createLead(repA, 'Atelier Alpha')
    const otherId = await createLead(repA, 'Atelier Bis')
    const { invoiceId } = await signClient(leadId, 'alpha')
    await pay(invoiceId, 60000)

    const res = await as(superAdmin).post('/api/admin/external-sales/reassign', { fromRep: repA.id, toRep: repB.id })
    expect(res.body).toEqual({ moved: 2 })
    expect((await as(repA).get(`/api/commercial/leads/${otherId}`)).status).toBe(404)
    expect((await as(repB).get(`/api/commercial/leads/${otherId}`)).status).toBe(200)
    expect(String((await Lead.findById(otherId))!.assignedTo)).toBe(repB.id)
    expect(await LeadActivity.countDocuments({ type: 'EXTERNAL_REP_CHANGED' })).toBe(2)
    const audit = await AuditLog.findOne({ action: 'EXTERNAL_SALES_REASSIGN' }).lean()
    expect((audit!.metadata as { movedLeadIds: string[] }).movedLeadIds.sort()).toEqual([leadId, otherId].sort())
    const journal = await as(superAdmin).get(`/api/admin/external-sales/reps/${repA.id}/activity`)
    expect(
      journal.body.activities.filter((activity: { type: string }) => activity.type === 'EXTERNAL_REP_CHANGED'),
    ).toHaveLength(2)

    await pay(invoiceId, 60000)
    const lines = await SalesCommission.find().sort({ createdAt: 1 })
    expect(lines.map((line) => String(line.rep))).toEqual([repA.id, repB.id])
  })

  it('borne la réattribution en masse', async () => {
    await Lead.insertMany(
      Array.from({ length: 1001 }, (_, index) => ({ company: `Lead ${index}`, externalRep: repA.id })),
    )
    const res = await as(superAdmin).post('/api/admin/external-sales/reassign', { fromRep: repA.id, toRep: repB.id })
    expect(res.status).toBe(400)
    expect(await Lead.countDocuments({ externalRep: repB.id })).toBe(0)
  })

  it('réattribue une fiche à l’unité ou la rend à l’équipe', async () => {
    const leadId = await createLead(repA, 'Atelier Alpha')
    expect(
      (await as(superAdmin).post('/api/admin/external-sales/reassign', { leadIds: [leadId], toRep: alex.id })).status,
    ).toBe(400)
    const res = await as(superAdmin).post('/api/admin/external-sales/reassign', { leadIds: [leadId], toRep: null })
    expect(res.body).toEqual({ moved: 1 })
    expect((await Lead.findById(leadId))!.externalRep).toBeNull()
    expect((await as(repA).get(`/api/commercial/leads/${leadId}`)).status).toBe(404)
  })

  it('crée un compte commercial externe depuis l’équipe, sans le mêler à la liste interne', async () => {
    const res = await as(superAdmin).post('/api/admin/admins', {
      email: 'carla@example.test',
      password: 'secret123',
      name: 'Carla',
      role: 'COMMERCIAL_EXTERNE',
    })
    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe('COMMERCIAL_EXTERNE')
    const team = await as(superAdmin).get('/api/admin/admins')
    expect(team.body.users.map((user: { email: string }) => user.email)).not.toContain('carla@example.test')
    expect((await as(superAdmin).get(`/api/admin/admins/${res.body.user._id}`)).status).toBe(200)
  })
})

describe('devis rattachés à un lead seul', () => {
  it('suivent le périmètre CRM du lead, en liste, en détail et dans la synchro mobile', async () => {
    const commercial = await account('ADMIN', 'Chloe')
    const foreign = await Lead.create({ company: 'Hors périmètre', assignedTo: alex.id, createdBy: alex.id })
    const own = await Lead.create({ company: 'Le sien', assignedTo: commercial.id, createdBy: commercial.id })
    const [foreignQuote, ownQuote] = await QuoteProposal.create([
      { leadId: foreign._id, title: 'Devis caché', createdBy: alex.id },
      { leadId: own._id, title: 'Devis visible', createdBy: commercial.id },
    ])

    expect((await as(commercial).get(`/api/admin/quote-proposals/${foreignQuote!._id}`)).status).toBe(404)
    expect((await as(commercial).post(`/api/admin/quote-proposals/${foreignQuote!._id}/cancel`)).status).toBe(404)
    expect((await as(commercial).get(`/api/admin/quote-proposals/${ownQuote!._id}`)).status).toBe(200)
    // La synchro ne sert que ce qui a plus de deux secondes.
    await QuoteProposal.collection.updateMany({}, { $set: { updatedAt: new Date(Date.now() - 60_000) } })
    const synced = await as(commercial).get('/api/mobile/sync/quotes')
    expect(synced.status).toBe(200)
    expect(synced.body.items.map((proposal: { title: string }) => proposal.title)).toEqual(['Devis visible'])
    const list = await as(commercial).get('/api/admin/quote-proposals')
    expect(list.body.proposals.map((proposal: { title: string }) => proposal.title)).toEqual(['Devis visible'])
    const all = await as(superAdmin).get('/api/admin/quote-proposals')
    expect(all.body.proposals).toHaveLength(2)
  })
})
