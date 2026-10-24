import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import { clearDb, setupMongoReplSet, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import { resetTransactionSupportCache } from '../lib/transaction.js'
import { recordPayment, recordRefund, projectFinanceSummary } from '../lib/projectFinance/payments.js'
import {
  recordSettlement,
  reverseSettlement,
  recordProjectCost,
  beneficiaryStatementFor,
} from '../lib/projectFinance/settlements.js'
import { createEntry } from '../lib/accounting/doubleEntry.js'
import accountingRoutes from '../routes/admin/accounting/index.js'
import BillingDocument from '../models/BillingDocument.js'
import ProjectPayment from '../models/ProjectPayment.js'
import ShareAllocation from '../models/ShareAllocation.js'
import ShareSettlement from '../models/ShareSettlement.js'
import ProjectCost from '../models/ProjectCost.js'
import ProjectFinance from '../models/ProjectFinance.js'
import ShareRuleVersion from '../models/ShareRuleVersion.js'
import Beneficiary from '../models/Beneficiary.js'
import Project from '../models/Project.js'
import User from '../models/User.js'
import Sequence from '../models/Sequence.js'
import Journal from '../models/Journal.js'
import ChartOfAccount from '../models/ChartOfAccount.js'
import VatRate from '../models/VatRate.js'
import AccountingEntry from '../models/AccountingEntry.js'
import AccountingLine from '../models/AccountingLine.js'
import FiscalYear from '../models/FiscalYear.js'
import AuditLog from '../models/AuditLog.js'

vi.mock('../lib/notifyHelpers.js', () => ({ notifySuperAdmins: vi.fn().mockResolvedValue(undefined) }))

const app = express()
app.use(express.json())
app.use('/accounting', accountingRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})
let userId: string
let clientId: string
let projectId: string
let invoiceId: string
let cookie: string
let beneficiaries: mongoose.Types.ObjectId[]
const paidAt = new Date('2026-02-15')
const settle = (htCents = 11666, options: Partial<Parameters<typeof recordSettlement>[0]> = {}) =>
  recordSettlement({
    beneficiaryId: String(beneficiaries[1]),
    projectId,
    htCents,
    vatCents: 2333,
    paidAt,
    invoiceRef: 'FL-0042',
    idempotencyKey: crypto.randomUUID(),
    userId,
    ...options,
  })
const reverse = (settlementId: unknown, idempotencyKey: string = crypto.randomUUID()) =>
  reverseSettlement({ settlementId: String(settlementId), reason: 'Erreur de saisie', idempotencyKey, userId })
const cost = (options: Partial<Parameters<typeof recordProjectCost>[0]> = {}) =>
  recordProjectCost({
    projectId,
    accountCode: '604000',
    label: 'Licences',
    supplier: 'Éditeur',
    htCents: 20000,
    vatCents: 4000,
    date: paidAt,
    idempotencyKey: crypto.randomUUID(),
    userId,
    ...options,
  })
