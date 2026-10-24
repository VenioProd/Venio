import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose, { type SaveOptions } from 'mongoose'
import { tmpdir } from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { readFile, writeFile, mkdir, rm, mkdtemp } from 'node:fs/promises'
import { clearDb, setupMongoReplSet, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import { resetTransactionSupportCache, runInTransaction } from '../lib/transaction.js'
import { createPaymentEntryFromBilling } from '../lib/accounting/paymentToEntry.js'
import { createSaleEntryFromBilling } from '../lib/accounting/billingToEntry.js'
import { createEntry } from '../lib/accounting/doubleEntry.js'
import { markInvoicePaid, recordPayment, recordRefund } from '../lib/projectFinance/payments.js'
import { createCreditNote } from '../lib/projectFinance/creditNotes.js'
import { beneficiaryStatement } from '../lib/projectFinance/rules.js'
import { toCents } from '../lib/projectFinance/money.js'
import { invoiceAmountsCents } from '../lib/projectFinance/invoicing.js'
import { billingVatBreakdown, computeBillingTotals } from '../lib/projectFinance/vatBreakdown.js'
import { buildFacturXMinimum } from '../lib/facturx.js'
import billingRoutes from '../routes/admin/billing.js'
import agentBillingRoutes from '../routes/agent/billing.js'
import quotesRoutes from '../routes/client/quotes.js'
import vaultRoutes from '../routes/client/vault.js'
import BillingDocument from '../models/BillingDocument.js'
import ProjectPayment from '../models/ProjectPayment.js'
import ShareAllocation from '../models/ShareAllocation.js'
import ShareRuleVersion from '../models/ShareRuleVersion.js'
import ProjectFinance from '../models/ProjectFinance.js'
import Project from '../models/Project.js'
import ProjectMember from '../models/ProjectMember.js'
import User from '../models/User.js'
import Sequence from '../models/Sequence.js'
import Journal from '../models/Journal.js'
import ChartOfAccount from '../models/ChartOfAccount.js'
import AccountingEntry from '../models/AccountingEntry.js'
import AccountingLine from '../models/AccountingLine.js'
import FiscalYear from '../models/FiscalYear.js'

vi.mock('../lib/pdfBilling.js', () => ({ generateBillingPdf: vi.fn().mockResolvedValue('/unused.pdf') }))
vi.mock('../lib/email.js', () => ({ sendInvoiceEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/notifications.js', () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/notifyHelpers.js', () => ({ notifySuperAdmins: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../routes/agent/_middleware/auth.js', () => ({
  requireScope: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))
const app = express()
app.use(express.json())
app.use('/billing', billingRoutes)
app.use('/agent', agentBillingRoutes)
app.use('/projects', quotesRoutes)
app.use('/vault', vaultRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})
let userId: string
let clientId: string
let projectId: string
let cookie: string
let clientCookie: string
let invoice: InstanceType<typeof BillingDocument>
const receivedAt = new Date('2026-01-10')
const pay = (amountTtcCents: number) =>
  recordPayment({
    invoiceId: String(invoice._id),
    amountTtcCents,
    method: 'VIREMENT',
    receivedAt,
    idempotencyKey: crypto.randomUUID(),
    userId,
  })
const refund = (paymentId: unknown, amountTtcCents: number) =>
  recordRefund({
    paymentId: String(paymentId),
    amountTtcCents,
    receivedAt,
    reason: 'Restitution',
    idempotencyKey: crypto.randomUUID(),
    userId,
  })
const reload = async () => (await BillingDocument.findById(invoice._id))!
const emit = (id: unknown = invoice._id) => request(app).post(`/billing/${id}/generate-pdf`).set('Cookie', cookie)
async function draft(kind: 'INSTALLMENT' | 'SUBSCRIPTION') {
  return BillingDocument.create({
    ...invoice.toObject(),
    _id: new mongoose.Types.ObjectId(),
    number: `FAC-${kind}`,
    status: 'DRAFT',
    financeLink: { kind },
  })
}
beforeAll(async () => {
  await setupMongoReplSet()
  resetTransactionSupportCache()
  await Promise.all(
    [
      BillingDocument,
      ProjectPayment,
      ShareAllocation,
      ShareRuleVersion,
      ProjectFinance,
      Project,
      ProjectMember,
      User,
      Sequence,
      Journal,
      ChartOfAccount,
      AccountingEntry,
      AccountingLine,
      FiscalYear,
    ].map((model) => model.init()),
  )
})
afterAll(teardownMongo)
beforeEach(async () => {
  vi.restoreAllMocks()
  await clearDb()
  const [admin, client] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash: 'unused', role: 'SUPER_ADMIN' },
    { name: 'Client', email: 'client@example.test', passwordHash: 'unused', role: 'CLIENT' },
  ])
  userId = String(admin._id)
  clientId = String(client._id)
  cookie = `venio_session=${(await createSession(userId)).token}`
  clientCookie = `venio_session=${(await createSession(clientId)).token}`
  projectId = String((await Project.create({ name: 'Projet', client: clientId }))._id)
  invoice = await BillingDocument.create({
    type: 'INVOICE',
    number: 'FAC-TEST',
    project: projectId,
    client: clientId,
    createdBy: userId,
    status: 'ISSUED',
    issuedAt: receivedAt,
    subtotal: 1,
    taxTotal: 0.2,
    total: 1.2,
    lines: [{ description: 'Prestation', quantity: 1, unitPrice: 1, taxRate: 20, total: 1 }],
  })
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

it('C1 refuse le paiement historique et ne génère pas une seconde écriture BQ', async () => {
  await pay(120)
  await expect(createPaymentEntryFromBilling(await reload())).rejects.toMatchObject({ status: 409 })
  const response = await request(app)
    .post(`/billing/${invoice._id}/generate-accounting`)
    .set('Cookie', cookie)
    .expect(200)
  expect(response.body.payment).toBeNull()
  expect(response.body.paymentError).toBeUndefined()
  expect(await AccountingEntry.countDocuments({ journalCode: 'BQ' })).toBe(1)
})

it('C2 refuse une vente de brouillon ou de document annulé', async () => {
  for (const status of ['DRAFT', 'CANCELLED']) {
    await BillingDocument.updateOne({ _id: invoice._id }, { status })
    await request(app).post(`/billing/${invoice._id}/generate-accounting`).set('Cookie', cookie).expect(409)
  }
  expect(await AccountingEntry.countDocuments()).toBe(0)
})

it('C3 respecte le retrait individuel de manage_accounting sur les deux routes', async () => {
  await User.updateOne({ _id: userId }, { role: 'ADMIN', deniedPermissions: ['manage_accounting'] })
  await request(app).patch(`/billing/${invoice._id}`).set('Cookie', cookie).send({ status: 'PAID' }).expect(403)
  await request(app).post(`/billing/${invoice._id}/generate-accounting`).set('Cookie', cookie).expect(403)
  await request(app).patch(`/billing/${invoice._id}`).set('Cookie', cookie).send({ note: 'Autorisé' }).expect(200)
  expect(await AccountingEntry.countDocuments()).toBe(0)
  expect(await ProjectPayment.countDocuments()).toBe(0)
})

it('C4 émet échéance, abonnement et avoir avec leur vente dans la même transaction', async () => {
  const credit = await createCreditNote({ invoiceId: String(invoice._id), reason: 'Annulation', userId })
  for (const doc of [await draft('INSTALLMENT'), await draft('SUBSCRIPTION'), credit]) {
    const save = BillingDocument.prototype.save
    let observed = false
    const spy = vi.spyOn(BillingDocument.prototype, 'save').mockImplementation(async function (
      this: InstanceType<typeof BillingDocument>,
      ...args
    ) {
      if (String(this._id) === String(doc._id) && this.status === 'ISSUED') {
        observed = true
        const session = this.$session() ?? (args[0] as SaveOptions | undefined)?.session
        expect(session?.inTransaction()).toBe(true)
        expect(
          await AccountingEntry.exists({ idempotencyKey: `billing:sale:${doc._id}` }).session(session!),
        ).not.toBeNull()
      }
      return save.apply(this, args)
    })
    try {
      await emit(doc._id).expect(200)
    } finally {
      spy.mockRestore()
    }
    expect(observed).toBe(true)
    expect((await BillingDocument.findById(doc._id))!.status).toBe('ISSUED')
  }
  const failed = await BillingDocument.create({
    ...invoice.toObject(),
    _id: new mongoose.Types.ObjectId(),
    number: 'FAC-ECHEC',
    status: 'DRAFT',
    financeLink: { kind: 'INSTALLMENT' },
  })
  const save = BillingDocument.prototype.save
  const failSave = vi.spyOn(BillingDocument.prototype, 'save').mockImplementation(async function (
    this: InstanceType<typeof BillingDocument>,
    ...args
  ) {
    if (String(this._id) === String(failed._id)) throw new Error('Sauvegarde refusée')
    return save.apply(this, args)
  })
  try {
    await emit(failed._id).expect(500)
  } finally {
    failSave.mockRestore()
  }
  expect((await BillingDocument.findById(failed._id))!.status).toBe('DRAFT')
  expect(await AccountingEntry.countDocuments({ idempotencyKey: `billing:sale:${failed._id}` })).toBe(0)
  await FiscalYear.updateMany({}, { status: 'CLOTURE' })
  await emit(failed._id).expect(423)
  expect((await BillingDocument.findById(failed._id))!.status).toBe('DRAFT')
  expect(await AccountingEntry.countDocuments({ idempotencyKey: `billing:sale:${failed._id}` })).toBe(0)
})

it('C4 protège les transitions génériques tout en permettant l’annulation du brouillon', async () => {
  const doc = await draft('INSTALLMENT')
  const message = 'Émettez ce document par la génération du PDF'
  for (const status of ['ISSUED', 'SENT']) {
    expect(
      (await request(app).patch(`/billing/${doc._id}`).set('Cookie', cookie).send({ status }).expect(409)).body.error,
    ).toBe(message)
  }
  for (const action of ['issue', 'mark-sent']) {
    const response = await request(app).post(`/agent/billing/${doc._id}/${action}`).expect(409)
    expect(response.body.error ?? response.body.message).toBe(message)
  }
  expect((await request(app).post(`/billing/${doc._id}/send`).set('Cookie', cookie).expect(409)).body.error).toBe(
    message,
  )
  doc.status = 'ISSUED'
  await expect(doc.save()).rejects.toMatchObject({ status: 409 })
  doc.status = 'CANCELLED'
  await doc.save()
})

it('C5 calcule les transitions depuis les mouvements et préserve le statut pendant l’envoi', async () => {
  for (const status of ['PARTIALLY_PAID', 'PAID'] as const) {
    const unpaid = await reload()
    unpaid.status = status
    await expect(unpaid.save()).rejects.toMatchObject({ status: 409 })
  }
  const first = await pay(60)
  let current = await reload()
  expect(current.status).toBe('PARTIALLY_PAID')
  current.status = 'SENT'
  await expect(current.save()).rejects.toMatchObject({ status: 409 })
  await request(app).post(`/billing/${invoice._id}/send`).set('Cookie', cookie).expect(200)
  expect((await reload()).status).toBe('PARTIALLY_PAID')
  await pay(60)
  await request(app).post(`/billing/${invoice._id}/send`).set('Cookie', cookie).expect(200)
  expect((await reload()).status).toBe('PAID')
  const second = (await ProjectPayment.findOne({
    invoice: invoice._id,
    _id: { $ne: first.payment._id },
    kind: 'PAYMENT',
  }))!
  await refund(first.payment._id, 60)
  await refund(second._id, 60)
  current = await reload()
  current.status = 'PARTIALLY_PAID'
  await expect(current.save()).rejects.toMatchObject({ status: 409 })
})

it('C5 fige le statut payé historique sans empêcher une note', async () => {
  await BillingDocument.updateOne({ _id: invoice._id }, { status: 'PAID' })
  const historical = await reload()
  historical.note = 'Archive'
  await historical.save()
  for (const status of ['ISSUED', 'SENT', 'CANCELLED'] as const) {
    historical.status = status
    await expect(historical.save()).rejects.toMatchObject({ status: 409 })
  }
})

it('C6 annule les parts nettes de chaque encaissement malgré l’arrondi du HT cumulé', async () => {
  await BillingDocument.updateOne(
    { _id: invoice._id },
    {
      subtotal: 0.03,
      taxTotal: 0.01,
      total: 0.04,
      lines: [{ description: 'Centimes', quantity: 1, unitPrice: 0.03, taxRate: 20, total: 0.03 }],
    },
  )
  const beneficiary = new mongoose.Types.ObjectId()
  await ProjectFinance.create({
    project: projectId,
    mode: 'FORFAIT',
    contractHtCents: 3,
    installments: [{ label: 'Solde', percentBp: 10000, trigger: { kind: 'DATE', dueDate: '2026-01-01' } }],
    vatRateBp: 2000,
    shareActivationDate: '2026-01-01',
    payers: [{ kind: 'CLIENT', user: clientId, shareBp: 10000, isPrincipal: true, paymentMethod: 'VIREMENT' }],
  })
  await ShareRuleVersion.create({
    project: projectId,
    version: 1,
    effectiveFrom: '2026-01-01',
    createdBy: userId,
    rules: [{ beneficiary, bp: 10000 }],
  })
  const e1 = await pay(2)
  const e2 = await pay(2)
  await refund(e1.payment._id, 2)
  await refund(e2.payment._id, 2)
  const rows = await ShareAllocation.find({ project: projectId })
  for (const id of [beneficiary, null])
    expect(
      rows.filter((row) => String(row.beneficiary) === String(id)).reduce((sum, row) => sum + row.amountCents, 0),
    ).toBe(0)
  for (const e of [e1, e2]) {
    const payments = await ProjectPayment.find({ $or: [{ _id: e.payment._id }, { refundOf: e.payment._id }] })
    expect(
      rows
        .filter((row) => payments.some((payment) => String(payment._id) === String(row.payment)) && row.beneficiary)
        .reduce((sum, row) => sum + row.amountCents, 0),
    ).toBe(0)
  }
  expect((await ProjectPayment.find({ invoice: invoice._id })).reduce((sum, payment) => sum + payment.htCents, 0)).toBe(
    0,
  )
})

it('C7 permet de marquer payée une seconde fois après remboursement total', async () => {
  const mark = async () => markInvoicePaid({ invoice: await reload(), method: 'VIREMENT', paidAt: receivedAt, userId })
  const first = (await mark())!
  await refund(first.payment._id, 120)
  const second = (await mark())!
  expect(String(second.payment._id)).not.toBe(String(first.payment._id))
  expect(await ProjectPayment.countDocuments({ kind: 'PAYMENT' })).toBe(2)
  expect((await reload()).status).toBe('PAID')
})

it('C8 applique le même cloisonnement aux listes, PDF, coffre et éléments à payer', async () => {
  const member = await User.create({
    name: 'Membre',
    email: 'member@example.test',
    passwordHash: 'unused',
    role: 'CLIENT',
  })
  await ProjectMember.create({ project: projectId, user: member._id, role: 'VIEWER', createdBy: userId })
  const memberCookie = `venio_session=${(await createSession(String(member._id))).token}`
  const other = new mongoose.Types.ObjectId()
  const file = `uploads/billing/${projectId}/visibility.pdf`
  await mkdir(`uploads/billing/${projectId}`, { recursive: true })
  await writeFile(file, '%PDF-1.4\n')
  try {
    const docs: InstanceType<typeof BillingDocument>[] = []
    for (const [index, payer] of [
      null,
      { kind: 'CLIENT', user: clientId },
      { kind: 'CLIENT', user: member._id },
      { kind: 'CLIENT', user: other },
      { kind: 'SUBSIDIARY', subsidiary: other },
      { kind: 'THIRD_PARTY' },
    ].entries()) {
      docs.push(
        await BillingDocument.create({
          ...invoice.toObject(),
          _id: new mongoose.Types.ObjectId(),
          number: `VIS-${index}`,
          pdfStoragePath: file,
          payer: payer ? { ...payer, payerId: new mongoose.Types.ObjectId() } : null,
        }),
      )
    }
    for (const [viewerCookie, indices] of [
      [clientCookie, [0, 1]],
      [memberCookie, [0, 1, 2]],
    ] as const) {
      const visible = indices.map((index) => String(docs[index]!._id)).sort()
      const list = await request(app).get(`/projects/${projectId}/billing`).set('Cookie', viewerCookie).expect(200)
      expect(
        list.body.documents
          .filter((doc: { number: string }) => doc.number.startsWith('VIS-'))
          .map((doc: { _id: string }) => doc._id)
          .sort(),
      ).toEqual(visible)
      const vault = await request(app).get('/vault/documents').set('Cookie', viewerCookie).expect(200)
      expect(vault.body.documents.map((doc: { id: string }) => doc.id).sort()).toEqual(visible)
      for (const [index, doc] of docs.entries())
        await request(app)
          .get(`/projects/${projectId}/billing/${doc._id}/pdf`)
          .set('Cookie', viewerCookie)
          .expect((indices as readonly number[]).includes(index) ? 200 : 404)
    }
    const actions = await request(app).get('/vault/action-items').set('Cookie', clientCookie).expect(200)
    expect(
      actions.body.items
        .filter((item: { title: string }) => item.title.includes('VIS-'))
        .map((item: { title: string }) => item.title)
        .sort(),
    ).toEqual(['Facture VIS-0 à régler', 'Facture VIS-1 à régler'])
  } finally {
    await rm(`uploads/billing/${projectId}`, { recursive: true, force: true })
  }
})

it('C9 conserve le document émis entre la lecture et la suppression agent', async () => {
  await BillingDocument.updateOne({ _id: invoice._id }, { status: 'DRAFT' })
  const remove = BillingDocument.deleteOne
  vi.spyOn(BillingDocument, 'deleteOne').mockImplementationOnce(function (...args) {
    return remove.apply(BillingDocument, args).pre(async () => {
      await BillingDocument.updateOne({ _id: invoice._id }, { status: 'ISSUED' })
    })
  })
  await request(app).delete(`/agent/billing/${invoice._id}`).expect(409)
  expect((await reload()).status).toBe('ISSUED')
})

it('C10 rapproche la TVA multi-taux dans la vente et Factur-X et émet l’avoir total', async () => {
  await BillingDocument.updateOne(
    { _id: invoice._id },
    {
      subtotal: 0.09,
      taxTotal: 0.01,
      total: 0.1,
      lines: [
        { description: 'A', quantity: 1, unitPrice: 0.03, total: 0.03, taxRate: 20 },
        { description: 'B', quantity: 1, unitPrice: 0.06, total: 0.06, taxRate: 10 },
      ],
    },
  )
  const doc = await reload()
  const sale = await createSaleEntryFromBilling(doc)
  expect(sale.lines.find((line) => line.accountCode === '411000')!.debit).toBe(0.1)
  expect(sale.lines.reduce((sum, line) => sum + toCents(line.credit), 0)).toBe(10)
  const xml = buildFacturXMinimum({ doc })
  expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">0.01</ram:TaxTotalAmount>')
  expect(xml).toContain('<ram:GrandTotalAmount>0.10</ram:GrandTotalAmount>')
  const { generateBillingPdf } = await vi.importActual<typeof import('../lib/pdfBilling.js')>('../lib/pdfBilling.js')
  const PDFDocument = (await import('pdfkit')).default
  const directory = await mkdtemp(path.join(tmpdir(), 'venio-vat-'))
  const text = vi.spyOn(PDFDocument.prototype, 'text')
  try {
    await generateBillingPdf(doc, null, null, path.join(directory, 'invoice.pdf'), { settings: { legalName: 'Venio' } })
    const rendered = text.mock.calls.map((call) => call[0])
    const format = (amount: number) =>
      new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount)
    expect(rendered).toContain(format(0.1))
    expect(rendered).not.toContain(format(0.11))
  } finally {
    text.mockRestore()
    await rm(directory, { recursive: true, force: true })
  }
  const credit = await createCreditNote({ invoiceId: String(doc._id), reason: 'Annulation', userId })
  await emit(credit._id).expect(200)
  const entry = (await AccountingEntry.findOne({ idempotencyKey: `billing:sale:${credit._id}` }))!
  expect((await AccountingLine.findOne({ entry: entry._id, accountCode: '411000' }))!.credit).toBe(0.1)
  await BillingDocument.updateOne({ _id: doc._id }, { subtotal: 1, taxTotal: 0.2, total: 1.2 })
  await expect(
    createSaleEntryFromBilling(
      new BillingDocument({ ...(await reload()).toObject(), _id: new mongoose.Types.ObjectId() }),
    ),
  ).rejects.toMatchObject({ status: 400 })
})

it('C11 rejoue une transaction dont l’exercice a été clôturé après sa lecture', async () => {
  const fiscal = await FiscalYear.create({
    code: 'FY-2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'OUVERT',
  })
  let closed = false
  await expect(
    runInTransaction(async (session) => {
      await FiscalYear.findById(fiscal._id).session(session)
      if (!closed) {
        await FiscalYear.updateOne({ _id: fiscal._id }, { status: 'CLOTURE' })
        closed = true
      }
      return createEntry({
        journal: 'BQ',
        date: receivedAt,
        lines: [
          { account: '512000', debit: 1 },
          { account: '411000', credit: 1 },
        ],
        session,
      })
    }),
  ).rejects.toMatchObject({ status: 423 })
  expect(await AccountingEntry.countDocuments()).toBe(0)
  expect(await AccountingLine.countDocuments()).toBe(0)
  expect(await Sequence.countDocuments()).toBe(0)
})

it('C12 refuse les euros à partir de mille milliards en valeur absolue', () => {
  for (const euros of [1e12, -1e12, 1e12 + 0.01])
    expect(() => toCents(euros)).toThrow(expect.objectContaining({ status: 400 }))
  expect(toCents(999_999_999_999.99)).toBe(99_999_999_999_999)
})

it('C13 refuse un relevé dont une somme dépasse les centimes entiers sûrs', () => {
  const max = Number.MAX_SAFE_INTEGER
  for (const [allocations, settlements] of [
    [[max, 1], []],
    [[], [max, 1]],
    [[-max], [1]],
  ]) {
    expect(() => beneficiaryStatement(allocations!, settlements!)).toThrow(expect.objectContaining({ status: 400 }))
  }
})

it('conserve le TTC historique fractionnaire dans le PDF, Factur-X, la vente et l’encaissement', async () => {
  await BillingDocument.updateOne(
    { _id: invoice._id },
    {
      subtotal: 29.985,
      taxTotal: 5.997,
      total: 35.982,
      lines: [{ description: 'Prestation', quantity: 1.5, unitPrice: 19.99, total: 29.985, taxRate: 20 }],
    },
  )
  const doc = await reload()
  expect(invoiceAmountsCents(doc)).toEqual({ htCents: 2999, vatCents: 599, ttcCents: 3598 })
  const sale = await createSaleEntryFromBilling(doc)
  expect(sale.lines.map(({ accountCode, debit, credit }) => ({ accountCode, debit, credit }))).toEqual([
    { accountCode: '411000', debit: 35.98, credit: 0 },
    { accountCode: '706000', debit: 0, credit: 29.99 },
    { accountCode: '445710', debit: 0, credit: 5.99 },
  ])
  const xml = buildFacturXMinimum({ doc })
  expect(xml).toContain('<ram:TaxBasisTotalAmount>29.99</ram:TaxBasisTotalAmount>')
  expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">5.99</ram:TaxTotalAmount>')
  expect(xml).toContain('<ram:GrandTotalAmount>35.98</ram:GrandTotalAmount>')
  const { generateBillingPdf } = await vi.importActual<typeof import('../lib/pdfBilling.js')>('../lib/pdfBilling.js')
  const PDFDocument = (await import('pdfkit')).default
  const directory = await mkdtemp(path.join(tmpdir(), 'venio-fraction-'))
  const text = vi.spyOn(PDFDocument.prototype, 'text')
  try {
    const file = path.join(directory, 'invoice.pdf')
    await generateBillingPdf(doc, null, null, file, { settings: { legalName: 'Venio' } })
    expect((await readFile(file)).subarray(0, 5).toString()).toBe('%PDF-')
    const rendered = text.mock.calls.map((call) => call[0])
    const format = (amount: number) =>
      new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount)
    for (const amount of [29.99, 5.99, 35.98]) expect(rendered).toContain(format(amount))
  } finally {
    text.mockRestore()
    await rm(directory, { recursive: true, force: true })
  }
  await pay(3598)
  expect((await reload()).status).toBe('PAID')
  expect((await reload()).total).toBe(35.982)
})

