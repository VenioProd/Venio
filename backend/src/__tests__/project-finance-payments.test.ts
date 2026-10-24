import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import { clearDb, setupMongoReplSet, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import { resetTransactionSupportCache } from '../lib/transaction.js'
import { recordPayment, recordRefund, projectFinanceSummary } from '../lib/projectFinance/payments.js'
import { createCreditNote } from '../lib/projectFinance/creditNotes.js'
import { notifySuperAdmins } from '../lib/notifyHelpers.js'
import accountingRoutes from '../routes/admin/accounting/index.js'
import billingRoutes from '../routes/admin/billing.js'
import agentBillingRoutes from '../routes/agent/billing.js'
import BillingDocument from '../models/BillingDocument.js'
import ProjectPayment from '../models/ProjectPayment.js'
import ShareAllocation from '../models/ShareAllocation.js'
import ProjectFinance from '../models/ProjectFinance.js'
import ShareRuleVersion from '../models/ShareRuleVersion.js'
import Beneficiary from '../models/Beneficiary.js'
import Project from '../models/Project.js'
import User from '../models/User.js'
import Sequence from '../models/Sequence.js'
import Journal from '../models/Journal.js'
import ChartOfAccount from '../models/ChartOfAccount.js'
import AccountingEntry from '../models/AccountingEntry.js'
import AccountingLine from '../models/AccountingLine.js'
import FiscalYear from '../models/FiscalYear.js'
import AuditLog from '../models/AuditLog.js'

vi.mock('../lib/pdfBilling.js', () => ({ generateBillingPdf: vi.fn().mockResolvedValue('/unused.pdf') }))
vi.mock('../lib/email.js', () => ({ sendInvoiceEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/notifyHelpers.js', () => ({ notifySuperAdmins: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../routes/agent/_middleware/auth.js', () => ({
  requireScope: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

const app = express()
app.use(express.json())
app.use('/accounting', accountingRoutes)
app.use('/billing', billingRoutes)
app.use('/agent', agentBillingRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})
let userId: string
let clientId: string
let projectId: string
let cookie: string
let invoiceId: string
let beneficiaries: mongoose.Types.ObjectId[]
let finance: InstanceType<typeof ProjectFinance>
const receivedAt = new Date('2026-01-10')
const pay = (amountTtcCents: number, idempotencyKey: string = crypto.randomUUID(), at = receivedAt) =>
  recordPayment({
    invoiceId,
    amountTtcCents,
    method: 'VIREMENT',
    receivedAt: at,
    reference: 'Banque',
    idempotencyKey,
    userId,
  })
const refund = (paymentId: unknown, amountTtcCents: number, idempotencyKey: string = crypto.randomUUID()) =>
  recordRefund({
    paymentId: String(paymentId),
    amountTtcCents,
    receivedAt: new Date('2026-01-20'),
    reason: 'Restitution',
    idempotencyKey,
    userId,
  })
const allocations = async (paymentId: unknown) => {
  const rows = await ShareAllocation.find({ payment: paymentId })
  return [...beneficiaries, null].map((id) => rows.find((row) => String(row.beneficiary) === String(id))!.amountCents)
}
async function version(versionNumber: number, freelanceBp: number, effectiveFrom: string) {
  return ShareRuleVersion.create({
    project: projectId,
    version: versionNumber,
    effectiveFrom,
    createdBy: userId,
    rules: [1000, freelanceBp, 500, 2000, 2000].map((bp, index) => ({ beneficiary: beneficiaries[index], bp })),
  })
}
beforeAll(async () => {
  await setupMongoReplSet()
  resetTransactionSupportCache()
  await Promise.all(
    [
      ProjectPayment,
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
  const [admin, client] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash: 'unused', role: 'SUPER_ADMIN' },
    { name: 'Client', email: 'client@example.test', passwordHash: 'unused', role: 'CLIENT' },
  ])
  userId = String(admin._id)
  clientId = String(client._id)
  cookie = `venio_session=${(await createSession(userId)).token}`
  projectId = String((await Project.create({ name: 'Projet Démo', client: clientId }))._id)
  await ChartOfAccount.create({ code: '604000', label: 'Sous-traitance', accountClass: 6, type: 'CHARGE' })
  beneficiaries = (
    await Beneficiary.create(
      ['COMMERCIAL', 'FREELANCE', 'APPORTEUR', 'ASSOCIE', 'ASSOCIE'].map((kind, index) => ({
        kind,
        displayName: `Bénéficiaire ${index}`,
        defaultAccountCode: '604000',
        settlementMode: 'BANQUE',
      })),
    )
  ).map((beneficiary) => beneficiary._id as mongoose.Types.ObjectId)
  finance = await ProjectFinance.create({
    project: projectId,
    mode: 'FORFAIT',
    contractHtCents: 99990,
    vatRateBp: 2000,
    shareActivationDate: '2026-01-01',
    installments: [{ label: 'Solde', percentBp: 10000, trigger: { kind: 'DATE', dueDate: '2026-01-01' } }],
    payers: [{ kind: 'CLIENT', user: clientId, shareBp: 10000, isPrincipal: true, paymentMethod: 'CB' }],
  })
  await version(1, 3500, '2026-01-01')
  invoiceId = String(
    (
      await BillingDocument.create({
        type: 'INVOICE',
        number: 'FAC-EXEMPLE',
        project: projectId,
        client: clientId,
        createdBy: userId,
        status: 'SENT',
        sentAt: new Date('2026-01-01'),
        dueAt: new Date('2026-01-05'),
        payer: { payerId: finance.payers[0]!._id, kind: 'CLIENT', user: clientId },
        subtotal: 999.9,
        taxTotal: 199.98,
        total: 1199.88,
        lines: [{ description: 'Prestation', quantity: 1, unitPrice: 999.9, taxRate: 20, total: 999.9 }],
      })
    )._id,
  )
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

it('applique R3/R5/R6 au centime et conserve l’invariant et le dû R7', async () => {
  const e1 = await pay(40000)
  expect(e1.payment.htCents).toBe(33333)
  expect((await BillingDocument.findById(invoiceId))!.status).toBe('PARTIALLY_PAID')
  await version(2, 3000, '2026-01-11')
  const e2 = await pay(40000, 'E2', new Date('2026-01-12'))
  expect(e2.payment.htCents).toBe(33334)
  expect((await BillingDocument.findById(invoiceId))!.status).toBe('PARTIALLY_PAID')
  const e3 = await pay(39988, 'E3', new Date('2026-01-13'))
  expect(e3.payment.htCents).toBe(33323)
  expect((await BillingDocument.findById(invoiceId))!).toMatchObject({ status: 'PAID', paidAt: new Date('2026-01-13') })
  expect(await allocations(e1.payment._id)).toEqual([3333, 11666, 1666, 6666, 6666, 3336])
  expect(await allocations(e2.payment._id)).toEqual([3333, 10000, 1666, 6666, 6666, 5003])
  expect(await allocations(e3.payment._id)).toEqual([3332, 9996, 1666, 6664, 6664, 5001])
  const r = await refund(e1.payment._id, 15000)
  expect(r.payment).toMatchObject({ amountTtcCents: -15000, htCents: -12500 })
  expect(await allocations(r.payment._id)).toEqual([-1250, -4375, -625, -2500, -2500, -1250])
  expect((await BillingDocument.findById(invoiceId))!).toMatchObject({ status: 'PARTIALLY_PAID', paidAt: null })
  const summary = await projectFinanceSummary(projectId)
  expect(summary).toMatchObject({
    invoicedHtCents: 99990,
    invoicedTtcCents: 119988,
    receivedTtcCents: 104988,
    receivedHtCents: 87490,
    remainingTtcCents: 15000,
  })
  expect(summary.beneficiaries.find((row) => String(row.beneficiary) === String(beneficiaries[1]))!.dueCents).toBe(
    27287,
  )
  expect(summary.beneficiaries.reduce((sum, row) => sum + row.dueCents, 0)).toBe(87490)
  expect(summary.overdueInvoices).toHaveLength(1)
  expect(notifySuperAdmins).toHaveBeenCalledTimes(1)
})

it('annule exactement les parts sur plusieurs remboursements et revient à SENT ou ISSUED', async () => {
  const e1 = await pay(40000)
  await refund(e1.payment._id, 15000)
  await refund(e1.payment._id, 25000)
  const rows = await ShareAllocation.find({ project: projectId })
  for (const id of [...beneficiaries, null]) {
    expect(
      rows.filter((row) => String(row.beneficiary) === String(id)).reduce((sum, row) => sum + row.amountCents, 0),
    ).toBe(0)
  }
  expect((await BillingDocument.findById(invoiceId))!.status).toBe('SENT')
  await BillingDocument.updateOne({ _id: invoiceId }, { sentAt: null })
  const e2 = await pay(40000)
  await refund(e2.payment._id, 40000)
  expect((await BillingDocument.findById(invoiceId))!.status).toBe('ISSUED')
})

it('génère une seule écriture BQ TTC par encaissement, inversée au remboursement', async () => {
  const e = await pay(40000)
  const r = await refund(e.payment._id, 15000)
  for (const [result, amounts] of [
    [
      e,
      [
        [400, 0],
        [0, 400],
      ],
    ],
    [
      r,
      [
        [0, 150],
        [150, 0],
      ],
    ],
  ] as const) {
    const entry = (await AccountingEntry.findById(result.payment.entry))!
    expect(entry).toMatchObject({
      journalCode: 'BQ',
      status: 'VALIDATED',
      source: 'PAYMENT',
      idempotencyKey: `payment:${result.payment._id}`,
    })
    expect(String(entry.sourceRef!.id)).toBe(String(result.payment._id))
    expect(entry.date).toEqual(result.payment.receivedAt)
    const lines = await AccountingLine.find({ entry: entry._id }).sort({ sortIndex: 1 })
    expect(lines.map((line) => [line.accountCode, line.debit, line.credit])).toEqual([
      ['512000', ...amounts[0]],
      ['411000', ...amounts[1]],
    ])
    expect(lines[1]!.auxiliaryRef!.kind).toBe('CLIENT')
    expect(String(lines[1]!.auxiliaryRef!.id)).toBe(clientId)
    expect(lines[1]!.lettrage).toBe('CEXEMPLE')
  }
  expect(await AccountingEntry.countDocuments()).toBe(2)
})

it('refuse un exercice clôturé sans encaissement, part, écriture ou numéro consommé', async () => {
  await FiscalYear.create({ code: 'FY-2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'CLOTURE' })
  await expect(pay(40000)).rejects.toMatchObject({ status: 423 })
  expect(await ProjectPayment.countDocuments()).toBe(0)
  expect(await ShareAllocation.countDocuments()).toBe(0)
  expect(await AccountingEntry.countDocuments()).toBe(0)
  expect(await AccountingLine.countDocuments()).toBe(0)
  expect(await Sequence.countDocuments()).toBe(0)
  expect((await BillingDocument.findById(invoiceId))!.status).toBe('SENT')
  expect(notifySuperAdmins).not.toHaveBeenCalled()
})

it('refuse le dépassement et sérialise deux encaissements simultanés', async () => {
  await expect(pay(119989)).rejects.toMatchObject({ status: 409 })
  const results = await Promise.allSettled([pay(80000), pay(80000)])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
  expect(await ProjectPayment.countDocuments()).toBe(1)
  expect(await AccountingEntry.countDocuments()).toBe(1)
})

it('annule aussi l’écriture et sa séquence si l’enregistrement des parts échoue', async () => {
  const save = vi.spyOn(ShareAllocation.prototype, 'save').mockRejectedValueOnce(new Error('Part refusée'))
  try {
    await expect(pay(40000)).rejects.toThrow('Part refusée')
  } finally {
    save.mockRestore()
  }
  expect(await ProjectPayment.countDocuments()).toBe(0)
  expect(await ShareAllocation.countDocuments()).toBe(0)
  expect(await AccountingEntry.countDocuments()).toBe(0)
  expect(await AccountingLine.countDocuments()).toBe(0)
  expect(await Sequence.countDocuments()).toBe(0)
  expect((await BillingDocument.findById(invoiceId))!.status).toBe('SENT')
})

it('sérialise le rejeu simultané et protège une clé commune à deux factures', async () => {
  const results = await Promise.all([pay(40000, 'simultane'), pay(40000, 'simultane')])
  expect(results.filter((result) => result.alreadyExisted)).toHaveLength(1)
  expect(new Set(results.map((result) => String(result.payment._id))).size).toBe(1)
  const other = await BillingDocument.create({
    ...(await BillingDocument.findById(invoiceId))!.toObject(),
    _id: new mongoose.Types.ObjectId(),
    number: 'FAC-AUTRE',
    status: 'ISSUED',
  })
  const concurrent = await Promise.allSettled([
    pay(10000, 'deux-factures'),
    recordPayment({
      invoiceId: String(other._id),
      amountTtcCents: 10000,
      method: 'CB',
      receivedAt,
      idempotencyKey: 'deux-factures',
      userId,
    }),
  ])
  expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(concurrent.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
})

it('porte sur la société le centime de HT remboursé qui dépasse la base imputée', async () => {
  const tiny = await BillingDocument.create({
    type: 'INVOICE',
    number: 'FAC-CENTIMES',
    project: projectId,
    client: clientId,
    createdBy: userId,
    status: 'ISSUED',
    subtotal: 0.18,
    taxTotal: 0.04,
    total: 0.22,
    lines: [{ description: 'Prestation', quantity: 1, unitPrice: 0.18, taxRate: 20, total: 0.18 }],
  })
  invoiceId = String(tiny._id)
  await pay(8)
  const middle = await pay(6)
  await pay(5)
  expect(middle.payment.htCents).toBe(4)
  const r = await refund(middle.payment._id, 5)
  expect(r.payment.htCents).toBe(-5)
  expect(await allocations(r.payment._id)).toEqual([0, -1, 0, 0, 0, -4])
  const remaining = await refund(middle.payment._id, 1)
  expect(remaining.payment.htCents).toBe(0)
  expect(await allocations(remaining.payment._id)).toEqual([0, 0, 0, 0, 0, 0])
  expect((await projectFinanceSummary(projectId)).receivedHtCents).toBe(11)
})

it('refuse les montants non entiers, nuls, signés négatifs et les dates futures', async () => {
  for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await expect(pay(amount)).rejects.toMatchObject({ status: 400 })
  }
  await expect(pay(1, 'futur', new Date('2099-01-01'))).rejects.toMatchObject({ status: 400 })
  expect(await ProjectPayment.countDocuments()).toBe(0)
})

it('rejoue la même demande et refuse une clé réutilisée avec un autre contenu', async () => {
  const e = await pay(40000, 'unique')
  const replay = await pay(40000, 'unique')
  expect(replay.alreadyExisted).toBe(true)
  expect(String(replay.payment._id)).toBe(String(e.payment._id))
  await expect(pay(40001, 'unique')).rejects.toMatchObject({ status: 409 })
  const r = await refund(e.payment._id, 15000, 'refund')
  expect((await refund(e.payment._id, 15000, 'refund')).alreadyExisted).toBe(true)
  await expect(refund(e.payment._id, 15001, 'refund')).rejects.toMatchObject({ status: 409 })
  await expect(refund(e.payment._id, 25001)).rejects.toMatchObject({ status: 409 })
  await expect(refund(r.payment._id, 1)).rejects.toMatchObject({ status: 409 })
  expect(await ProjectPayment.countDocuments()).toBe(2)
  expect(await AccountingEntry.countDocuments()).toBe(2)
})

it('attribue tout à la société sans activation ou sans version en vigueur', async () => {
  finance.shareActivationDate = null
  await finance.save()
  const e = await pay(40000)
  expect(e.payment.ruleVersion).toBeNull()
  expect(
    (await ShareAllocation.find({ payment: e.payment._id })).map((row) => [row.beneficiary, row.amountCents]),
  ).toEqual([[null, 33333]])
  finance.shareActivationDate = new Date('2025-01-01')
  await finance.save()
  const beforeRules = await pay(40000, 'avant', new Date('2025-12-31'))
  expect(beforeRules.payment.ruleVersion).toBeNull()
  expect(await ShareAllocation.countDocuments({ payment: beforeRules.payment._id, beneficiary: null })).toBe(1)
})

it('PATCH PAID encaisse seulement le reste et protège les factures historiques', async () => {
  await pay(40000)
  await request(app).patch(`/billing/${invoiceId}`).set('Cookie', cookie).send({ status: 'PARTIALLY_PAID' }).expect(400)
  await request(app)
    .patch(`/billing/${invoiceId}`)
    .set('Cookie', cookie)
    .send({ status: 'PAID', paidAt: '2026-01-12' })
    .expect(200)
  const last = (await ProjectPayment.findOne({ invoice: invoiceId }).sort({ createdAt: -1 }))!
  expect(last).toMatchObject({
    amountTtcCents: 79988,
    method: 'CB',
    receivedAt: new Date('2026-01-12'),
    idempotencyKey: `mark-paid:${invoiceId}:40000`,
  })
  expect((await BillingDocument.findById(invoiceId))!.status).toBe('PAID')
  await request(app).patch(`/billing/${invoiceId}`).set('Cookie', cookie).send({ status: 'PAID' }).expect(200)
  const historical = await BillingDocument.create({
    ...(await BillingDocument.findById(invoiceId))!.toObject(),
    _id: new mongoose.Types.ObjectId(),
    number: 'FAC-HISTORIQUE',
  })
  await expect(
    recordPayment({
      invoiceId: String(historical._id),
      amountTtcCents: 1,
      method: 'CB',
      receivedAt,
      idempotencyKey: 'historique',
      userId,
    }),
  ).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/manuelle/) })
  await request(app).patch(`/billing/${historical._id}`).set('Cookie', cookie).send({ status: 'PAID' }).expect(200)
  expect((await projectFinanceSummary(projectId)).remainingTtcCents).toBe(0)
  expect(await ProjectPayment.countDocuments()).toBe(2)
})

it('raccorde mark-paid agent et refuse les deux chemins d’annulation si encaissé', async () => {
  await pay(40000)
  await request(app).post(`/agent/billing/${invoiceId}/cancel`).expect(409)
  await request(app).patch(`/billing/${invoiceId}`).set('Cookie', cookie).send({ status: 'CANCELLED' }).expect(409)
  await request(app)
    .post(`/agent/billing/${invoiceId}/mark-paid`)
    .send({ method: 'PRELEVEMENT', paidAt: '2026-01-12' })
    .expect(200)
  expect(await ProjectPayment.countDocuments()).toBe(2)
  expect((await ProjectPayment.findOne({ amountTtcCents: 79988 }))!.method).toBe('PRELEVEMENT')
})

it('exclut avoir et argent encaissé, puis calcule sur les montants nets émis', async () => {
  const e = await pay(40000)
  await expect(createCreditNote({ invoiceId, reason: 'Correction', userId })).rejects.toMatchObject({ status: 409 })
  await refund(e.payment._id, 40000)
  const credit = await createCreditNote({ invoiceId, amountHtCents: 9990, reason: 'Correction', userId })
  await expect(pay(40000)).rejects.toMatchObject({ status: 409 })
  await request(app).post(`/billing/${credit._id}/generate-pdf`).set('Cookie', cookie).expect(200)
  const net = await pay(108000)
  expect(net.payment.htCents).toBe(90000)
  expect(await projectFinanceSummary(projectId)).toMatchObject({
    invoicedHtCents: 90000,
    invoicedTtcCents: 108000,
    remainingTtcCents: 0,
  })
  await request(app).post(`/billing/${credit._id}/generate-pdf`).set('Cookie', cookie).expect(409)
})

it('refuse une nouvelle version antérieure au dernier encaissement réparti', async () => {
  await pay(40000)
  await request(app)
    .post(`/accounting/projects/${projectId}/share-rules`)
    .set('Cookie', cookie)
    .send({
      effectiveFrom: '2026-01-09',
      rules: [{ beneficiary: beneficiaries[1], bp: 3000 }],
    })
    .expect(400)
  expect(await ShareRuleVersion.countDocuments()).toBe(1)
})

it('sérialise une nouvelle version avec un encaissement en cours', async () => {
  let releasePayment!: () => void
  let paymentReady!: () => void
  let versionReady!: () => void
  const released = new Promise<void>((resolve) => {
    releasePayment = resolve
  })
  const ready = new Promise<void>((resolve) => {
    paymentReady = resolve
  })
  const versionStarted = new Promise<void>((resolve) => {
    versionReady = resolve
  })
  const save = ProjectPayment.prototype.save
  let paymentPending = false
  const saveSpy = vi.spyOn(ProjectPayment.prototype, 'save').mockImplementation(async function (
    this: InstanceType<typeof ProjectPayment>,
    ...args
  ) {
    paymentPending = true
    paymentReady()
    await released
    return save.apply(this, args)
  })
  const update = ProjectFinance.updateOne
  const updateSpy = vi.spyOn(ProjectFinance, 'updateOne').mockImplementation(function (...args) {
    if (paymentPending) versionReady()
    return update.apply(ProjectFinance, args)
  })
  try {
    const payment = pay(40000)
    await ready
    const response = request(app)
      .post(`/accounting/projects/${projectId}/share-rules`)
      .set('Cookie', cookie)
      .send({
        effectiveFrom: '2026-01-09',
        rules: [{ beneficiary: beneficiaries[1], bp: 3000 }],
      })
      .then((result) => result)
    await versionStarted
    releasePayment()
    await payment
    expect((await response).status).toBe(400)
    expect(await ShareRuleVersion.countDocuments()).toBe(1)
  } finally {
    releasePayment()
    saveSpy.mockRestore()
    updateSpy.mockRestore()
  }
})

it('audite les écritures et refuse l’accès sans permission comptable', async () => {
  const url = `/accounting/invoices/${invoiceId}/payments`
  await request(app).post(url).expect(401)
  const response = await request(app)
    .post(url)
    .set('Cookie', cookie)
    .send({ amountTtcCents: 40000, method: 'CB', receivedAt, idempotencyKey: 'api' })
    .expect(201)
  await request(app)
    .post(url)
    .set('Cookie', cookie)
    .send({ amountTtcCents: 40000, method: 'CB', receivedAt, idempotencyKey: 'api' })
    .expect(200)
  await request(app)
    .post(`/accounting/payments/${response.body.payment._id}/refunds`)
    .set('Cookie', cookie)
    .send({ amountTtcCents: 15000, receivedAt, reason: 'Restitution', idempotencyKey: 'api-refund' })
    .expect(201)
  expect(await AuditLog.countDocuments({ 'metadata.entityType': 'ProjectPayment' })).toBe(3)
  await User.updateOne({ _id: userId }, { role: 'ADMIN', deniedPermissions: ['view_accounting', 'manage_accounting'] })
  await request(app).get(url).set('Cookie', cookie).expect(403)
  await request(app).post(url).set('Cookie', cookie).send({}).expect(403)
})

it('fige les encaissements et parts et détecte un invariant corrompu', async () => {
  const e = await pay(40000)
  e.payment.reference = 'Autre'
  await expect(e.payment.save()).rejects.toThrow(/immuable/)
  await expect(ProjectPayment.updateOne({ _id: e.payment._id }, { amountTtcCents: 1 })).rejects.toThrow(/immuable/)
  const allocation = (await ShareAllocation.findOne({ payment: e.payment._id }))!
  allocation.amountCents++
  await expect(allocation.save()).rejects.toThrow(/immuable/)
  await expect(ShareAllocation.updateOne({ _id: allocation._id }, { amountCents: 0 })).rejects.toThrow(/immuable/)
  await ShareAllocation.collection.updateOne(
    { _id: allocation._id as mongoose.Types.ObjectId },
    { $inc: { amountCents: 1 } },
  )
  await expect(projectFinanceSummary(projectId)).rejects.toThrow(/parts/)
})