async function version(versionNumber: number, freelanceBp: number, effectiveFrom: string) {
  return ShareRuleVersion.create({
    project: projectId,
    version: versionNumber,
    effectiveFrom,
    createdBy: userId,
    rules: [1000, freelanceBp, 500, 2000, 2000].map((bp, index) => ({ beneficiary: beneficiaries[index], bp })),
  })
}
async function scenario() {
  const pay = (amountTtcCents: number, receivedAt: string) =>
    recordPayment({
      invoiceId,
      amountTtcCents,
      receivedAt,
      method: 'VIREMENT',
      userId,
      idempotencyKey: crypto.randomUUID(),
    })
  const e1 = await pay(40000, '2026-01-10')
  await version(2, 3000, '2026-01-11')
  await pay(40000, '2026-01-12')
  await pay(39988, '2026-01-13')
  await recordRefund({
    paymentId: String(e1.payment._id),
    amountTtcCents: 15000,
    receivedAt: '2026-01-20',
    reason: 'Restitution',
    userId,
    idempotencyKey: crypto.randomUUID(),
  })
}
beforeAll(async () => {
  await setupMongoReplSet()
  resetTransactionSupportCache()
  await Promise.all(
    [
      Project,
      Beneficiary,
      ProjectPayment,
      ShareAllocation,
      ShareSettlement,
      ProjectCost,
      ProjectFinance,
      ShareRuleVersion,
      BillingDocument,
      Sequence,
      AccountingEntry,
      AccountingLine,
      FiscalYear,
      Journal,
      ChartOfAccount,
      VatRate,
    ].map((model) => model.init()),
  )
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  const [admin, client] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash: 'unused', role: 'SUPER_ADMIN' },
    { name: 'Client', email: 'client@example.test', passwordHash: 'unused', role: 'CLIENT' },
  ])
  userId = String(admin._id)
  clientId = String(client._id)
  cookie = `venio_session=${(await createSession(userId)).token}`
  projectId = String((await Project.create({ name: 'Projet Démo', client: clientId }))._id)
  await ChartOfAccount.create([
    { code: '604000', label: 'Sous-traitance', accountClass: 6, type: 'CHARGE' },
    { code: '401000', label: 'Fournisseurs', accountClass: 4, type: 'PASSIF' },
    { code: '411000', label: 'Clients', accountClass: 4, type: 'ACTIF' },
    { code: '512000', label: 'Banque', accountClass: 5, type: 'ACTIF' },
    { code: '445660', label: 'TVA déductible', accountClass: 4, type: 'ACTIF' },
    { code: '44566', label: 'TVA configurée', accountClass: 4, type: 'ACTIF' },
    { code: '706000', label: 'Prestations', accountClass: 7, type: 'PRODUIT' },
  ])
  await VatRate.create({ code: 'NORMAL', label: 'TVA 20 %', rate: 20, deductibleAccount: '44566' })
  beneficiaries = (
    await Beneficiary.create(
      ['COMMERCIAL', 'FREELANCE', 'APPORTEUR', 'ASSOCIE', 'ASSOCIE'].map((kind, index) => ({
        kind,
        displayName: `Bénéficiaire ${index}`,
        defaultAccountCode: '604000',
        settlementMode: index === 0 ? 'PAIE' : 'BANQUE',
        vatRegistered: index === 1,
      })),
    )
  ).map((beneficiary) => beneficiary._id as mongoose.Types.ObjectId)
  const finance = await ProjectFinance.create({
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
        subtotal: 999.9,
        taxTotal: 199.98,
        total: 1199.88,
        payer: { payerId: finance.payers[0]!._id, kind: 'CLIENT', user: clientId },
        lines: [{ description: 'Prestation', quantity: 1, unitPrice: 999.9, taxRate: 20, total: 999.9 }],
      })
    )._id,
  )
  await Journal.create([
    { code: 'BQ', label: 'Banque', type: 'BANQUE' },
    { code: 'AC', label: 'Achats', type: 'ACHAT' },
  ])
})

it('paye le freelance archivé au centime et produit son relevé R7', async () => {
  await scenario()
  await Beneficiary.updateOne({ _id: beneficiaries[1] }, { isActive: false })
  const { settlement } = await settle()
  const statement = await beneficiaryStatementFor(String(beneficiaries[1]))
  expect(statement).toMatchObject({ dueCents: 27287, paidCents: 11666, remainingCents: 15621, unattachedPaidCents: 0 })
  expect(statement.projects).toEqual([
    expect.objectContaining({ dueCents: 27287, paidCents: 11666, remainingCents: 15621 }),
  ])
  expect(statement.allocations.map((row) => row.amountCents)).toEqual([11666, 10000, 9996, -4375])
  expect(statement.allocations[0]).toMatchObject({
    receivedAt: new Date('2026-01-10'),
    invoiceNumber: 'FAC-EXEMPLE',
    paymentHtCents: 33333,
    bp: 3500,
  })
  expect(await AccountingEntry.findById(settlement.entry)).toMatchObject({
    journalCode: 'BQ',
    source: 'PAYMENT',
    status: 'VALIDATED',
    date: paidAt,
    idempotencyKey: `settlement:${settlement._id}`,
  })
  const lines = await AccountingLine.find({ entry: settlement.entry }).sort({ sortIndex: 1 })
  expect(lines.map((line) => [line.accountCode, line.debit, line.credit, line.project])).toEqual([
    ['604000', 116.66, 0, null],
    ['44566', 23.33, 0, null],
    ['512000', 0, 139.99, null],
  ])
  expect(lines[0]!.auxiliaryRef!.kind).toBe('SUPPLIER')
  expect(String(lines[0]!.auxiliaryRef!.id)).toBe(String(beneficiaries[1]))
  await VatRate.updateOne({ code: 'NORMAL' }, { deductibleAccount: '' })
  const enteredVat = await settle(1, { vatCents: 7 })
  expect(await AccountingLine.findOne({ entry: enteredVat.settlement.entry, accountCode: '445660' })).toMatchObject({
    debit: 0.07,
  })
})