it('arrondit les nouvelles lignes et la TVA par taux dans les créations et modifications admin et agent', async () => {
  const lines = [
    { description: 'Prestation', quantity: 1.5, unitPrice: 19.99, taxRate: 20 },
    { description: 'A', quantity: 1, unitPrice: 0.03, taxRate: 10 },
    { description: 'B', quantity: 1, unitPrice: 0.03, taxRate: 10 },
  ]
  const check = (doc: { lines: { total: number }[]; subtotal: number; taxTotal: number; total: number }) => {
    expect(doc.lines.map((line) => line.total)).toEqual([29.99, 0.03, 0.03])
    expect([doc.subtotal, doc.taxTotal, doc.total]).toEqual([30.05, 6.01, 36.06])
  }
  for (const kind of ['quotes', 'invoices']) {
    const response = await request(app)
      .post(`/billing/projects/${projectId}/${kind}`)
      .set('Cookie', cookie)
      .send({ lines })
      .expect(201)
    check(response.body.document)
    const updated = await request(app)
      .patch(`/billing/${response.body.document._id}`)
      .set('Cookie', cookie)
      .send({ lines })
      .expect(200)
    check(updated.body.document)
  }
  for (const type of ['QUOTE', 'INVOICE']) {
    const response = await request(app).post('/agent/billing').send({ type, project: projectId, lines }).expect(201)
    check(response.body)
    const updated = await request(app).patch(`/agent/billing/${response.body._id}`).send({ lines }).expect(200)
    check(updated.body)
  }
})

