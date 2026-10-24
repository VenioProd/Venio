import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import { clearDb, setupMongoReplSet, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import { resetTransactionSupportCache } from '../lib/transaction.js'
import accountingRoutes from '../routes/admin/accounting/index.js'
import billingRoutes from '../routes/admin/billing.js'
import BillingDocument from '../models/BillingDocument.js'
import ProjectFinance from '../models/ProjectFinance.js'
import Project from '../models/Project.js'
import User from '../models/User.js'
import Sequence from '../models/Sequence.js'
import Journal from '../models/Journal.js'
import ChartOfAccount from '../models/ChartOfAccount.js'
import AccountingEntry from '../models/AccountingEntry.js'
import AccountingLine from '../models/AccountingLine.js'
import FiscalYear from '../models/FiscalYear.js'
import AuditLog from '../models/AuditLog.js'
import { createCreditNote } from '../lib/projectFinance/creditNotes.js'
import {
  generateInstallmentInvoices,
  generateSubscriptionInvoices,
  invoiceAmountsCents,
} from '../lib/projectFinance/invoicing.js'
import { subscriptionPeriodStart, subscriptionPeriodEnd } from '../lib/projectFinance/rules.js'
import { generateDueSubscriptionInvoices } from '../lib/projectFinance/subscriptionScheduler.js'
import { createSaleEntryFromBilling } from '../lib/accounting/billingToEntry.js'
import { notifySuperAdmins } from '../lib/notifyHelpers.js'
import logger from '../lib/logger.js'
import { buildFacturXMinimum } from '../lib/facturx.js'
vi.mock('../lib/pdfBilling.js', () => ({ generateBillingPdf: vi.fn().mockResolvedValue('/unused.pdf') }))
vi.mock('../lib/email.js', () => ({ sendInvoiceEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/notifyHelpers.js', () => ({ notifySuperAdmins: vi.fn().mockResolvedValue(undefined) }))
const app = express()
app.use(express.json())
app.use('/accounting', accountingRoutes)
app.use('/billing', billingRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})
let userId: string
let clientId: string
let projectId: string
let cookie: string
const financeUrl = () => `/accounting/projects/${projectId}/finance`
const subUrl = () => `/accounting/projects/${projectId}/subscription`
const payer = () => ({
  kind: 'CLIENT',
  user: clientId,
  shareBp: 10000,
  isPrincipal: true,
  paymentMethod: 'VIREMENT' as const,
})
const credit = (invoiceId: unknown, amountHtCents?: number) =>
  createCreditNote({ invoiceId: String(invoiceId), amountHtCents, reason: 'Correction', userId })
const generate = (now: string) => generateSubscriptionInvoices({ projectId, now: new Date(now), userId })
const issue = (id: unknown) => request(app).post(`/billing/${id}/generate-pdf`).set('Cookie', cookie)
async function invoice() {
  return BillingDocument.create({
    type: 'INVOICE',
    number: 'FAC-ORIGINE',
    project: projectId,
    client: clientId,
    createdBy: userId,
    status: 'ISSUED',
    subtotal: 2333.09,
    taxTotal: 466.62,
    total: 2799.71,
    lines: [{ description: 'Prestation', quantity: 1, unitPrice: 2333.09, taxRate: 20, total: 2333.09 }],
  })
}
async function subscription(startDate = '2026-01-31', endDate: string | null = null) {
  return ProjectFinance.create({
    project: projectId,
    mode: 'ABONNEMENT',
    vatRateBp: 2000,
    payers: [payer()],
    subscription: { amountHtCents: 15000, period: 'MONTHLY', startDate, endDate },
  })
}
beforeAll(async () => {
  await setupMongoReplSet()
  resetTransactionSupportCache()
  await Promise.all([
    ProjectFinance.init(),
    BillingDocument.init(),
    Sequence.init(),
    AccountingEntry.init(),
    AccountingLine.init(),
    FiscalYear.init(),
    Journal.init(),
    ChartOfAccount.init(),
  ])
})
afterAll(teardownMongo)
beforeEach(async () => {
  vi.clearAllMocks()
  await clearDb()
  const [admin, client] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash: 'unused', role: 'SUPER_ADMIN' },
    { name: 'Client', email: 'client@example.test', passwordHash: 'unused', role: 'CLIENT' },
  ])
  userId = String(admin._id)
  clientId = String(client._id)
  cookie = `venio_session=${(await createSession(userId)).token}`
  projectId = String((await Project.create({ name: 'Maintenance', client: clientId }))._id)
  await Journal.create({ code: 'VE', label: 'Ventes', type: 'VENTE' })
  await ChartOfAccount.create([
    { code: '411000', label: 'Clients', accountClass: 4, type: 'ACTIF' },
    { code: '706000', label: 'Prestations', accountClass: 7, type: 'PRODUIT' },
    { code: '445710', label: 'TVA', accountClass: 4, type: 'ACTIF' },
  ])
})
it('crée un avoir total exact et une vente inversée équilibrée avec le même lettrage', async () => {
  const original = await invoice()
  const sale = await createSaleEntryFromBilling(original)
  const result = await request(app)
    .post(`/accounting/invoices/${original._id}/credit-notes`)
    .set('Cookie', cookie)
    .send({ reason: 'Correction' })
    .expect(201)
  const doc = (await BillingDocument.findById(result.body.document._id))!
  expect(invoiceAmountsCents(doc)).toEqual({ htCents: -233309, vatCents: -46662, ttcCents: -279971 })
  expect(doc.lines[0]!.unitPrice).toBe(-2333.09)
  doc.subtotal = -1
  await expect(doc.save()).rejects.toMatchObject({ status: 409 })
  const emitted = await issue(doc._id).expect(200)
  expect(emitted.body.accounting.warning).toBeUndefined()
  const lines = await AccountingLine.find({ entry: emitted.body.accounting.saleEntry._id }).sort({ sortIndex: 1 })
  expect(lines.map((line) => [line.accountCode, line.debit, line.credit])).toEqual([
    ['411000', 0, 2799.71],
    ['706000', 2333.09, 0],
    ['445710', 466.62, 0],
  ])
  expect(lines[0]!.lettrage).toBe(sale.lines[0]!.lettrage)
  expect(lines[0]!.auxiliaryRef).toEqual(sale.lines[0]!.auxiliaryRef)
  expect((await createSaleEntryFromBilling(String(doc._id))).alreadyExisted).toBe(true)
  expect(await AuditLog.countDocuments({ action: 'BILLING_CREDIT_NOTE_CREATE' })).toBe(1)
})
it('cumule la TVA des partiels et refuse le dépassement, brouillons compris', async () => {
  const original = await invoice()
  const docs = []
  for (const amount of [100000, 100000, 33309]) docs.push(await credit(original._id, amount))
  expect(docs.map((doc) => invoiceAmountsCents(doc).vatCents)).toEqual([-20000, -20000, -6662])
  expect(docs.reduce((sum, doc) => sum + invoiceAmountsCents(doc).ttcCents, 0)).toBe(-279971)
  await expect(credit(original._id, 1)).rejects.toMatchObject({ status: 409 })
  for (const doc of docs) await issue(doc._id).expect(200)
})
it('émet la TVA cumulative même quand elle diffère du recalcul au taux', async () => {
  const original = await invoice()
  const first = await credit(original._id, 2)
  const doc = await credit(original._id, 2)
  expect(invoiceAmountsCents(doc)).toEqual({ htCents: -2, vatCents: -1, ttcCents: -3 })
  const emitted = await issue(doc._id).expect(200)
  expect(emitted.body.accounting.saleEntry.totalDebit).toBe(0.03)
  expect(buildFacturXMinimum({ doc })).toContain('<ram:TaxTotalAmount currencyID="EUR">-0.01</ram:TaxTotalAmount>')
  doc.lines[0]!.total = -0.04
  await expect(
    createSaleEntryFromBilling({ ...doc.toObject(), _id: new mongoose.Types.ObjectId() } as typeof doc),
  ).rejects.toThrow()
  first.status = 'CANCELLED'
  await first.save()
  const remainder = await credit(original._id, 233307)
  expect(invoiceAmountsCents(remainder).vatCents).toBe(-46661)
})
it('sérialise deux avoirs simultanés qui dépasseraient ensemble la facture', async () => {
  const original = await invoice()
  const results = await Promise.allSettled([credit(original._id, 150000), credit(original._id, 150000)])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
  expect(await BillingDocument.countDocuments({ creditedInvoice: original._id })).toBe(1)
})
it('libère une échéance à l’émission de son avoir total', async () => {
  const finance = await ProjectFinance.create({
    project: projectId,
    mode: 'FORFAIT',
    contractHtCents: 233309,
    payers: [payer()],
    installments: [{ label: 'Solde', percentBp: 10000, trigger: { kind: 'DATE', dueDate: '2020-01-01' } }],
  })
  const args = { projectId, installmentId: String(finance.installments[0]!._id), userId }
  const original = (await generateInstallmentInvoices(args)).invoices[0]!
  await issue(original._id).expect(200)
  const doc = await credit(original._id)
  expect((await generateInstallmentInvoices(args)).alreadyExisted).toBe(true)
  await issue(doc._id).expect(200)
  expect((await BillingDocument.findById(original._id))!.financeKey).toBeNull()
  expect((await generateInstallmentInvoices(args)).alreadyExisted).toBe(false)
})
it('annule le statut et la vente d’un avoir si l’exercice est clôturé', async () => {
  const original = await invoice()
  const doc = await credit(original._id)
  const year = new Date().getUTCFullYear()
  await FiscalYear.create({
    code: `FY-${year}`,
    startDate: new Date(Date.UTC(year, 0, 1)),
    endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
    status: 'CLOTURE',
  })
  await issue(doc._id).expect(423)
  expect((await BillingDocument.findById(doc._id))!.status).toBe('DRAFT')
  expect(await AccountingEntry.countDocuments()).toBe(0)
  expect(await AccountingLine.countDocuments()).toBe(0)
})
it('refuse les origines interdites, les partiels multi-taux et un motif absent', async () => {
  const original = await invoice()
  await BillingDocument.updateOne({ _id: original._id }, { status: 'DRAFT' })
  await expect(credit(original._id)).rejects.toMatchObject({ status: 409 })
  await BillingDocument.updateOne({ _id: original._id }, { status: 'ISSUED' })
  const doc = await credit(original._id)
  await expect(credit(doc._id)).rejects.toMatchObject({ status: 409 })
  await BillingDocument.updateOne({ _id: doc._id }, { status: 'CANCELLED' })
  await BillingDocument.updateOne(
    { _id: original._id },
    {
      $push: {
        lines: {
          description: 'Autre taux',
          quantity: 1,
          unitPrice: 0,
          total: 0,
          taxRate: 10,
        },
      },
    },
  )
  await expect(credit(original._id, 1)).rejects.toMatchObject({ status: 400 })
  await request(app)
    .post(`/accounting/invoices/${original._id}/credit-notes`)
    .set('Cookie', cookie)
    .send({})
    .expect(400)
})
it('calcule les périodes à minuit UTC depuis leur ancrage, y compris bissextile', () => {
  const start = new Date('2025-01-31T15:00:00Z')
  expect([0, 1, 2].map((index) => subscriptionPeriodStart(start, 'MONTHLY', index).toISOString().slice(0, 10))).toEqual(
    ['2025-01-31', '2025-02-28', '2025-03-31'],
  )
  expect(subscriptionPeriodStart(new Date('2024-01-31'), 'MONTHLY', 1).toISOString().slice(0, 10)).toBe('2024-02-29')
  expect(subscriptionPeriodStart(start, 'QUARTERLY', 1).toISOString().slice(0, 10)).toBe('2025-04-30')
  expect(subscriptionPeriodStart(new Date('2024-02-29'), 'YEARLY', 1).toISOString().slice(0, 10)).toBe('2025-02-28')
  expect(subscriptionPeriodEnd(start, 'MONTHLY', 1).toISOString()).toBe('2025-03-30T00:00:00.000Z')
})
it('rattrape douze périodes par appel, respecte la fin et rejoue sans doublon', async () => {
  await subscription('2024-01-31', '2025-02-28')
  expect((await generate('2026-01-01')).invoices).toHaveLength(12)
  expect((await generate('2026-01-01')).invoices).toHaveLength(2)
  expect((await generate('2026-01-01')).invoices).toHaveLength(0)
  expect(await BillingDocument.countDocuments()).toBe(14)
})
it('génère une seule série de factures pour deux appels simultanés', async () => {
  await subscription('2026-01-31', '2026-03-31')
  await Promise.all([generate('2026-04-01'), generate('2026-04-01')])
  expect(await BillingDocument.countDocuments()).toBe(3)
  expect((await Sequence.findOne({ name: 'invoiceNumber' }))!.value).toBe(3)
})
it('conserve les périodes annulées et régénère sur demande explicite valide', async () => {
  await subscription('2026-01-31', '2026-03-31')
  const doc = (await generate('2026-01-31')).invoices[0]!
  doc.status = 'CANCELLED'
  await doc.save()
  expect((await generate('2026-01-31')).invoices).toHaveLength(0)
  const url = `${subUrl()}/periods/2026-01-31/invoices`
  await request(app).post(`${subUrl()}/periods/2026-02-01/invoices`).set('Cookie', cookie).expect(400)
  await request(app).post(url).set('Cookie', cookie).expect(201)
  await request(app).post(url).set('Cookie', cookie).expect(409)
  await request(app).post(`${subUrl()}/periods/2099-01-31/invoices`).set('Cookie', cookie).expect(400)
  const state = (await request(app).get(financeUrl()).set('Cookie', cookie).expect(200)).body.subscriptionState
  expect(state.periods).toHaveLength(1)
  expect(state.periods[0].invoices.map((item: { status: string }) => item.status).sort()).toEqual([
    'CANCELLED',
    'DRAFT',
  ])
  expect(state.nextPeriodStart).toBe('2026-02-28T00:00:00.000Z')
})
it('répartit exactement le HT de chaque période entre deux payeurs', async () => {
  const finance = await subscription('2026-01-31', '2026-02-28')
  finance.payers[0]!.shareBp = 3333
  finance.payers.push({
    ...payer(),
    kind: 'THIRD_PARTY',
    user: null,
    shareBp: 6667,
    isPrincipal: false,
    subsidiary: null,
    billingContact: { name: 'OPCO' },
  })
  await finance.save()
  const { invoices } = await generate('2026-03-01')
  expect(invoices).toHaveLength(4)
  for (const start of ['2026-01-31', '2026-02-28']) {
    expect(
      invoices
        .filter((doc) => doc.financeLink!.periodStart!.toISOString().startsWith(start))
        .reduce((sum, doc) => sum + invoiceAmountsCents(doc).htCents, 0),
    ).toBe(15000)
  }
})
it('fige le calendrier généré et applique les nouveaux montants aux périodes suivantes', async () => {
  const finance = await subscription('2026-01-31T18:00:00Z')
  expect(finance.subscription!.startDate).toEqual(new Date('2026-01-31'))
  const first = (await generate('2026-01-31')).invoices[0]!
  first.status = 'CANCELLED'
  await first.save()
  const body = finance.toObject()
  for (const change of [{ period: 'QUARTERLY' }, { startDate: '2026-01-30' }, { endDate: '2026-01-30' }]) {
    await request(app)
      .put(financeUrl())
      .set('Cookie', cookie)
      .send({ ...body, subscription: { ...body.subscription, ...change } })
      .expect(409)
  }
  await request(app)
    .put(financeUrl())
    .set('Cookie', cookie)
    .send({ ...body, subscription: { ...body.subscription, amountHtCents: 20000 } })
    .expect(200)
  expect(invoiceAmountsCents((await generate('2026-02-28')).invoices[0]!).htCents).toBe(20000)
  expect(invoiceAmountsCents((await BillingDocument.findById(first._id))!).htCents).toBe(15000)
})
it('planifie sans administrateur puis isole les erreurs et notifie une fois après création', async () => {
  const loggedError = vi.spyOn(logger, 'error').mockImplementation(() => {})
  await subscription('2020-01-01', '2020-02-01')
  await User.updateOne({ _id: userId }, { role: 'ADMIN' })
  expect((await generateDueSubscriptionInvoices()).createdCount).toBe(0)
  await User.updateOne({ _id: userId }, { role: 'SUPER_ADMIN' })
  await ProjectFinance.create({
    project: new mongoose.Types.ObjectId(),
    mode: 'ABONNEMENT',
    payers: [payer()],
    subscription: { amountHtCents: 100, period: 'MONTHLY', startDate: '2020-01-01' },
  })
  const save = BillingDocument.prototype.save
  const failedSave = vi.spyOn(BillingDocument.prototype, 'save').mockImplementation(function (
    this: InstanceType<typeof BillingDocument>,
    ...args
  ) {
    if (this.financeLink?.periodStart?.toISOString().startsWith('2020-02')) {
      return Promise.reject(new Error('Période indisponible'))
    }
    return save.apply(this, args)
  })
  try {
    expect((await generateDueSubscriptionInvoices()).createdCount).toBe(1)
    expect(notifySuperAdmins).toHaveBeenCalledTimes(1)
    expect(await BillingDocument.countDocuments({ createdBy: userId })).toBe(1)
  } finally {
    failedSave.mockRestore()
  }
  expect((await generateDueSubscriptionInvoices()).createdCount).toBe(1)
  expect(notifySuperAdmins).toHaveBeenCalledTimes(2)
  expect(loggedError).toHaveBeenCalledTimes(3)
  loggedError.mockRestore()
})