it('trace la paie sans écriture et ses versements non rattachés', async () => {
  await scenario()
  const before = await AccountingEntry.countDocuments()
  const { settlement } = await settle(2000, { beneficiaryId: String(beneficiaries[0]), projectId: null, vatCents: 0 })
  expect(settlement).toMatchObject({ mode: 'PAIE', entry: null })
  expect(await AccountingEntry.countDocuments()).toBe(before)
  expect(await beneficiaryStatementFor(String(beneficiaries[0]))).toMatchObject({
    dueCents: 8748,
    paidCents: 2000,
    remainingCents: 6748,
    unattachedPaidCents: 2000,
  })
  expect(
    (await projectFinanceSummary(projectId)).beneficiaries.find(
      (row) => String(row.beneficiary) === String(beneficiaries[0]),
    ),
  ).toMatchObject({ paidCents: 0, remainingCents: 8748 })
  await reverse(settlement._id)
  expect(await AccountingEntry.countDocuments()).toBe(before)
  expect(await beneficiaryStatementFor(String(beneficiaries[0]))).toMatchObject({ paidCents: 0 })
})

it('refuse les plafonds global et projet, y compris un restant négatif après remboursement', async () => {
  await scenario()
  await expect(settle(27288)).rejects.toMatchObject({ status: 409 })
  const other = await Project.create({ name: 'Autre projet', client: clientId })
  await expect(settle(1, { projectId: String(other._id) })).rejects.toMatchObject({ status: 409 })
  await settle(27287)
  const e2 = (await ProjectPayment.findOne({ invoice: invoiceId, receivedAt: new Date('2026-01-12') }))!
  await recordRefund({
    paymentId: String(e2._id),
    amountTtcCents: 40000,
    receivedAt: '2026-02-20',
    reason: 'Retour',
    userId,
    idempotencyKey: crypto.randomUUID(),
  })
  expect(await beneficiaryStatementFor(String(beneficiaries[1]))).toMatchObject({ remainingCents: -10000 })
  await expect(settle(1, { projectId: null })).rejects.toMatchObject({ status: 409 })
})

it('sérialise deux versements qui dépasseraient ensemble le restant', async () => {
  await scenario()
  const results = await Promise.allSettled([settle(20000), settle(20000)])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
  expect(await ShareSettlement.countDocuments()).toBe(1)
})

it('refuse la TVA non assujettie et les montants ou dates invalides', async () => {
  await scenario()
  await expect(settle(1, { beneficiaryId: String(beneficiaries[2]) })).rejects.toMatchObject({ status: 400 })
  for (const htCents of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await expect(settle(htCents)).rejects.toMatchObject({ status: 400 })
  }
  await expect(settle(1, { vatCents: -1 })).rejects.toMatchObject({ status: 400 })
  await expect(settle(1, { paidAt: '2099-01-01' })).rejects.toMatchObject({ status: 400 })
  expect(await ShareSettlement.countDocuments()).toBe(0)
})