it('rapproche la TVA uniquement sur les bases taxables sans inverser leur signe', async () => {
  await BillingDocument.updateOne(
    { _id: invoice._id },
    {
      subtotal: 100.09,
      taxTotal: 0.01,
      total: 100.1,
      lines: [
        { description: 'Exonéré', quantity: 1, unitPrice: 100, total: 100, taxRate: 0 },
        { description: 'A', quantity: 1, unitPrice: 0.03, total: 0.03, taxRate: 20 },
        { description: 'B', quantity: 1, unitPrice: 0.06, total: 0.06, taxRate: 10 },
      ],
    },
  )
  const doc = await reload()
  expect(billingVatBreakdown(doc)).toEqual([
    { rate: 20, htCents: 3, taxCents: 1 },
    { rate: 10, htCents: 6, taxCents: 0 },
    { rate: 0, htCents: 10000, taxCents: 0 },
  ])
  const xml = buildFacturXMinimum({ doc })
  expect(xml).not.toContain('<ram:CalculatedAmount>-')
  expect(xml).toContain('<ram:GrandTotalAmount>100.10</ram:GrandTotalAmount>')
  const sale = await createSaleEntryFromBilling(doc)
  expect(sale.entry.totalDebit).toBe(100.1)
  expect(sale.entry.totalCredit).toBe(100.1)
  for (const invalid of [
    { lines: [{ total: 100, taxRate: 0 }], subtotal: 100, taxTotal: 0.01, total: 100.01 },
    { lines: [{ total: 0.01, taxRate: 20 }], subtotal: 0.01, taxTotal: -0.01, total: 0 },
    { lines: [{ total: -0.01, taxRate: 20 }], subtotal: -0.01, taxTotal: 0.01, total: 0 },
  ])
    expect(() => billingVatBreakdown(invalid)).toThrow(expect.objectContaining({ status: 400 }))
})

