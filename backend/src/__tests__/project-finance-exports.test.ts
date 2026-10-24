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
import * as financeExports from '../lib/projectFinance/exports.js'
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

const get = (path: string, session = cookie) => request(app).get(`/accounting/exports/${path}`).set('Cookie', session)

it('exporte toutes les parts, société comprise, avec le HT net et les montants français', async () => {
  await scenario()
  await recordPayment({
    invoiceId,
    amountTtcCents: 15000,
    receivedAt: '2026-01-21',
    method: 'CB',
    userId,
    idempotencyKey: crypto.randomUUID(),
  })
  const otherProject = await Project.create({ name: 'Autre projet', client: clientId })
  const response = await get(`payments.csv?from=2026-01-01&to=2026-01-20&projectId=${projectId}`)
  expect(response.status).toBe(200)
  expect(response.headers['content-type']).toBe('text/csv; charset=utf-8')
  expect(response.headers['content-disposition']).toMatch(/^attachment; filename="[a-z0-9_.-]+"$/)
  expect(response.text.charCodeAt(0)).toBe(0xfeff)
  const rows = response.text
    .trim()
    .split('\r\n')
    .slice(1)
    .map((line: string) => line.split(';'))
  const cents = (value: string) => Number(value.replace(',', ''))
  expect(rows).toHaveLength(24)
  expect(rows.reduce((sum: number, row: string[]) => sum + cents(row[9]!), 0)).toBe(87490)
  expect(
    rows
      .filter((row: string[]) => row[7] === 'Société')
      .reduce((sum: number, row: string[]) => sum + cents(row[6]!), 0),
  ).toBe(87490)
  expect(rows.some((row: string[]) => row[6] === '-125,00')).toBe(true)
  expect(rows.every((row: string[]) => /^-?\d+,\d{2}$/.test(row[5]!) && /^-?\d+,\d{2}$/.test(row[9]!))).toBe(true)
  const fullPayment = await get(`payments.csv?from=2026-01-01&to=2026-01-21&projectId=${projectId}`)
  expect(fullPayment.text).toContain('21/01/2026')
  expect((await get(`payments.csv?projectId=${otherProject._id}`)).text.trim().split('\r\n')).toHaveLength(1)
  await ShareAllocation.deleteMany({ payment: (await ProjectPayment.findOne({ kind: 'REFUND' }))!._id })
  expect((await get('payments.csv')).status).toBe(409)
})

it('exporte les versements, annulations et coûts directs sans perdre les signes', async () => {
  await scenario()
  const { settlement } = await settle()
  await reverseSettlement({
    settlementId: String(settlement._id),
    reason: 'Erreur',
    idempotencyKey: crypto.randomUUID(),
    userId,
  })
  await cost()
  const response = await get(`settlements-costs.csv?projectId=${projectId}`)
  expect(response.status).toBe(200)
  expect(response.text).toContain('Versement;15/02/2026')
  expect(response.text).toContain('Annulation;')
  expect(response.text).toContain('-116,66;-23,33;-139,99')
  expect(response.text).toContain('200,00;40,00;240,00')
})

it('cloisonne le PDF personnel et rend les totaux du relevé métier', async () => {
  await scenario()
  await settle()
  const commercial = await User.create({
    name: 'Commercial',
    email: 'commercial@example.test',
    passwordHash: 'unused',
    role: 'COMMERCIAL',
  })
  await Beneficiary.updateOne({ _id: beneficiaries[1] }, { user: commercial._id })
  const session = `venio_session=${(await createSession(String(commercial._id))).token}`
  const render = vi.spyOn(financeExports, 'renderStatementPdf')
  const expected = await beneficiaryStatementFor(String(beneficiaries[1]))
  const pdf = await get(`me/statement.pdf?beneficiaryId=${beneficiaries[0]}`, session)
  expect(pdf.status).toBe(200)
  expect(render).toHaveBeenLastCalledWith(expected, {})
  expect(render.mock.calls[0]![0]).toMatchObject({ dueCents: 27287, paidCents: 11666, remainingCents: 15621 })
  const limited = await get(`me/statement.pdf?from=2026-01-12&to=2026-01-20&projectId=${projectId}`, session)
  expect(limited.status).toBe(200)
  expect(render.mock.calls[1]![0]).toMatchObject({ dueCents: 15621, paidCents: 0, remainingCents: 15621 })
  expect(render.mock.calls[1]![0].allocations).toHaveLength(3)
  const adminPdf = await get(`beneficiaries/${beneficiaries[1]}/statement.pdf`)
  expect(adminPdf.status).toBe(200)
  expect(render).toHaveBeenLastCalledWith(expected, {})
  render.mockRestore()
  expect(pdf.headers['content-type']).toBe('application/pdf')
  expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF')
  expect((await get('payments.csv', session)).status).toBe(403)
  expect((await get('settlements-costs.csv', session)).status).toBe(403)
  expect((await get(`beneficiaries/${beneficiaries[0]}/statement.pdf`, session)).status).toBe(403)
  expect((await get(`projects/${projectId}/sheet.pdf`, session)).status).toBe(403)
  await Beneficiary.updateOne({ _id: beneficiaries[1] }, { user: null })
  expect((await get('me/statement.pdf', session)).status).toBe(404)
})

it('refuse les dates invalides et accepte la borne de fin incluse', async () => {
  for (const query of [
    'from=2026-02-30',
    'to=2026-13-01',
    'from=25/01/2026',
    'from=2026-02-01&to=2026-01-01',
    'from=',
    'from=2026-01-01&from=2026-01-02',
  ]) {
    expect((await get(`payments.csv?${query}`)).status, query).toBe(400)
  }
  await recordPayment({
    invoiceId,
    amountTtcCents: 119988,
    receivedAt: '2026-01-10T23:59:59.999Z',
    method: 'CB',
    userId,
    idempotencyKey: crypto.randomUUID(),
  })
  const response = await get('payments.csv?from=2026-01-10&to=2026-01-10')
  expect(response.status).toBe(200)
  expect(response.text).toContain(';1199,88;999,90;')
  expect((await get('payments.csv?from=2026-01-11')).text.trim().split('\r\n')).toHaveLength(1)
  expect(await projectFinanceSummary(projectId, { from: new Date('2026-01-11') })).toMatchObject({
    receivedHtCents: 0,
    directCostsCents: 0,
  })
  const sheet = await get(`projects/${projectId}/sheet.pdf`)
  expect(sheet.status, JSON.stringify(sheet.body)).toBe(200)
  expect(sheet.body.subarray(0, 4).toString()).toBe('%PDF')
})