it('rejoue les demandes identiques et refuse les collisions de contenu', async () => {
  await scenario()
  const results = await Promise.all([
    settle(11666, { idempotencyKey: 'versement' }),
    settle(11666, { idempotencyKey: 'versement' }),
  ])
  expect(results.filter((result) => result.alreadyExisted)).toHaveLength(1)
  expect(new Set(results.map((result) => String(result.settlement._id))).size).toBe(1)
  await expect(settle(11667, { idempotencyKey: 'versement' })).rejects.toMatchObject({ status: 409 })
  const c = await cost({ idempotencyKey: 'cout' })
  expect((await cost({ idempotencyKey: 'cout' })).alreadyExisted).toBe(true)
  await expect(cost({ htCents: 20001, idempotencyKey: 'cout' })).rejects.toMatchObject({ status: 409 })
  expect(await ProjectCost.countDocuments()).toBe(1)
  expect(String((await ProjectCost.findOne())!.entry)).toBe(String(c.cost.entry))
})

it('ne consomme ni document ni écriture ni numéro sur exercice clôturé', async () => {
  await scenario()
  await FiscalYear.updateMany({}, { status: 'CLOTURE' })
  const entries = await AccountingEntry.countDocuments()
  const lines = await AccountingLine.countDocuments()
  const sequences = await Sequence.find().lean()
  await expect(settle()).rejects.toMatchObject({ status: 423 })
  await expect(settle(1, { beneficiaryId: String(beneficiaries[0]), vatCents: 0 })).rejects.toMatchObject({
    status: 423,
  })
  await expect(cost()).rejects.toMatchObject({ status: 423 })
  expect(await ShareSettlement.countDocuments()).toBe(0)
  expect(await ProjectCost.countDocuments()).toBe(0)
  expect(await AccountingEntry.countDocuments()).toBe(entries)
  expect(await AccountingLine.countDocuments()).toBe(lines)
  expect(await Sequence.find().lean()).toEqual(sequences)
})

it('annule une seule fois avec les lignes exactes d’origine à la date d’annulation', async () => {
  await scenario()
  const { settlement } = await settle()
  await Beneficiary.updateOne({ _id: beneficiaries[1] }, { settlementMode: 'PAIE', defaultAccountCode: '706000' })
  await ChartOfAccount.updateOne({ code: '604000' }, { code: '604100', label: 'Nouveau libellé' })
  const results = await Promise.allSettled([reverse(settlement._id, 'annulation'), reverse(settlement._id)])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  const reversal = (await ShareSettlement.findOne({ kind: 'REVERSAL' }))!
  expect(reversal).toMatchObject({ htCents: -11666, vatCents: -2333, mode: 'BANQUE' })
  const originalLines = await AccountingLine.find({ entry: settlement.entry }).sort({ sortIndex: 1 })
  const reversedLines = await AccountingLine.find({ entry: reversal.entry }).sort({ sortIndex: 1 })
  expect(reversedLines.map((line) => [line.accountCode, line.debit, line.credit])).toEqual(
    originalLines.map((line) => [line.accountCode, line.credit, line.debit]),
  )
  expect(reversedLines[0]!.date).toEqual(reversal.paidAt)
  expect(reversal.paidAt.getTime()).toBeGreaterThan(paidAt.getTime())
  expect(await beneficiaryStatementFor(String(beneficiaries[1]))).toMatchObject({
    dueCents: 27287,
    paidCents: 0,
    remainingCents: 27287,
  })
  expect(await projectFinanceSummary(projectId)).toMatchObject({ directCostsCents: 0 })
  await expect(reverse(settlement._id)).rejects.toMatchObject({ status: 409 })
  expect((await reverse(settlement._id, reversal.idempotencyKey)).alreadyExisted).toBe(true)
})

it('annule toute la transaction si la trace métier ne peut être enregistrée', async () => {
  await scenario()
  const before = await AccountingEntry.countDocuments()
  const sequences = await Sequence.find().lean()
  const save = vi.spyOn(ShareSettlement.prototype, 'save').mockRejectedValueOnce(new Error('Trace refusée'))
  try {
    await expect(settle()).rejects.toThrow('Trace refusée')
  } finally {
    save.mockRestore()
  }
  expect(await AccountingEntry.countDocuments()).toBe(before)
  expect(await Sequence.find().lean()).toEqual(sequences)
  expect(await ShareSettlement.countDocuments()).toBe(0)
})