it('n’accorde le centime de tolérance qu’aux documents historiques fractionnaires', () => {
  expect(() => invoiceAmountsCents({ subtotal: 100, taxTotal: 20, total: 120.01 })).toThrow()
  expect(invoiceAmountsCents({ subtotal: 29.985, taxTotal: 5.997, total: 35.982 })).toEqual({
    htCents: 2999,
    vatCents: 599,
    ttcCents: 3598,
  })
})

it('respecte le total de ligne imposé par l’appelant (remise)', () => {
  const totals = computeBillingTotals([{ description: 'Remisé', quantity: 1, unitPrice: 100, taxRate: 20, total: 80 }])
  expect(totals).toMatchObject({ subtotal: 80, taxTotal: 16, total: 96 })
  expect(totals.lines[0]!.total).toBe(80)
})

it('reporte l’écart de TVA sur un groupe taxable de même signe, même à côté d’une base négative', () => {
  const groups = billingVatBreakdown({
    lines: [
      { total: 10, taxRate: 0 },
      { total: -0.06, taxRate: 5.5 },
      { total: 0.024, taxRate: 20 },
    ],
    subtotal: 9.964,
    taxTotal: 0.0015,
    total: 9.9655,
  })
  expect(groups.map(({ rate, htCents, taxCents }) => ({ rate, htCents, taxCents }))).toEqual([
    { rate: 20, htCents: 2, taxCents: 1 },
    { rate: 5.5, htCents: -6, taxCents: 0 },
    { rate: 0, htCents: 1000, taxCents: 0 },
  ])
})
