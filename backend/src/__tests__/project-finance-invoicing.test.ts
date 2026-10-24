import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import { clearDb, setupMongoReplSet, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import { resetTransactionSupportCache } from '../lib/transaction.js'
import accountingRoutes from '../routes/admin/accounting/index.js'
import billingRoutes from '../routes/admin/billing.js'
import clientRoutes from '../routes/client/quotes.js'
import BillingDocument from '../models/BillingDocument.js'
import ProjectFinance from '../models/ProjectFinance.js'
import ProjectPhase from '../models/ProjectPhase.js'
import Project from '../models/Project.js'
import User from '../models/User.js'
import Sequence from '../models/Sequence.js'
import Journal from '../models/Journal.js'
import ChartOfAccount from '../models/ChartOfAccount.js'
import AccountingEntry from '../models/AccountingEntry.js'
import CompanySettings from '../models/CompanySettings.js'
import AuditLog from '../models/AuditLog.js'
import { createSaleEntryFromBilling } from '../lib/accounting/billingToEntry.js'
import { generateBillingPdf } from '../lib/pdfBilling.js'
import { sendInvoiceEmail } from '../lib/email.js'
import { createNotification } from '../lib/notifications.js'
import { buildFacturXMinimum } from '../lib/facturx.js'

vi.mock('../lib/pdfBilling.js', () => ({ generateBillingPdf: vi.fn().mockResolvedValue('/unused.pdf') }))
vi.mock('../lib/email.js', () => ({ sendInvoiceEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/notifications.js', () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/notifyHelpers.js', () => ({ notifySuperAdmins: vi.fn().mockResolvedValue(undefined) }))

const app = express()
app.use(express.json())
app.use('/accounting', accountingRoutes)
app.use('/billing', billingRoutes)
app.use('/client', clientRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})
let adminId: string
let clientId: string
let projectId: string
let cookie: string
let clientCookie: string
let finance: InstanceType<typeof ProjectFinance>
const financeUrl = () => `/accounting/projects/${projectId}/finance`
const invoicesUrl = () => `/accounting/projects/${projectId}/installments/${finance.installments[0]!._id}/invoices`
const generate = async () => {
  const { generateInstallmentInvoices } = await import('../lib/projectFinance/invoicing.js')
  return generateInstallmentInvoices({
    projectId,
    installmentId: String(finance.installments[0]!._id),
    userId: adminId,
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
    (await import('../models/AccountingLine.js')).default.init(),
    (await import('../models/FiscalYear.js')).default.init(),
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
  adminId = String(admin._id)
  clientId = String(client._id)
  cookie = `venio_session=${(await createSession(adminId)).token}`
  clientCookie = `venio_session=${(await createSession(clientId)).token}`
  projectId = String((await Project.create({ name: 'Projet Démo', client: clientId }))._id)
  finance = await ProjectFinance.create({
    project: projectId,
    mode: 'ECHEANCIER',
    contractHtCents: 999999,
    vatRateBp: 2000,
    installments: [3333, 3333, 3334].map((percentBp, index) => ({
      label: `Échéance ${index}`,
      percentBp,
      trigger: { kind: 'DATE', dueDate: '2020-01-01' },
    })),
    payers: [
      {
        kind: 'THIRD_PARTY',
        shareBp: 7000,
        billingContact: { name: 'OPCO', email: 'opco@example.test' },
        paymentMethod: 'VIREMENT',
      },
      { kind: 'CLIENT', user: clientId, shareBp: 3000, isPrincipal: true, paymentMethod: 'VIREMENT' },
    ],
  })
})

it('génère R1/R2 au centime et réutilise les factures sans consommer de numéro', async () => {
  const { invoiceAmountsCents } = await import('../lib/projectFinance/invoicing.js')
  const first = await request(app).post(invoicesUrl()).set('Cookie', cookie).expect(201)
  const docs = await BillingDocument.find({ project: projectId }).sort({ number: 1 })
  expect(docs.map(invoiceAmountsCents)).toEqual([
    { htCents: 233309, vatCents: 46662, ttcCents: 279971 },
    { htCents: 99990, vatCents: 19998, ttcCents: 119988 },
  ])
  expect(docs.every((doc) => doc.status === 'DRAFT' && doc.dueAt === null)).toBe(true)
  const second = await request(app).post(invoicesUrl()).set('Cookie', cookie).expect(200)
  expect(second.body.invoices.map((doc: { _id: string }) => doc._id)).toEqual(
    first.body.invoices.map((doc: { _id: string }) => doc._id),
  )
  expect((await Sequence.findOne({ name: 'invoiceNumber' }))!.value).toBe(2)
  expect(await BillingDocument.countDocuments()).toBe(2)
  expect(await AuditLog.countDocuments({ action: 'PROJECT_FINANCE_INVOICES_GENERATE' })).toBe(2)
  // Un document en centimes exacts n'a droit à aucun écart ; la tolérance est réservée aux montants fractionnaires.
  expect(() => invoiceAmountsCents({ subtotal: 1, taxTotal: 0.2, total: 1.21 })).toThrow()
  expect(invoiceAmountsCents({ subtotal: 1.004, taxTotal: 0.2008, total: 1.2048 })).toEqual({
    htCents: 100,
    vatCents: 20,
    ttcCents: 120,
  })
})

it('deux générations concurrentes créent exactement une facture par payeur', async () => {
  const results = await Promise.all(
    [generate(), generate()].map((operation) => operation.catch((error: { status?: number }) => error)),
  )
  expect(results.every((result) => 'invoices' in result || result.status === 409)).toBe(true)
  expect(await BillingDocument.countDocuments()).toBe(2)
  expect((await Sequence.findOne({ name: 'invoiceNumber' }))!.value).toBe(2)
})

it('annule les factures et la séquence si la seconde création échoue', async () => {
  const save = BillingDocument.prototype.save
  let count = 0
  const spy = vi.spyOn(BillingDocument.prototype, 'save').mockImplementation(function (
    this: InstanceType<typeof BillingDocument>,
    ...args
  ) {
    if (++count === 2) return Promise.reject(new Error('Seconde facture refusée'))
    return save.apply(this, args)
  })
  try {
    await expect(generate()).rejects.toThrow('Seconde facture refusée')
  } finally {
    spy.mockRestore()
  }
  expect(await BillingDocument.countDocuments()).toBe(0)
  expect(await Sequence.findOne({ name: 'invoiceNumber' })).toBeNull()
  await generate()
  expect((await BillingDocument.findOne().sort({ number: 1 }))!.number).toBe('FAC-0001')
})

it('refuse de modifier les lignes après émission même si le statut est remis en brouillon', async () => {
  const doc = await BillingDocument.create({
    type: 'INVOICE',
    number: 'FAC-1',
    project: projectId,
    client: clientId,
    createdBy: adminId,
    status: 'ISSUED',
  })
  const loaded = (await BillingDocument.findById(doc._id))!
  loaded.status = 'DRAFT'
  await expect(loaded.save()).rejects.toMatchObject({ status: 409 })
  loaded.lines = [{ description: 'Montant modifié', quantity: 1, unitPrice: 10, taxRate: 20, total: 10 }]
  await expect(loaded.save()).rejects.toMatchObject({ status: 409 })
  doc.total = 10
  await expect(doc.save()).rejects.toMatchObject({ status: 409 })
})

it('fige les montants du brouillon d’échéance au niveau du modèle', async () => {
  const { invoices } = await generate()
  invoices[0]!.subtotal += 1
  await expect(invoices[0]!.save()).rejects.toMatchObject({ status: 409 })
})

it('libère seulement la clé du brouillon annulé et permet sa régénération', async () => {
  const { invoices } = await generate()
  const cancelled = invoices[0]!
  cancelled.status = 'CANCELLED'
  await cancelled.save()
  expect(cancelled.financeKey).toBeNull()
  expect(cancelled.financeLink?.installmentId).toEqual(finance.installments[0]!._id)
  const regenerated = await generate()
  expect(regenerated.invoices).toHaveLength(2)
  expect(regenerated.invoices.some((doc) => String(doc._id) === String(cancelled._id))).toBe(false)
  expect(await BillingDocument.countDocuments({ financeKey: { $type: 'string' } })).toBe(2)
  expect(await BillingDocument.countDocuments()).toBe(3)
  await request(app).post(`/billing/${cancelled._id}/send`).set('Cookie', cookie).expect(409)
  await request(app).post(`/billing/${cancelled._id}/generate-pdf`).set('Cookie', cookie).expect(409)
})

it('refuse l’annulation d’une facture d’échéance déjà émise', async () => {
  await seedAccounting()
  const { invoices } = await generate()
  const doc = invoices[0]!
  await request(app).post(`/billing/${doc._id}/generate-pdf`).set('Cookie', cookie).expect(200)
  const loaded = (await BillingDocument.findById(doc._id))!
  loaded.status = 'CANCELLED'
  await expect(loaded.save()).rejects.toMatchObject({ status: 409 })
})

it('refuse une sauvegarde périmée quand l’annulation et l’émission se croisent', async () => {
  await seedAccounting()
  const { invoices } = await generate()
  const cancelFirst = invoices[0]!
  vi.mocked(generateBillingPdf).mockImplementationOnce(async () => {
    cancelFirst.status = 'CANCELLED'
    await cancelFirst.save()
    return '/unused.pdf'
  })
  await request(app).post(`/billing/${cancelFirst._id}/generate-pdf`).set('Cookie', cookie).expect(409)
  const cancelled = (await BillingDocument.findById(cancelFirst._id))!
  expect(cancelled.status).toBe('CANCELLED')
  expect(cancelled.financeKey).toBeNull()
  expect(await AccountingEntry.countDocuments()).toBe(0)
  const issueFirst = invoices[1]!
  const staleDraft = (await BillingDocument.findById(issueFirst._id))!
  await request(app).post(`/billing/${issueFirst._id}/generate-pdf`).set('Cookie', cookie).expect(200)
  staleDraft.status = 'CANCELLED'
  await expect(staleDraft.save()).rejects.toMatchObject({ status: 409 })
  expect((await BillingDocument.findById(issueFirst._id))!.financeKey).toBe(issueFirst.financeKey)
})

it('fige le contrat facturé et conserve les identifiants et instantanés lors du changement des payeurs', async () => {
  const { invoices } = await generate()
  const body = finance.toObject()
  await request(app)
    .put(financeUrl())
    .set('Cookie', cookie)
    .send({ ...body, contractHtCents: 1000000 })
    .expect(409)
  const originalContact = invoices[0]!.payer!.billingContact.name
  body.payers[0]!.billingContact.name = 'Autre OPCO'
  body.payers[0]!.shareBp = 6000
  body.payers[1]!.shareBp = 4000
  body.installments[1]!.label = 'Nouveau jalon'
  const result = await request(app).put(financeUrl()).set('Cookie', cookie).send(body).expect(200)
  expect(result.body.finance.installments.map((item: { _id: string }) => item._id)).toEqual(
    finance.installments.map((item) => String(item._id)),
  )
  expect(result.body.finance.payers[0]._id).toBe(String(finance.payers[0]!._id))
  expect((await BillingDocument.findById(invoices[0]!._id))!.payer!.billingContact.name).toBe(originalContact)
})

it('calcule les états et les montants de l’échéancier depuis ses déclencheurs et ses factures', async () => {
  const phase = await ProjectPhase.create({
    project: projectId,
    title: 'Livré',
    status: 'TERMINEE',
    createdBy: adminId,
  })
  finance.installments[1]!.trigger = { kind: 'MILESTONE', phase: phase._id as mongoose.Types.ObjectId, dueDate: null }
  finance.installments[2]!.trigger.dueDate = new Date('2099-01-01')
  await finance.save()
  const before = await request(app).get(financeUrl()).set('Cookie', cookie).expect(200)
  expect(before.body.schedule.map((item: { status: string }) => item.status)).toEqual([
    'A_FACTURER',
    'A_FACTURER',
    'PLANIFIEE',
  ])
  await generate()
  const after = await request(app).get(financeUrl()).set('Cookie', cookie).expect(200)
  expect(after.body.schedule[0]).toMatchObject({ htCents: 333299, status: 'FACTUREE' })
  expect(after.body.schedule[0].payers.map((payer: { ttcCents: number }) => payer.ttcCents)).toEqual([279971, 119988])
  expect(after.body.schedule[0].invoices).toHaveLength(2)
})

async function seedAccounting() {
  await Journal.create({ code: 'VE', label: 'Ventes', type: 'VENTE' })
  await ChartOfAccount.create([
    { code: '411000', label: 'Clients', accountClass: 4, type: 'ACTIF' },
    { code: '706000', label: 'Prestations', accountClass: 7, type: 'PRODUIT' },
    { code: '445710', label: 'TVA', accountClass: 4, type: 'ACTIF' },
  ])
}

it('émet au TTC exact avec un auxiliaire par payeur et une échéance à trente jours', async () => {
  await seedAccounting()
  const { invoices } = await generate()
  for (const doc of invoices) {
    const result = await request(app).post(`/billing/${doc._id}/generate-pdf`).set('Cookie', cookie).expect(200)
    expect(result.body.accounting.warning).toBeUndefined()
    expect(new Date(result.body.document.dueAt).getTime() - new Date(result.body.document.issuedAt).getTime()).toBe(
      30 * 86400000,
    )
    const { lines } = await createSaleEntryFromBilling(doc)
    expect(lines).toEqual([])
    const customer = await mongoose
      .model('AccountingLine')
      .findOne({ entry: result.body.accounting.saleEntry._id, accountCode: '411000' })
    expect(customer.debit).toBe(doc.total)
    expect(customer.auxiliaryRef.kind).toBe(doc.payer!.kind === 'CLIENT' ? 'CLIENT' : 'OTHER')
    expect(String(customer.auxiliaryRef.id)).toBe(doc.payer!.kind === 'CLIENT' ? clientId : 'null')
  }
  expect(vi.mocked(generateBillingPdf).mock.calls[0]![0].dueAt).toBeTruthy()
  await CompanySettings.create({ paymentTermsDays: 45 })
  const next = await import('../lib/projectFinance/invoicing.js')
  const { invoices: later } = await next.generateInstallmentInvoices({
    projectId,
    installmentId: String(finance.installments[1]!._id),
    userId: adminId,
  })
  const result = await request(app).post(`/billing/${later[0]!._id}/generate-pdf`).set('Cookie', cookie).expect(200)
  expect(new Date(result.body.document.dueAt).getTime() - new Date(result.body.document.issuedAt).getTime()).toBe(
    45 * 86400000,
  )
})

it('refuse une écriture de vente dont les lignes dépassent la tolérance de rapprochement', async () => {
  await seedAccounting()
  const { invoices } = await generate()
  const doc = invoices[0]!
  doc.lines[0]!.total += 0.02
  await expect(createSaleEntryFromBilling(doc)).rejects.toThrow()
  expect(await AccountingEntry.countDocuments()).toBe(0)
})

it('reporte le payeur et les centimes de la facture dans le PDF et Factur-X', async () => {
  finance.mode = 'FORFAIT'
  finance.contractHtCents = 35
  finance.vatRateBp = 1000
  finance.installments = [finance.installments[0]!]
  finance.installments[0]!.percentBp = 10000
  finance.payers = [finance.payers[0]!]
  finance.payers[0]!.shareBp = 10000
  finance.payers[0]!.isPrincipal = true
  await finance.save()
  const { invoices } = await generate()
  const doc = invoices[0]!
  const xml = buildFacturXMinimum({ doc, client: { name: 'Client' } })
  expect.soft(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">0.04</ram:TaxTotalAmount>')
  expect(xml).toContain('<ram:Name>OPCO</ram:Name>')
  const { generateBillingPdf: actualPdf } =
    await vi.importActual<typeof import('../lib/pdfBilling.js')>('../lib/pdfBilling.js')
  const PDFDocument = (await import('pdfkit')).default
  const fs = await import('fs/promises')
  const os = await import('os')
  const path = await import('path')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'venio-invoice-'))
  const text = vi.spyOn(PDFDocument.prototype, 'text')
  try {
    await actualPdf(doc, { name: 'Client' }, null, path.join(directory, 'invoice.pdf'), {
      settings: { legalName: 'Venio' },
    })
    const rendered = text.mock.calls.map((call) => call[0])
    expect(rendered).toContain('OPCO')
    expect(rendered).toContain(new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(0.39))
  } finally {
    text.mockRestore()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it('masque au client la facture tiers dans la liste et dans son PDF', async () => {
  await seedAccounting()
  const { invoices } = await generate()
  for (const doc of invoices) {
    await request(app).post(`/billing/${doc._id}/generate-pdf`).set('Cookie', cookie).expect(200)
  }
  const result = await request(app).get(`/client/${projectId}/billing`).set('Cookie', clientCookie).expect(200)
  expect(result.body.documents.map((doc: { _id: string }) => doc._id)).toEqual([String(invoices[1]!._id)])
  const fs = await import('fs')
  const exists = vi.spyOn(fs.default, 'existsSync').mockReturnValue(true)
  try {
    await request(app)
      .get(`/client/${projectId}/billing/${invoices[0]!._id}/pdf`)
      .set('Cookie', clientCookie)
      .expect(404)
    expect(exists).not.toHaveBeenCalled()
  } finally {
    exists.mockRestore()
  }
})

it('envoie au payeur sans notifier le client et refuse un tiers sans e-mail avant mutation', async () => {
  await seedAccounting()
  const { invoices } = await generate()
  const opco = invoices[0]!
  await request(app).post(`/billing/${opco._id}/generate-pdf`).set('Cookie', cookie).expect(200)
  await request(app).post(`/billing/${opco._id}/send`).set('Cookie', cookie).expect(200)
  expect(vi.mocked(sendInvoiceEmail).mock.calls[0]![0].to).toBe('opco@example.test')
  expect(createNotification).not.toHaveBeenCalled()
  const sent = (await BillingDocument.findById(opco._id))!
  sent.payer!.billingContact.email = ''
  await sent.save()
  const sentAt = sent.sentAt
  await request(app).post(`/billing/${opco._id}/send`).set('Cookie', cookie).expect(400)
  expect((await BillingDocument.findById(opco._id))!.sentAt).toEqual(sentAt)
})