it('calcule les coûts depuis les lignes analytiques, sans compter les versements', async () => {
  await scenario()
  await settle()
  const { cost: recorded } = await cost()
  expect(await AccountingEntry.findById(recorded.entry)).toMatchObject({
    journalCode: 'AC',
    status: 'VALIDATED',
    idempotencyKey: `cost:${recorded._id}`,
  })
  const lines = await AccountingLine.find({ entry: recorded.entry }).sort({ sortIndex: 1 })
  expect(lines.map((line) => [line.accountCode, line.debit, line.credit, String(line.project)])).toEqual([
    ['604000', 200, 0, projectId],
    ['44566', 40, 0, 'null'],
    ['401000', 0, 240, 'null'],
  ])
  expect(await projectFinanceSummary(projectId)).toMatchObject({
    receivedHtCents: 87490,
    directCostsCents: 20000,
    marginCents: 67490,
  })
  const manual = await createEntry({
    journal: 'AC',
    date: paidAt,
    status: 'LOCKED',
    lines: [
      { account: '604000', debit: 0.29 },
      { account: '401000', credit: 0.29 },
    ],
  })
  await request(app)
    .patch(`/accounting/lines/${manual.lines[0]!._id}/project`)
    .set('Cookie', cookie)
    .send({ projectId })
    .expect(200)
  expect(await projectFinanceSummary(projectId)).toMatchObject({ directCostsCents: 20029, marginCents: 67461 })
  const correction = await createEntry({
    journal: 'AC',
    date: paidAt,
    status: 'VALIDATED',
    lines: [
      { account: '604000', credit: 0.19, project: projectId },
      { account: '401000', debit: 0.19 },
    ],
  })
  expect(await projectFinanceSummary(projectId)).toMatchObject({ directCostsCents: 20010, marginCents: 67480 })
  await AccountingEntry.updateOne({ _id: correction.entry._id }, { archivedAt: new Date() })
  await AccountingEntry.updateOne({ _id: manual.entry._id }, { archivedAt: new Date() })
  await createEntry({
    journal: 'AC',
    date: paidAt,
    lines: [
      { account: '604000', debit: 5, project: projectId },
      { account: '401000', credit: 5 },
    ],
  })
  expect(await projectFinanceSummary(projectId)).toMatchObject({ directCostsCents: 20000 })
  await request(app)
    .patch(`/accounting/lines/${lines[0]!._id}/project`)
    .set('Cookie', cookie)
    .send({ projectId: null })
    .expect(200)
  const summary = await projectFinanceSummary(projectId)
  expect(summary.directCostsCents).toBe(0)
  expect(summary.beneficiaries.reduce((sum, row) => sum + row.dueCents, 0)).toBe(87490)
  expect(summary.beneficiaries.find((row) => String(row.beneficiary) === String(beneficiaries[1]))).toMatchObject({
    paidCents: 11666,
    remainingCents: 15621,
  })
  expect(await AuditLog.countDocuments({ action: 'ACCOUNTING_LINE_PROJECT_UPDATE' })).toBe(2)
})

it('interdit de modifier les traces monétaires enregistrées', async () => {
  await scenario()
  const { settlement } = await settle()
  const { cost: recorded } = await cost()
  settlement.htCents = 1
  recorded.htCents = 1
  await expect(settlement.save()).rejects.toThrow(/immuable/)
  await expect(recorded.save()).rejects.toThrow(/immuable/)
  await expect(ShareSettlement.updateOne({ _id: settlement._id }, { htCents: 1 })).rejects.toThrow(/immuable/)
  await expect(ProjectCost.findOneAndUpdate({ _id: recorded._id }, { htCents: 1 })).rejects.toThrow(/immuable/)
  expect((await ShareSettlement.findById(settlement._id))!.htCents).toBe(11666)
  expect((await ProjectCost.findById(recorded._id))!.htCents).toBe(20000)
})

it('interdit les rattachements des produits et versements et les coûts hors classe 6 active', async () => {
  await scenario()
  const { settlement } = await settle()
  const line = (await AccountingLine.findOne({ entry: settlement.entry, accountCode: '604000' }))!
  await request(app)
    .patch(`/accounting/lines/${line._id}/project`)
    .set('Cookie', cookie)
    .send({ projectId })
    .expect(409)
  const sale = await createEntry({
    journal: 'AC',
    date: paidAt,
    lines: [
      { account: '411000', debit: 10 },
      { account: '706000', credit: 10 },
    ],
  })
  await request(app)
    .patch(`/accounting/lines/${sale.lines[1]!._id}/project`)
    .set('Cookie', cookie)
    .send({ projectId })
    .expect(400)
  await expect(cost({ accountCode: '706000' })).rejects.toMatchObject({ status: 400 })
  await ChartOfAccount.updateOne({ code: '604000' }, { isActive: false })
  await expect(cost()).rejects.toMatchObject({ status: 400 })
})

it('cloisonne le relevé personnel et refuse les écritures sans permission comptable', async () => {
  await scenario()
  const commercial = await User.create({
    name: 'Commercial',
    email: 'commercial@example.test',
    passwordHash: 'unused',
    role: 'COMMERCIAL',
  })
  await Beneficiary.updateOne({ _id: beneficiaries[0] }, { user: commercial._id })
  await settle(2000, { beneficiaryId: String(beneficiaries[0]), vatCents: 0 })
  await settle()
  const ownCookie = `venio_session=${(await createSession(String(commercial._id))).token}`
  const response = await request(app).get('/accounting/me/statement').set('Cookie', ownCookie).expect(200)
  expect(response.body).toMatchObject({ dueCents: 8748, paidCents: 2000, remainingCents: 6748 })
  expect(response.body.allocations).toHaveLength(4)
  expect(response.body.allocations.map((row: { amountCents: number }) => row.amountCents)).toEqual([
    3333, 3333, 3332, -1250,
  ])
  expect(response.body.allocations[0]).toMatchObject({ invoiceNumber: 'FAC-EXEMPLE', project: { name: 'Projet Démo' } })
  expect(response.body.settlements).toHaveLength(1)
  const serialized = JSON.stringify(response.body)
  for (const id of beneficiaries.slice(1)) expect(serialized).not.toContain(String(id))
  expect(response.body).not.toHaveProperty('summary')
  expect(response.body.projects[0]).not.toHaveProperty('receivedHtCents')
  await request(app).get('/accounting/me/statement').set('Cookie', cookie).expect(404)
  await request(app).get(`/accounting/beneficiaries/${beneficiaries[1]}/statement`).set('Cookie', ownCookie).expect(403)
  await request(app)
    .post(`/accounting/beneficiaries/${beneficiaries[0]}/settlements`)
    .set('Cookie', ownCookie)
    .send({})
    .expect(403)
  await request(app).post(`/accounting/projects/${projectId}/costs`).set('Cookie', ownCookie).send({}).expect(403)
})

it('audite les écritures de l’espace après leur commit', async () => {
  await scenario()
  const response = await request(app)
    .post(`/accounting/beneficiaries/${beneficiaries[1]}/settlements`)
    .set('Cookie', cookie)
    .send({ htCents: 11666, vatCents: 2333, paidAt, invoiceRef: 'FL-0042', projectId, idempotencyKey: 'route' })
    .expect(201)
  await request(app)
    .post(`/accounting/settlements/${response.body.settlement._id}/reversal`)
    .set('Cookie', cookie)
    .send({ reason: 'Erreur', idempotencyKey: 'route-annulation' })
    .expect(201)
  await request(app)
    .post(`/accounting/projects/${projectId}/costs`)
    .set('Cookie', cookie)
    .send({
      accountCode: '604000',
      label: 'Licences',
      supplier: 'Éditeur',
      htCents: 20000,
      vatCents: 4000,
      date: paidAt,
      idempotencyKey: 'route-cout',
    })
    .expect(201)
  expect(
    await AuditLog.countDocuments({
      action: { $in: ['SHARE_SETTLEMENT_CREATE', 'SHARE_SETTLEMENT_REVERSE', 'PROJECT_COST_CREATE'] },
    }),
  ).toBe(3)
})
